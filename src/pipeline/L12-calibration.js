'use strict';

// Layer 12 — Project-Level Statistical Calibration
//
// Problem: a project with a consistently high self-compression ratio (e.g. all files
// are config-heavy) would have every file scored as "AI-like" by global baselines.
// This layer recalibrates all upstream signals using the project's own distribution,
// so only genuine outliers within *this* project are flagged.
//
// Three calibration steps:
//   1. Entropy MAD — Median Absolute Deviation of per-file entropy signals.
//      Findings whose entropy is within 1 MAD of the project median are downgraded.
//   2. Compression baseline — project median of self-compression ratios. Files within
//      the normal range (median ± 1.5 MAD) get their texture score zeroed.
//   3. Bayesian weighting — small projects (< 10 files) trust global baselines more;
//      large projects (≥ 100 files) self-calibrate fully. In between: linear blend.
//
// Also propagates confidence multipliers onto all findings and stores the
// calibration result for Layer 13 scoring.

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

function _median(sorted) {
  var n = sorted.length;
  if (n === 0) return 0;
  var mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function _mad(sorted, median) {
  if (sorted.length === 0) return 0;
  var deviations = [];
  for (var i = 0; i < sorted.length; i++) {
    deviations.push(Math.abs(sorted[i] - median));
  }
  deviations.sort(function (a, b) { return a - b; });
  return _median(deviations);
}

function _sortedNumbers(arr) {
  var copy = arr.slice();
  copy.sort(function (a, b) { return a - b; });
  return copy;
}

// ---------------------------------------------------------------------------
// Signal collectors — gather numeric signals from per-file records
// ---------------------------------------------------------------------------

// Collect entropy values from findings across all files.
// Each finding may have a pipelineScore or maxPipelineScore.
function _collectEntropies(registry) {
  var values = [];
  for (var i = 0; i < registry.length; i++) {
    var findings = registry[i].findings || [];
    for (var f = 0; f < findings.length; f++) {
      var score = findings[f].pipelineScore;
      if (typeof score === 'number' && !isNaN(score)) {
        values.push(score);
      }
    }
  }
  return values;
}

// Collect self-compression ratios from per-file compression results.
function _collectCompressionRatios(registry) {
  var values = [];
  for (var i = 0; i < registry.length; i++) {
    var comp = registry[i].compression || {};
    var ratio = comp.selfRatio;
    if (typeof ratio === 'number' && !isNaN(ratio)) {
      values.push(ratio);
    }
  }
  return values;
}

// ---------------------------------------------------------------------------
// Bayesian blend weight
// ---------------------------------------------------------------------------

// Returns a weight 0..1 indicating how much the project should self-calibrate.
// < 10 files → 0 (trust global baselines entirely)
// ≥ 100 files → 1 (full self-calibration)
// Between → linear interpolation
var SMALL_PROJECT = 10;
var LARGE_PROJECT = 100;

function _selfCalibrationWeight(fileCount) {
  if (fileCount <= SMALL_PROJECT) return 0;
  if (fileCount >= LARGE_PROJECT) return 1;
  return (fileCount - SMALL_PROJECT) / (LARGE_PROJECT - SMALL_PROJECT);
}

// ---------------------------------------------------------------------------
// Confidence multiplier calculation
// ---------------------------------------------------------------------------

// Compute per-category confidence multipliers based on pattern-hit density.
// If a category fires on > 30% of files, its findings are likely stylistic
// for this project, not AI slop → downweight.
function _computeConfidenceMultipliers(registry) {
  var totalFiles = registry.length;
  if (totalFiles === 0) return {};

  var catFileCount = {}; // category → set-size of files that have at least one hit

  for (var i = 0; i < registry.length; i++) {
    var hits = registry[i].patternHits || [];
    var seenCats = {};
    for (var h = 0; h < hits.length; h++) {
      var cat = hits[h].category || 'unknown';
      if (!seenCats[cat]) {
        seenCats[cat] = true;
        catFileCount[cat] = (catFileCount[cat] || 0) + 1;
      }
    }
  }

  var multipliers = {};
  var cats = Object.keys(catFileCount);
  for (var c = 0; c < cats.length; c++) {
    var density = catFileCount[cats[c]] / totalFiles;
    if (density > 0.5) {
      multipliers[cats[c]] = 0.5;  // very common → halve severity weight
    } else if (density > 0.3) {
      multipliers[cats[c]] = 0.75; // common → reduce by 25%
    } else {
      multipliers[cats[c]] = 1.0;  // normal → full weight
    }
  }

  return multipliers;
}

// ---------------------------------------------------------------------------
// Finding recalibration — mutate confidence tiers
// ---------------------------------------------------------------------------

// Downgrade findings that sit within the project's normal entropy range.
// "Within normal" = pipelineScore is within 1 MAD of the entropy median,
// blended by the self-calibration weight.
function _recalibrate(registry, entropyMedian, entropyMAD, selfWeight) {
  var lowerBound = entropyMedian - entropyMAD;
  var upperBound = entropyMedian + entropyMAD;

  for (var i = 0; i < registry.length; i++) {
    var findings = registry[i].findings || [];
    for (var f = 0; f < findings.length; f++) {
      var finding = findings[f];
      var score = finding.pipelineScore;
      if (typeof score !== 'number') continue;

      // If this finding's score is within the project's normal band,
      // blend towards downgrade proportional to selfWeight.
      if (score >= lowerBound && score <= upperBound && selfWeight > 0) {
        if (finding.confidence === 'HIGH') {
          finding.confidence = selfWeight >= 0.5 ? 'MEDIUM' : 'HIGH';
          finding.calibrated = true;
        } else if (finding.confidence === 'MEDIUM') {
          finding.confidence = selfWeight >= 0.5 ? 'UNCERTAIN' : 'MEDIUM';
          finding.calibrated = true;
        }
      }
    }
  }
}

// Recalibrate compression-texture scores: files within the project-normal
// compression range get their texture score zeroed.
function _recalibrateCompression(registry, compMedian, compMAD, selfWeight) {
  if (selfWeight === 0) return;

  var lowerBound = compMedian - 1.5 * compMAD;
  var upperBound = compMedian + 1.5 * compMAD;

  for (var i = 0; i < registry.length; i++) {
    var comp = registry[i].compression || {};
    if (typeof comp.selfRatio !== 'number') continue;

    if (comp.selfRatio >= lowerBound && comp.selfRatio <= upperBound) {
      // Within normal range for this project → zero the outlier score
      comp.projectOutlierScore = 0;
      comp.calibrated = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

function calibrate(registry) {
  if (!Array.isArray(registry) || registry.length === 0) {
    return {
      entropyMAD: 0,
      entropyMedian: 0,
      compressionBaseline: 0,
      compressionMAD: 0,
      selfCalibrationWeight: 0,
      confidenceMultipliers: {},
    };
  }

  // 1. Entropy distribution
  var entropies = _sortedNumbers(_collectEntropies(registry));
  var entropyMedian = _median(entropies);
  var entropyMAD = _mad(entropies, entropyMedian);

  // 2. Compression distribution
  var compressions = _sortedNumbers(_collectCompressionRatios(registry));
  var compMedian = _median(compressions);
  var compMAD = _mad(compressions, compMedian);

  // 3. Bayesian self-calibration weight
  var selfWeight = _selfCalibrationWeight(registry.length);

  // 4. Confidence multipliers per category
  var confidenceMultipliers = _computeConfidenceMultipliers(registry);

  // 5. Mutate: recalibrate findings
  _recalibrate(registry, entropyMedian, entropyMAD, selfWeight);

  // 6. Mutate: recalibrate compression outlier scores
  _recalibrateCompression(registry, compMedian, compMAD, selfWeight);

  return {
    entropyMAD:             entropyMAD,
    entropyMedian:          entropyMedian,
    compressionBaseline:    compMedian,
    compressionMAD:         compMAD,
    selfCalibrationWeight:  selfWeight,
    confidenceMultipliers:  confidenceMultipliers,
  };
}

module.exports = {
  calibrate:                     calibrate,
  _median:                       _median,
  _mad:                          _mad,
  _selfCalibrationWeight:        _selfCalibrationWeight,
  _computeConfidenceMultipliers: _computeConfidenceMultipliers,
  SMALL_PROJECT:                 SMALL_PROJECT,
  LARGE_PROJECT:                 LARGE_PROJECT,
};
