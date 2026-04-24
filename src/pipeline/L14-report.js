'use strict';

// Layer 14 — Report Assembly
// Assembles the structured report object consumed by Layer 15 for rendering.
// Sections: exposure, secrets, slop breakdown, pattern hits, clean files,
//           project summary, review bucket (UNCERTAIN findings only).

// ---------------------------------------------------------------------------
// Verdict thresholds (per-axis)
// ---------------------------------------------------------------------------
var VERDICTS = [
  { max: 0,   label: 'Clean' },
  { max: 10,  label: 'Minimal' },
  { max: 25,  label: 'Some issues' },
  { max: 50,  label: 'Concerning' },
  { max: 75,  label: 'Heavy' },
  { max: 100, label: 'Critical' },
];

function _verdict(score) {
  for (var i = 0; i < VERDICTS.length; i++) {
    if (score <= VERDICTS[i].max) return VERDICTS[i].label;
  }
  return 'Critical';
}

// ---------------------------------------------------------------------------
// Category → primary axis (mirrors the dominant weight in L13)
// ---------------------------------------------------------------------------
var _AXIS_B_CATS = { 'security': 1, 'config-exposure': 1, 'dependency': 1 };
var _AXIS_C_CATS = {
  'error-handling': 1, 'async-abuse': 1, 'structure-smell': 1,
  'complexity-spike': 1, 'magic-values': 1, 'import-hygiene': 1, 'promise-graveyard': 1,
};

function _axisForCategory(cat) {
  if (_AXIS_B_CATS[cat]) return 'B';
  if (_AXIS_C_CATS[cat]) return 'C';
  return 'A';
}

// ---------------------------------------------------------------------------
// Collect secrets from findings across all files
// ---------------------------------------------------------------------------
function _collectSecrets(registry) {
  var secrets = [];
  for (var i = 0; i < registry.length; i++) {
    var rec = registry[i];
    var findings = rec.findings || [];
    for (var j = 0; j < findings.length; j++) {
      var f = findings[j];
      secrets.push({
        value:      _maskValue(f.value),
        file:       rec.relativePath || rec.path,
        lineNumber: (f.lineIndex || 0) + 1,
        axis:       'B',
        ruleId:     null,
        confidence: f.confidence,
        signals:    f.signalCount || 0,
        shape:      f.shape || 'mixed',
        valueLength: f.valueLength || 0,
        charFreqSignal:    f.charFreqSignal,
        bigramSignal:      f.bigramSignal,
        compressionSignal: f.compressionSignal,
      });
    }
  }
  return secrets;
}

// Mask a secret value: show first 4 and last 2 chars, rest as asterisks
function _maskValue(val) {
  if (!val || val.length <= 8) return '********';
  return val.slice(0, 4) + '*'.repeat(Math.max(val.length - 6, 4)) + val.slice(-2);
}

// ---------------------------------------------------------------------------
// Collect exposure items (URLs with security implications)
// ---------------------------------------------------------------------------
function _collectExposure(registry) {
  var exposure = [];
  for (var i = 0; i < registry.length; i++) {
    var rec = registry[i];
    var urls = rec.urlFindings || [];
    for (var j = 0; j < urls.length; j++) {
      var u = urls[j];
      if (u.classification === 'safe-external') continue;
      exposure.push({
        value:          u.url,   // URL is already public in source — no masking
        url:            u.url,
        classification: u.classification,
        file:           rec.relativePath || rec.path,
        lineNumber:     (u.lineIndex || 0) + 1,
        axis:           'B',
        ruleId:         null,
        internal:       u.internal || false,
        sensitivePath:  u.sensitivePath || false,
        querySecrets:   (u.queryFindings || []).length,
      });
    }
  }
  return exposure;
}

// ---------------------------------------------------------------------------
// Collect pattern hits grouped by category for slop breakdown
// ---------------------------------------------------------------------------
function _collectSlopBreakdown(registry) {
  var byCat = {};
  for (var i = 0; i < registry.length; i++) {
    var rec = registry[i];
    var hits = rec.patternHits || [];
    for (var j = 0; j < hits.length; j++) {
      var h = hits[j];
      if (!byCat[h.category]) {
        byCat[h.category] = { category: h.category, count: 0, files: {}, topSeverity: 0 };
      }
      byCat[h.category].count++;
      byCat[h.category].files[rec.relativePath || rec.path] = true;
      if (h.severity > byCat[h.category].topSeverity) {
        byCat[h.category].topSeverity = h.severity;
      }
    }
  }
  var breakdown = [];
  var cats = Object.keys(byCat);
  for (var k = 0; k < cats.length; k++) {
    var entry = byCat[cats[k]];
    breakdown.push({
      category:    entry.category,
      hitCount:    entry.count,
      fileCount:   Object.keys(entry.files).length,
      topSeverity: entry.topSeverity,
    });
  }
  // Sort by hit count descending
  breakdown.sort(function (a, b) { return b.hitCount - a.hitCount; });
  return breakdown;
}

// ---------------------------------------------------------------------------
// Collect all pattern hits (flat list)
// ---------------------------------------------------------------------------
function _collectPatternHits(registry) {
  var hits = [];
  for (var i = 0; i < registry.length; i++) {
    var rec = registry[i];
    var ph = rec.patternHits || [];
    for (var j = 0; j < ph.length; j++) {
      hits.push({
        ruleId:     ph[j].ruleId,
        ruleName:   ph[j].ruleName,
        category:   ph[j].category,
        severity:   ph[j].severity,
        file:       rec.relativePath || rec.path,
        lineNumber: (ph[j].lineIndex || 0) + 1,
        axis:       _axisForCategory(ph[j].category),
        value:      ph[j].line || '',
        source:     ph[j].line,
        fix:        ph[j].fix,
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Identify clean files (no findings, no pattern hits, no risky URLs)
// ---------------------------------------------------------------------------
function _collectCleanFiles(registry, perFile) {
  var clean = [];
  for (var i = 0; i < registry.length; i++) {
    var rec = registry[i];
    var hasFindings = (rec.findings && rec.findings.length > 0);
    var hasPatterns = (rec.patternHits && rec.patternHits.length > 0);
    var hasUrls     = false;
    if (rec.urlFindings) {
      for (var u = 0; u < rec.urlFindings.length; u++) {
        if (rec.urlFindings[u].classification !== 'safe-external') { hasUrls = true; break; }
      }
    }
    if (!hasFindings && !hasPatterns && !hasUrls) {
      var pf = perFile && perFile[i];
      clean.push({
        file:  rec.relativePath || rec.path,
        axes:  pf ? pf.axes : { A: 0, B: 0, C: 0 },
      });
    }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Collect UNCERTAIN findings → review bucket
// ---------------------------------------------------------------------------
function _collectReview(registry) {
  var review = [];
  for (var i = 0; i < registry.length; i++) {
    var rec = registry[i];
    var rev = rec.review || [];
    for (var j = 0; j < rev.length; j++) {
      var r = rev[j];
      review.push({
        value:         r.value || '',    // raw — user needs this to triage FP vs real finding
        file:          rec.relativePath || rec.path,
        lineNumber:    (r.lineIndex || 0) + 1,
        axis:          'B',
        ruleId:        null,
        pipelineScore: r.pipelineScore || 0,
        signals:       r.signalCount || 0,
        shape:         r.shape || 'mixed',
        valueLength:   r.valueLength || 0,
        charFreqSignal:    r.charFreqSignal,
        bigramSignal:      r.bigramSignal,
        compressionSignal: r.compressionSignal,
      });
    }
  }
  return review;
}

// ---------------------------------------------------------------------------
// Project summary with verdicts
// ---------------------------------------------------------------------------
function _buildProjectSummary(scoringResult, correlation) {
  var axes = scoringResult.project.axes;
  return {
    fileCount:    scoringResult.project.fileCount,
    totalLines:   scoringResult.project.totalLines,
    axes:         axes,
    verdicts: {
      A: _verdict(axes.A),
      B: _verdict(axes.B),
      C: _verdict(axes.C),
    },
    correlation:  correlation || null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function assembleReport(scoringResult, registry, correlation) {
  var perFile = scoringResult.perFile || [];

  return {
    exposure:       _collectExposure(registry),
    secrets:        _collectSecrets(registry),
    slopBreakdown:  _collectSlopBreakdown(registry),
    patternHits:    _collectPatternHits(registry),
    cleanFiles:     _collectCleanFiles(registry, perFile),
    projectSummary: _buildProjectSummary(scoringResult, correlation),
    review:         _collectReview(registry),
    perFile:        perFile,
  };
}

module.exports = {
  assembleReport:        assembleReport,
  // Expose for testing
  _verdict:              _verdict,
  _maskValue:            _maskValue,
  _axisForCategory:      _axisForCategory,
  _collectSecrets:       _collectSecrets,
  _collectExposure:      _collectExposure,
  _collectSlopBreakdown: _collectSlopBreakdown,
  _collectPatternHits:   _collectPatternHits,
  _collectCleanFiles:    _collectCleanFiles,
  _collectReview:        _collectReview,
  _buildProjectSummary:  _buildProjectSummary,
  VERDICTS:              VERDICTS,
};
