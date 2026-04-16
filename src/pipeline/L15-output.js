'use strict';

// Layer 15 — Output Formatting
// Renders the report from Layer 14 to either CLI (ANSI colour) or JSON.
// Handles --verbose (contributing signals per finding), --json, --axis filter,
// --threshold override, exit code logic, and roast messages.

// ---------------------------------------------------------------------------
// ANSI escape codes
// ---------------------------------------------------------------------------
var RESET   = '\x1b[0m';
var BOLD    = '\x1b[1m';
var DIM     = '\x1b[2m';
var RED     = '\x1b[31m';
var GREEN   = '\x1b[32m';
var YELLOW  = '\x1b[33m';
var CYAN    = '\x1b[36m';
var WHITE   = '\x1b[37m';
var BG_RED  = '\x1b[41m';
var BG_GREEN = '\x1b[42m';

// ---------------------------------------------------------------------------
// Roast messages — per axis + combined
// ---------------------------------------------------------------------------
var ROASTS_A = [
  { max: 10,  msg: 'Looking clean. Your tech lead would be proud.' },
  { max: 25,  msg: 'A little sloppy, but nothing a quick review can\'t fix.' },
  { max: 50,  msg: 'This code has that unmistakable AI aftertaste.' },
  { max: 75,  msg: 'Did you even read what the AI wrote before committing?' },
  { max: 100, msg: 'This is pure, uncut AI slop. Your tech lead is writing the Slack message.' },
];

var ROASTS_B = [
  { max: 10,  msg: 'Secrets are safe. For now.' },
  { max: 25,  msg: 'A few exposure risks. Fix before someone finds them.' },
  { max: 50,  msg: 'There are secrets in here that want to be free. Don\'t let them.' },
  { max: 75,  msg: 'This is a security incident waiting to happen.' },
  { max: 100, msg: 'Congratulations, you\'ve built a honeypot. Your secrets are everyone\'s secrets.' },
];

var ROASTS_C = [
  { max: 10,  msg: 'Solid craftsmanship.' },
  { max: 25,  msg: 'Mostly clean, a few rough edges.' },
  { max: 50,  msg: 'The code works, but nobody wants to maintain it.' },
  { max: 75,  msg: 'Tech debt is accruing interest.' },
  { max: 100, msg: 'This codebase is a load-bearing house of cards.' },
];

function _getRoast(score, roasts) {
  for (var i = 0; i < roasts.length; i++) {
    if (score <= roasts[i].max) return roasts[i].msg;
  }
  return roasts[roasts.length - 1].msg;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _scoreColor(score) {
  if (score <= 10) return GREEN;
  if (score <= 25) return YELLOW;
  if (score <= 50) return YELLOW;
  return RED;
}

function _padLeft(str, len) {
  str = String(str);
  while (str.length < len) str = ' ' + str;
  return str;
}

function _severityColor(sev) {
  if (sev >= 9) return RED + BOLD;
  if (sev >= 7) return RED;
  if (sev >= 5) return YELLOW;
  if (sev >= 3) return CYAN;
  return DIM;
}

function _axisEmoji(score) {
  if (score <= 10) return '\u2705';   // checkmark
  if (score <= 25) return '\u26A0\uFE0F';  // warning
  if (score <= 50) return '\u{1F7E1}';  // yellow circle
  return '\u274C';                      // red X
}

function _bar(score, width) {
  var filled = Math.round(score / 100 * width);
  var empty = width - filled;
  var color = _scoreColor(score);
  return color + '\u2588'.repeat(filled) + RESET + DIM + '\u2591'.repeat(empty) + RESET;
}

// Parse --axis=A,B,C filter
function _parseAxisFilter(axisArg) {
  if (!axisArg) return null;
  var parts = axisArg.toUpperCase().split(',');
  var filter = {};
  for (var i = 0; i < parts.length; i++) {
    var ax = parts[i].trim();
    if (ax === 'A' || ax === 'B' || ax === 'C') filter[ax] = true;
  }
  return Object.keys(filter).length > 0 ? filter : null;
}

// Parse --threshold=A:N,B:N override
var DEFAULT_THRESHOLDS = { A: 50, B: 25, C: 100 };

function _parseThresholds(thresholdArg) {
  var t = { A: DEFAULT_THRESHOLDS.A, B: DEFAULT_THRESHOLDS.B, C: DEFAULT_THRESHOLDS.C };
  if (!thresholdArg) return t;
  var parts = thresholdArg.split(',');
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split(':');
    if (kv.length === 2) {
      var axis = kv[0].trim().toUpperCase();
      var val = parseInt(kv[1], 10);
      if ((axis === 'A' || axis === 'B' || axis === 'C') && !isNaN(val)) {
        t[axis] = val;
      }
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// CLI Renderer
// ---------------------------------------------------------------------------

function renderCli(report, opts) {
  opts = opts || {};
  var verbose = opts.verbose || false;
  var axisFilter = _parseAxisFilter(opts.axis);
  var lines = [];

  var summary = report.projectSummary || {};
  var axes = summary.axes || { A: 0, B: 0, C: 0 };
  var verdicts = summary.verdicts || { A: 'Clean', B: 'Clean', C: 'Clean' };

  // --- Header ---
  lines.push('');
  lines.push('  ' + BOLD + CYAN + 'slopguard v2' + RESET + DIM + ' \u2014 AI slop detector' + RESET);
  if (opts.targetPath) {
    lines.push('  ' + DIM + opts.targetPath + RESET);
  }
  lines.push('');

  // --- Three-axis display ---
  lines.push('  ' + BOLD + 'Scoring Axes' + RESET);
  lines.push('');
  var axisLabels = { A: 'AI Slop Risk    ', B: 'Security Exposure', C: 'Code Quality     ' };
  var axisKeys = ['A', 'B', 'C'];
  for (var a = 0; a < axisKeys.length; a++) {
    var ak = axisKeys[a];
    if (axisFilter && !axisFilter[ak]) continue;
    var sc = axes[ak] || 0;
    lines.push('  ' + _axisEmoji(sc) + ' Axis ' + ak + ': ' + axisLabels[ak] + '  '
      + _bar(sc, 20) + '  ' + _scoreColor(sc) + BOLD + _padLeft(sc, 3) + RESET + '/100'
      + '  ' + DIM + verdicts[ak] + RESET);
  }
  lines.push('');

  // --- Roasts ---
  if (!axisFilter || axisFilter.A) {
    lines.push('  ' + DIM + '"' + _getRoast(axes.A || 0, ROASTS_A) + '"' + RESET);
  }
  if (axes.B > 10 && (!axisFilter || axisFilter.B)) {
    lines.push('  ' + DIM + '"' + _getRoast(axes.B || 0, ROASTS_B) + '"' + RESET);
  }
  if (axes.C > 25 && (!axisFilter || axisFilter.C)) {
    lines.push('  ' + DIM + '"' + _getRoast(axes.C || 0, ROASTS_C) + '"' + RESET);
  }
  lines.push('');

  // --- Project stats ---
  lines.push('  ' + DIM + (summary.fileCount || 0) + ' files scanned | '
    + (summary.totalLines || 0) + ' lines' + RESET);
  lines.push('');

  // --- Per-file results ---
  var perFile = (report.perFile || []).slice();
  // Sort by max axis score descending
  perFile.sort(function (a, b) {
    var aMax = Math.max(a.axes.A, a.axes.B, a.axes.C);
    var bMax = Math.max(b.axes.A, b.axes.B, b.axes.C);
    return bMax - aMax;
  });

  if (perFile.length > 0) {
    lines.push('  ' + BOLD + 'Per-file scores:' + RESET);
    lines.push('');
    for (var fi = 0; fi < perFile.length; fi++) {
      var pf = perFile[fi];
      var maxScore = Math.max(pf.axes.A, pf.axes.B, pf.axes.C);
      var fc = _scoreColor(maxScore);
      var axisStr = '';
      for (var ai = 0; ai < axisKeys.length; ai++) {
        var axk = axisKeys[ai];
        if (axisFilter && !axisFilter[axk]) continue;
        if (axisStr) axisStr += DIM + ' | ' + RESET;
        axisStr += axk + ':' + _scoreColor(pf.axes[axk]) + _padLeft(pf.axes[axk], 3) + RESET;
      }
      lines.push('    ' + fc + _padLeft(maxScore, 3) + RESET + ' ' + pf.path + '  ' + axisStr);
    }
    lines.push('');
  }

  // --- Pattern hits (verbose) ---
  if (verbose && report.patternHits && report.patternHits.length > 0) {
    lines.push('  ' + BOLD + 'Pattern hits:' + RESET);
    lines.push('');
    for (var pi = 0; pi < report.patternHits.length; pi++) {
      var ph = report.patternHits[pi];
      var sevC = _severityColor(ph.severity);
      lines.push('    ' + sevC + 'L' + (ph.line + 1) + RESET + ' ' + DIM + '[' + ph.category + ']' + RESET + ' ' + ph.ruleName + '  ' + DIM + ph.file + RESET);
      if (ph.source) {
        lines.push('    ' + DIM + (ph.source || '').trim().substring(0, 80) + RESET);
      }
      lines.push('    ' + GREEN + '\u21B3 ' + ph.fix + RESET);
    }
    lines.push('');
  }

  // --- Secrets ---
  if (report.secrets && report.secrets.length > 0) {
    lines.push('  ' + BOLD + RED + 'Secrets detected:' + RESET);
    lines.push('');
    for (var si = 0; si < report.secrets.length; si++) {
      var sec = report.secrets[si];
      lines.push('    ' + RED + BOLD + sec.value + RESET + '  ' + DIM + sec.file + ':' + (sec.line + 1)
        + ' [' + sec.confidence + ', ' + sec.signals + ' signals]' + RESET);
    }
    lines.push('');
  }

  // --- Exposure ---
  if (report.exposure && report.exposure.length > 0) {
    lines.push('  ' + BOLD + YELLOW + 'Exposure risks:' + RESET);
    lines.push('');
    for (var ei = 0; ei < report.exposure.length; ei++) {
      var exp = report.exposure[ei];
      lines.push('    ' + YELLOW + exp.url + RESET + '  ' + DIM + exp.file + ':' + (exp.line + 1) + '  [' + exp.classification + ']' + RESET);
    }
    lines.push('');
  }

  // --- Slop breakdown (verbose) ---
  if (verbose && report.slopBreakdown && report.slopBreakdown.length > 0) {
    lines.push('  ' + BOLD + 'Slop breakdown by category:' + RESET);
    lines.push('');
    for (var bi = 0; bi < report.slopBreakdown.length; bi++) {
      var bd = report.slopBreakdown[bi];
      lines.push('    ' + _padLeft(bd.hitCount, 3) + ' hits  ' + DIM + bd.fileCount + ' files' + RESET
        + '  ' + bd.category + '  ' + DIM + '(top sev: ' + bd.topSeverity + ')' + RESET);
    }
    lines.push('');
  }

  // --- Review bucket (UNCERTAIN findings) ---
  if (report.review && report.review.length > 0) {
    lines.push('  ' + BOLD + DIM + 'Review bucket (uncertain \u2014 needs human judgment):' + RESET);
    lines.push('');
    for (var ri = 0; ri < report.review.length; ri++) {
      var rv = report.review[ri];
      lines.push('    ' + DIM + rv.value + '  ' + rv.file + ':' + (rv.line + 1)
        + '  score=' + rv.pipelineScore.toFixed(2) + RESET);
    }
    lines.push('');
  }

  // --- Correlation (verbose) ---
  if (verbose && summary.correlation) {
    var corr = summary.correlation;
    if (corr.duplicateSecrets && corr.duplicateSecrets.length > 0) {
      lines.push('  ' + BOLD + 'Cross-file duplicate secrets: ' + corr.duplicateSecrets.length + RESET);
    }
    if (corr.slopClusters && corr.slopClusters.length > 0) {
      lines.push('  ' + BOLD + 'Slop clusters: ' + corr.slopClusters.length + RESET);
    }
    if (corr.clonePollutionMap && corr.clonePollutionMap.length > 0) {
      lines.push('  ' + BOLD + 'Clone pollution: ' + corr.clonePollutionMap.length + ' duplicated functions' + RESET);
    }
    lines.push('');
  }

  // --- Footer ---
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// JSON Renderer
// ---------------------------------------------------------------------------

function renderJson(report) {
  return JSON.stringify(report, null, 2);
}

// ---------------------------------------------------------------------------
// Exit code logic
// ---------------------------------------------------------------------------

function exitCode(axes, thresholds) {
  var t = thresholds || DEFAULT_THRESHOLDS;
  if ((axes.A || 0) > (t.A != null ? t.A : DEFAULT_THRESHOLDS.A)) return 1;
  if ((axes.B || 0) > (t.B != null ? t.B : DEFAULT_THRESHOLDS.B)) return 1;
  if ((axes.C || 0) > (t.C != null ? t.C : DEFAULT_THRESHOLDS.C)) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Pass/fail banner
// ---------------------------------------------------------------------------

function renderBanner(code, axes, thresholds) {
  var t = thresholds || DEFAULT_THRESHOLDS;
  if (code === 0) {
    return '  ' + BG_GREEN + WHITE + BOLD + ' PASS ' + RESET + ' All axes within thresholds.\n\n';
  }
  var reasons = [];
  if ((axes.A || 0) > t.A) reasons.push('Axis A: ' + axes.A + ' > ' + t.A);
  if ((axes.B || 0) > t.B) reasons.push('Axis B: ' + axes.B + ' > ' + t.B);
  if ((axes.C || 0) > t.C) reasons.push('Axis C: ' + axes.C + ' > ' + t.C);
  return '  ' + BG_RED + WHITE + BOLD + ' FAIL ' + RESET + ' ' + reasons.join(', ') + '. Exiting with code 1.\n\n';
}

module.exports = {
  renderCli:          renderCli,
  renderJson:         renderJson,
  exitCode:           exitCode,
  renderBanner:       renderBanner,
  // Expose for testing
  _parseAxisFilter:   _parseAxisFilter,
  _parseThresholds:   _parseThresholds,
  _getRoast:          _getRoast,
  _scoreColor:        _scoreColor,
  _bar:               _bar,
  DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
  ROASTS_A:           ROASTS_A,
  ROASTS_B:           ROASTS_B,
  ROASTS_C:           ROASTS_C,
};
