'use strict';

// Layer 13 — Scoring Aggregation
// Produces three independent axes (never blended into a single number):
//   Axis A — AI Slop Risk (0-100)
//   Axis B — Security Exposure Risk (0-100)
//   Axis C — Code Quality Risk (0-100)
// Per-file score with breakdown + project-level aggregate weighted by role and size.

// ---------------------------------------------------------------------------
// Category → Axis mapping
// ---------------------------------------------------------------------------
// Axis A: AI-generated code signatures (slop detection)
// Axis B: Security & exposure risks
// Axis C: Code quality & maintainability

var AXIS_A_CATEGORIES = {
  'slopsquatting':    1.0,
  'context-confusion': 1.0,
  'over-engineering': 0.8,
  'verbosity':        0.7,
  'dead-code':        0.6,
  'debug-pollution':  0.5,
  'scaffold-residue': 0.9,
  'comment-mismatch': 0.8,
  'clone-pollution':  0.9,
  'type-theater':     0.7,
  'test-theater':     0.8,
  'branch-symmetry':  0.6,
  'accessor-bloat':   0.6,
  'interface-bloat':  0.5,
  'naming-entropy':   0.7,
};

var AXIS_B_CATEGORIES = {
  'security':         1.0,
  'config-exposure':  0.9,
  'dependency':       0.7,
  'slopsquatting':    0.3,   // supply chain risk component
};

var AXIS_C_CATEGORIES = {
  'error-handling':    1.0,
  'async-abuse':       0.9,
  'structure-smell':   0.8,
  'complexity-spike':  0.9,
  'magic-values':      0.7,
  'import-hygiene':    0.6,
  'promise-graveyard': 0.9,
  'dead-code':         0.4,  // quality component
  'debug-pollution':   0.4,
  'over-engineering':  0.3,
  'verbosity':         0.3,
};

// ---------------------------------------------------------------------------
// Axis signal weights (per-file)
// ---------------------------------------------------------------------------
// Each axis draws from pattern hits, compression, findings, and URL findings.
// Weights define contribution proportions, normalised internally.

var AXIS_A_WEIGHTS = {
  compression:  0.40,   // compression texture is the strongest slop indicator
  patterns:     0.35,   // known AI code patterns
  findings:     0.15,   // string pipeline (high-entropy values etc.)
  urls:         0.10,
};

var AXIS_B_WEIGHTS = {
  findings:     0.45,   // secrets in code are the primary security signal
  patterns:     0.25,   // security-category pattern rules
  urls:         0.20,   // internal URLs, sensitive paths
  compression:  0.10,
};

var AXIS_C_WEIGHTS = {
  patterns:     0.55,   // quality rules dominate this axis
  compression:  0.20,   // very repetitive code is low quality
  findings:     0.10,
  urls:         0.15,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _clamp(val) {
  if (val < 0) return 0;
  if (val > 100) return 100;
  return Math.round(val * 10) / 10;
}

// Compute a weighted severity score from pattern hits for a given axis mapping.
// Returns 0-100 scaled relative to lines of code.
function _patternAxisScore(hits, axisMap, multipliers, lineCount) {
  if (!hits || hits.length === 0 || lineCount === 0) return 0;
  var total = 0;
  for (var i = 0; i < hits.length; i++) {
    var hit = hits[i];
    var weight = axisMap[hit.category];
    if (typeof weight !== 'number') continue;
    var mult = (multipliers && typeof multipliers[hit.category] === 'number')
      ? multipliers[hit.category] : 1;
    // severity (1-10) * axis weight * calibration multiplier
    total += (hit.severity || 1) * weight * mult;
  }
  // Normalise by LOC: 1 sev-10 hit per 10 lines → 100; scale linearly
  var density = total / lineCount;
  return Math.min(density * 100, 100);
}

// Score from string-pipeline findings for a given axis.
function _findingsAxisScore(findings, isSecurityAxis) {
  if (!findings || findings.length === 0) return 0;
  var total = 0;
  for (var i = 0; i < findings.length; i++) {
    var f = findings[i];
    // HIGH confidence findings contribute more
    var confWeight = f.confidence === 'HIGH' ? 1.0 : 0.6;
    var score = (f.pipelineScore || 0) * confWeight;
    if (isSecurityAxis) {
      // Security axis weighs findings heavily
      total += score * 10;
    } else {
      total += score * 5;
    }
  }
  return Math.min(total, 100);
}

// Score from compression analysis for a file.
function _compressionAxisScore(comp) {
  if (!comp || typeof comp.compressionScore !== 'number') return 0;
  return Math.min(comp.compressionScore, 100);
}

// Score from URL findings.
function _urlAxisScore(urlFindings, isSecurityAxis) {
  if (!urlFindings || urlFindings.length === 0) return 0;
  var total = 0;
  for (var i = 0; i < urlFindings.length; i++) {
    var u = urlFindings[i];
    var classScore = 0;
    if (u.classification === 'internal-exposed') classScore = isSecurityAxis ? 20 : 5;
    else if (u.classification === 'sensitive-parameter') classScore = isSecurityAxis ? 30 : 8;
    else if (u.classification === 'suspicious-external') classScore = isSecurityAxis ? 15 : 10;
    // Query findings add to score
    if (u.queryFindings && u.queryFindings.length > 0) {
      classScore += isSecurityAxis ? 15 * u.queryFindings.length : 5;
    }
    total += classScore;
  }
  return Math.min(total, 100);
}

// Combine sub-scores using axis weights.
function _weightedAxis(subScores, weights) {
  var sum = 0;
  var keys = Object.keys(weights);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    sum += (subScores[key] || 0) * weights[key];
  }
  return sum;
}

// Estimate file line count from surface data or candidates.
function _lineCount(record) {
  if (record.surface && typeof record.surface.avgLineLength === 'number' &&
      record.surface.avgLineLength > 0 && typeof record.size === 'number') {
    return Math.max(Math.round(record.size / record.surface.avgLineLength), 1);
  }
  return Math.max(record.size || 100, 1);
}

// File role weight for project aggregation: application code weighs more
// than test/config/vendor files.
function _roleWeight(record) {
  var territory = record.territory || 'application';
  if (territory === 'vendor' || territory === 'dist' || territory === 'node_modules') return 0.1;
  if (territory === 'test') return 0.5;
  if (territory === 'config') return 0.6;
  return 1.0;
}

// ---------------------------------------------------------------------------
// Per-file scoring
// ---------------------------------------------------------------------------

function _scoreFile(record, calibration) {
  var multipliers = (calibration && calibration.confidenceMultipliers) || {};
  var lines = _lineCount(record);

  // Axis A sub-scores
  var aPat  = _patternAxisScore(record.patternHits, AXIS_A_CATEGORIES, multipliers, lines);
  var aComp = _compressionAxisScore(record.compression);
  var aFind = _findingsAxisScore(record.findings, false);
  var aUrl  = _urlAxisScore(record.urlFindings, false);
  var axisA = _weightedAxis({ patterns: aPat, compression: aComp, findings: aFind, urls: aUrl }, AXIS_A_WEIGHTS);

  // Axis B sub-scores
  var bPat  = _patternAxisScore(record.patternHits, AXIS_B_CATEGORIES, multipliers, lines);
  var bComp = _compressionAxisScore(record.compression) * 0.3; // compression contributes little to security
  var bFind = _findingsAxisScore(record.findings, true);
  var bUrl  = _urlAxisScore(record.urlFindings, true);
  var axisB = _weightedAxis({ patterns: bPat, compression: bComp, findings: bFind, urls: bUrl }, AXIS_B_WEIGHTS);

  // Axis C sub-scores
  var cPat  = _patternAxisScore(record.patternHits, AXIS_C_CATEGORIES, multipliers, lines);
  var cComp = _compressionAxisScore(record.compression) * 0.5; // repetitive code = low quality
  var cFind = _findingsAxisScore(record.findings, false);
  var cUrl  = _urlAxisScore(record.urlFindings, false);
  var axisC = _weightedAxis({ patterns: cPat, compression: cComp, findings: cFind, urls: cUrl }, AXIS_C_WEIGHTS);

  return {
    path: record.relativePath || record.path,
    axes: {
      A: _clamp(axisA),
      B: _clamp(axisB),
      C: _clamp(axisC),
    },
    breakdown: {
      A: { patterns: _clamp(aPat), compression: _clamp(aComp), findings: _clamp(aFind), urls: _clamp(aUrl) },
      B: { patterns: _clamp(bPat), compression: _clamp(bComp), findings: _clamp(bFind), urls: _clamp(bUrl) },
      C: { patterns: _clamp(cPat), compression: _clamp(cComp), findings: _clamp(cFind), urls: _clamp(cUrl) },
    },
    lineCount: lines,
    roleWeight: _roleWeight(record),
  };
}

// ---------------------------------------------------------------------------
// Project-level aggregation
// ---------------------------------------------------------------------------

function _aggregateProject(perFile) {
  if (perFile.length === 0) {
    return { axes: { A: 0, B: 0, C: 0 }, totalLines: 0, fileCount: 0 };
  }

  var totalWeight = 0;
  var sumA = 0, sumB = 0, sumC = 0;
  var totalLines = 0;

  for (var i = 0; i < perFile.length; i++) {
    var pf = perFile[i];
    var w = pf.roleWeight * pf.lineCount;
    totalWeight += w;
    sumA += pf.axes.A * w;
    sumB += pf.axes.B * w;
    sumC += pf.axes.C * w;
    totalLines += pf.lineCount;
  }

  if (totalWeight === 0) totalWeight = 1;

  return {
    axes: {
      A: _clamp(sumA / totalWeight),
      B: _clamp(sumB / totalWeight),
      C: _clamp(sumC / totalWeight),
    },
    totalLines: totalLines,
    fileCount: perFile.length,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function computeAxes(registry, calibration) {
  var perFile = [];
  for (var i = 0; i < registry.length; i++) {
    perFile.push(_scoreFile(registry[i], calibration));
  }
  var project = _aggregateProject(perFile);

  return {
    axes: project.axes,
    perFile: perFile,
    project: project,
  };
}

module.exports = {
  computeAxes:          computeAxes,
  // Expose internals for testing
  _patternAxisScore:    _patternAxisScore,
  _findingsAxisScore:   _findingsAxisScore,
  _compressionAxisScore: _compressionAxisScore,
  _urlAxisScore:        _urlAxisScore,
  _weightedAxis:        _weightedAxis,
  _scoreFile:           _scoreFile,
  _clamp:               _clamp,
  _roleWeight:          _roleWeight,
  AXIS_A_CATEGORIES:    AXIS_A_CATEGORIES,
  AXIS_B_CATEGORIES:    AXIS_B_CATEGORIES,
  AXIS_C_CATEGORIES:    AXIS_C_CATEGORIES,
};
