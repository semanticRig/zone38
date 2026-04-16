'use strict';

// Layer 15 — Output Formatting
// Renders the report from Layer 14 to CLI (ANSI) or JSON.
// Two distinct CLI modes: single-file (full detail) and directory (summary + gated detail).

// ---------------------------------------------------------------------------
// ANSI — exactly four colour states, nothing else
// ---------------------------------------------------------------------------
var RESET  = '\x1b[0m';
var BOLD   = '\x1b[1m';    // section headers (bright white)
var DIM    = '\x1b[2m';    // clean / pass / structural
var YELLOW = '\x1b[33m';   // warning
var RED    = '\x1b[31m';   // critical

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _padLeft(str, len) {
  str = String(str);
  while (str.length < len) str = ' ' + str;
  return str;
}

function _padRight(str, len) {
  str = String(str);
  while (str.length < len) str += ' ';
  return str;
}

function _scoreColor(score) {
  if (score <= 10) return '';     // default terminal
  if (score <= 50) return YELLOW;
  return RED;
}

// Verdict labels — uppercase, no fluff
var VERDICT_MAP = {
  'Clean':       'CLEAN',
  'Minimal':     'MINIMAL',
  'Some issues': 'SOME ISSUES',
  'Concerning':  'NOTICEABLE',
  'Heavy':       'HEAVY',
  'Critical':    'CATASTROPHIC',
};

function _verdictLabel(verdict) {
  return VERDICT_MAP[verdict] || (verdict || '').toUpperCase();
}

// Bar: filled = \u2500 (horizontal line), empty = \u2591 (light shade)
function _bar(score, width) {
  var filled = Math.round(score / 100 * width);
  if (filled > width) filled = width;
  var empty = width - filled;
  return '\u2500'.repeat(filled) + '\u2591'.repeat(empty);
}

// Signal strength label for review display
function _signalLabel(val) {
  if (val == null) return '?';
  if (val < 0.33) return 'low';
  if (val < 0.66) return 'medium';
  return 'high';
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

// Number with commas
function _commaNum(n) {
  var s = String(n);
  var parts = [];
  while (s.length > 3) {
    parts.unshift(s.slice(-3));
    s = s.slice(0, -3);
  }
  parts.unshift(s);
  return parts.join(',');
}

// Count items per file from an array of objects with .file property
function _countByFile(items) {
  var map = {};
  for (var i = 0; i < items.length; i++) {
    var f = items[i].file;
    map[f] = (map[f] || 0) + 1;
  }
  return map;
}

// Short filename from a path
function _basename(filePath) {
  if (!filePath) return '';
  var idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(idx + 1) : filePath;
}

// ---------------------------------------------------------------------------
// Shared axis table
// ---------------------------------------------------------------------------

var AXIS_DEFS = [
  { key: 'A', label: 'AI SLOP' },
  { key: 'B', label: 'SECURITY' },
  { key: 'C', label: 'QUALITY' },
];

function _renderAxisTable(axes, verdicts, axisFilter) {
  var lines = [];
  for (var i = 0; i < AXIS_DEFS.length; i++) {
    var d = AXIS_DEFS[i];
    if (axisFilter && !axisFilter[d.key]) continue;
    var sc = axes[d.key] || 0;
    var color = _scoreColor(sc);
    var vLabel = _verdictLabel(verdicts[d.key] || 'Clean');
    lines.push('  ' + d.key + '  ' + _padRight(d.label, 13)
      + color + _padLeft(sc.toFixed(1), 5) + RESET
      + '   ' + color + _bar(sc, 23) + RESET
      + '  ' + color + vLabel + RESET);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Exit line
// ---------------------------------------------------------------------------

function _renderExitLine(code, axes, thresholds) {
  var t = thresholds || DEFAULT_THRESHOLDS;
  if (code === 0) {
    return '  EXIT 0' + DIM + '  \u00b7  all axes within thresholds' + RESET;
  }
  var reasons = [];
  if ((axes.A || 0) > t.A) reasons.push('Axis A exceeds threshold (' + t.A + ')');
  if ((axes.B || 0) > t.B) reasons.push('Axis B exceeds threshold (' + t.B + ')');
  if ((axes.C || 0) > t.C) reasons.push('Axis C exceeds threshold (' + t.C + ')');
  return '  EXIT 1' + DIM + '  \u00b7  ' + reasons.join(', ') + RESET;
}

// ---------------------------------------------------------------------------
// Pattern hits section
// ---------------------------------------------------------------------------

function _renderPatternHits(hits, fileFilter) {
  if (!hits || hits.length === 0) return [];
  var filtered = hits;
  if (fileFilter) {
    filtered = [];
    for (var f = 0; f < hits.length; f++) {
      if (hits[f].file === fileFilter) filtered.push(hits[f]);
    }
  }
  if (filtered.length === 0) return [];

  var lines = [];
  lines.push('');
  lines.push(BOLD + 'PATTERN HITS' + RESET + '  (' + filtered.length + ')');
  lines.push('');
  for (var i = 0; i < filtered.length; i++) {
    var ph = filtered[i];
    var lineNum = _padLeft('L' + (ph.line + 1), 6);
    var ruleCol = Math.max(ph.ruleId.length + 1, 24);
    var ruleLabel = _padRight(ph.ruleId, ruleCol);
    var src = (ph.source || '').trim();
    if (src.length > 60) src = src.substring(0, 60) + '\u2026';
    lines.push('  ' + lineNum + '  ' + ruleLabel + DIM + src + RESET);
    lines.push('  ' + _padRight('', 6) + '  ' + DIM + '\u2192 ' + ph.fix + RESET);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Review bucket section
// ---------------------------------------------------------------------------

function _renderReview(items, fileFilter) {
  if (!items || items.length === 0) return [];
  var filtered = items;
  if (fileFilter) {
    filtered = [];
    for (var f = 0; f < items.length; f++) {
      if (items[f].file === fileFilter) filtered.push(items[f]);
    }
  }
  if (filtered.length === 0) return [];

  var lines = [];
  lines.push('');
  lines.push(BOLD + 'REVIEW' + RESET + '  (' + filtered.length + ' uncertain \u2014 human judgment required)');
  lines.push('');
  for (var i = 0; i < filtered.length; i++) {
    var rv = filtered[i];
    var lineNum = _padLeft('L' + (rv.line + 1), 6);
    var score = 'score=' + rv.pipelineScore.toFixed(2);
    var shape = _padRight(rv.shape || 'mixed', 14);
    var len = 'len=' + _padLeft(String(rv.valueLength || 0), 3);
    var cf = 'char-freq:' + _signalLabel(rv.charFreqSignal);
    var bg = 'bigram:' + _signalLabel(rv.bigramSignal);
    lines.push('  ' + lineNum + '  ' + DIM + score + '  ' + shape + len + '   ' + cf + '  ' + bg + RESET);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Secrets section
// ---------------------------------------------------------------------------

function _renderSecrets(items, fileFilter) {
  if (!items || items.length === 0) return [];
  var filtered = items;
  if (fileFilter) {
    filtered = [];
    for (var f = 0; f < items.length; f++) {
      if (items[f].file === fileFilter) filtered.push(items[f]);
    }
  }
  if (filtered.length === 0) return [];

  var lines = [];
  lines.push('');
  lines.push(BOLD + 'SECRETS' + RESET + '  (' + filtered.length + ' confirmed)');
  lines.push('');
  for (var i = 0; i < filtered.length; i++) {
    var sec = filtered[i];
    var lineNum = _padLeft('L' + (sec.line + 1), 6);
    var conf = sec.confidence;
    var shape = _padRight(sec.shape || 'mixed', 14);
    var len = 'len=' + _padLeft(String(sec.valueLength || 0), 3);
    lines.push('  ' + lineNum + '  ' + RED + conf + RESET + '  ' + DIM + shape + len
      + '  ' + sec.file + RESET);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Exposure section
// ---------------------------------------------------------------------------

function _renderExposure(items, fileFilter) {
  if (!items || items.length === 0) return [];
  var filtered = items;
  if (fileFilter) {
    filtered = [];
    for (var f = 0; f < items.length; f++) {
      if (items[f].file === fileFilter) filtered.push(items[f]);
    }
  }
  if (filtered.length === 0) return [];

  var lines = [];
  lines.push('');
  lines.push(BOLD + 'EXPOSURE' + RESET + '  (' + filtered.length + ' URLs)');
  lines.push('');
  for (var i = 0; i < filtered.length; i++) {
    var exp = filtered[i];
    var lineNum = _padLeft('L' + (exp.line + 1), 6);
    lines.push('  ' + lineNum + '  ' + YELLOW + exp.url + RESET + '  '
      + DIM + exp.classification + '  ' + exp.file + RESET);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Slop breakdown section (verbose only)
// ---------------------------------------------------------------------------

function _renderSlopBreakdown(items) {
  if (!items || items.length === 0) return [];
  var lines = [];
  lines.push('');
  lines.push(BOLD + 'SLOP BREAKDOWN' + RESET);
  lines.push('');
  for (var i = 0; i < items.length; i++) {
    var bd = items[i];
    lines.push('  ' + _padLeft(String(bd.hitCount), 4) + ' hits  '
      + DIM + _padLeft(String(bd.fileCount), 3) + ' files' + RESET
      + '  ' + _padRight(bd.category, 22) + DIM + 'top sev: ' + bd.topSeverity + RESET);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Correlation section
// ---------------------------------------------------------------------------

function _renderCorrelation(correlation) {
  if (!correlation) return [];
  var lines = [];
  var any = false;

  if (correlation.duplicateSecrets && correlation.duplicateSecrets.length > 0) {
    if (!any) { lines.push(''); lines.push(BOLD + 'CORRELATION' + RESET); lines.push(''); any = true; }
    var ds = correlation.duplicateSecrets;
    var totalFiles = 0;
    for (var d = 0; d < ds.length; d++) totalFiles += ds[d].fileCount;
    lines.push('  ' + ds.length + ' duplicate secret candidate' + (ds.length > 1 ? 's' : '')
      + ' appear across ' + totalFiles + ' file' + (totalFiles > 1 ? 's' : ''));
  }

  if (correlation.slopClusters && correlation.slopClusters.length > 0) {
    if (!any) { lines.push(''); lines.push(BOLD + 'CORRELATION' + RESET); lines.push(''); any = true; }
    for (var s = 0; s < correlation.slopClusters.length; s++) {
      var cl = correlation.slopClusters[s];
      lines.push('  1 slop cluster detected in ' + cl.directory
        + ' (' + cl.fileCount + ' files, dominant: ' + cl.category + ')');
    }
  }

  if (correlation.clonePollutionMap && correlation.clonePollutionMap.length > 0) {
    if (!any) { lines.push(''); lines.push(BOLD + 'CORRELATION' + RESET); lines.push(''); any = true; }
    lines.push('  ' + correlation.clonePollutionMap.length
      + ' duplicated function' + (correlation.clonePollutionMap.length > 1 ? 's' : '')
      + ' across multiple files');
  }

  return lines;
}

// Verdict from score (mirrors L14 thresholds)
function _verdictFromScore(score) {
  if (score <= 0)  return 'Clean';
  if (score <= 10) return 'Minimal';
  if (score <= 25) return 'Some issues';
  if (score <= 50) return 'Concerning';
  if (score <= 75) return 'Heavy';
  return 'Critical';
}

// ---------------------------------------------------------------------------
// Single-file mode
// ---------------------------------------------------------------------------

function _renderSingleFile(report, opts) {
  var lines = [];
  var summary = report.projectSummary || {};
  var axes = summary.axes || { A: 0, B: 0, C: 0 };
  var verdicts = summary.verdicts || { A: 'Clean', B: 'Clean', C: 'Clean' };
  var axisFilter = _parseAxisFilter(opts.axis);
  var thresholds = opts.thresholds || DEFAULT_THRESHOLDS;
  var code = exitCode(axes, thresholds);

  // Single file info
  var pf = (report.perFile && report.perFile[0]) || {};
  var fileName = pf.path || _basename(opts.targetPath || '');
  var lineCount = pf.lineCount || summary.totalLines || 0;

  // Header
  lines.push('');
  lines.push(BOLD + 'SLOPGUARD v2' + RESET + DIM + '  \u00b7  ' + fileName
    + '  \u00b7  ' + _commaNum(lineCount) + ' lines' + RESET);
  lines.push('');

  // Axis table
  var axisLines = _renderAxisTable(axes, verdicts, axisFilter);
  for (var a = 0; a < axisLines.length; a++) lines.push(axisLines[a]);
  lines.push('');

  // Exit line
  lines.push(_renderExitLine(code, axes, thresholds));

  // Pattern hits (always shown in single-file mode)
  var phLines = _renderPatternHits(report.patternHits);
  for (var p = 0; p < phLines.length; p++) lines.push(phLines[p]);

  // Secrets
  var secLines = _renderSecrets(report.secrets);
  for (var si = 0; si < secLines.length; si++) lines.push(secLines[si]);

  // Exposure
  var expLines = _renderExposure(report.exposure);
  for (var e = 0; e < expLines.length; e++) lines.push(expLines[e]);

  // Review bucket
  var rvLines = _renderReview(report.review);
  for (var r = 0; r < rvLines.length; r++) lines.push(rvLines[r]);

  // Verbose: slop breakdown
  if (opts.verbose && report.slopBreakdown) {
    var bdLines = _renderSlopBreakdown(report.slopBreakdown);
    for (var b = 0; b < bdLines.length; b++) lines.push(bdLines[b]);
  }

  lines.push('');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Directory mode
// ---------------------------------------------------------------------------

function _renderDirectory(report, opts) {
  var lines = [];
  var summary = report.projectSummary || {};
  var axes = summary.axes || { A: 0, B: 0, C: 0 };
  var verdicts = summary.verdicts || { A: 'Clean', B: 'Clean', C: 'Clean' };
  var axisFilter = _parseAxisFilter(opts.axis);
  var thresholds = opts.thresholds || DEFAULT_THRESHOLDS;
  var code = exitCode(axes, thresholds);

  // Per-file stats: count patterns, review, exposure per file
  var patternsByFile = _countByFile(report.patternHits || []);
  var reviewByFile   = _countByFile(report.review || []);
  var exposureByFile = _countByFile(report.exposure || []);

  // Header
  lines.push('');
  lines.push(BOLD + 'SLOPGUARD v2' + RESET + DIM + '  \u00b7  ' + (opts.targetPath || '.')
    + '  \u00b7  ' + (summary.fileCount || 0) + ' files'
    + '  \u00b7  ' + _commaNum(summary.totalLines || 0) + ' lines' + RESET);
  lines.push('');

  // Axis table
  var axisLines = _renderAxisTable(axes, verdicts, axisFilter);
  for (var a = 0; a < axisLines.length; a++) lines.push(axisLines[a]);
  lines.push('');

  // Exit line
  lines.push(_renderExitLine(code, axes, thresholds));

  // Sort per-file by max axis score descending
  var perFile = (report.perFile || []).slice();
  perFile.sort(function (a, b) {
    var aMax = Math.max(a.axes.A, a.axes.B, a.axes.C);
    var bMax = Math.max(b.axes.A, b.axes.B, b.axes.C);
    return bMax - aMax;
  });

  // --- Top offenders: files with any axis above minimal ---
  var offenders = [];
  for (var oi = 0; oi < perFile.length; oi++) {
    var opf = perFile[oi];
    if (Math.max(opf.axes.A, opf.axes.B, opf.axes.C) > 10) {
      offenders.push(opf);
    }
  }

  if (offenders.length > 0) {
    lines.push('');
    lines.push(BOLD + 'TOP OFFENDERS' + RESET);
    lines.push('');
    // Compute column width from longest path in visible set
    var showCount = Math.min(offenders.length, 10);
    var maxPathLen = 20;
    for (var pi2 = 0; pi2 < showCount; pi2++) {
      if (offenders[pi2].path.length > maxPathLen) maxPathLen = offenders[pi2].path.length;
    }
    var pathCol = maxPathLen + 2;
    for (var ti = 0; ti < showCount; ti++) {
      var tf = offenders[ti];
      var aColor = _scoreColor(tf.axes.A);
      var bColor = _scoreColor(tf.axes.B);
      var cColor = _scoreColor(tf.axes.C);
      var pCount = patternsByFile[tf.path] || 0;
      var rCount = reviewByFile[tf.path] || 0;
      var row = '  '
        + 'A:' + aColor + _padLeft(Math.round(tf.axes.A), 3) + RESET + '  '
        + 'B:' + bColor + _padLeft(Math.round(tf.axes.B), 3) + RESET + '  '
        + 'C:' + cColor + _padLeft(Math.round(tf.axes.C), 3) + RESET + '   '
        + _padRight(tf.path, pathCol)
        + DIM + 'patterns:' + _padLeft(String(pCount), 3) + '  review:' + rCount + RESET;
      lines.push(row);
    }
    if (offenders.length > showCount) {
      lines.push('  ' + DIM + '[and ' + (offenders.length - showCount) + ' more \u2014 use --verbose to expand]' + RESET);
    }
  }

  // --- Axis B concerns ---
  var bConcerns = [];
  for (var bi = 0; bi < perFile.length; bi++) {
    if (perFile[bi].axes.B > 1) bConcerns.push(perFile[bi]);
  }
  bConcerns.sort(function (a, b) { return b.axes.B - a.axes.B; });
  var bShowMax = 10;

  if (bConcerns.length > 0) {
    lines.push('');
    lines.push(BOLD + 'AXIS B CONCERNS' + RESET + DIM + '  (files with security exposure)' + RESET);
    lines.push('');
    var bShowCount = Math.min(bConcerns.length, bShowMax);
    for (var bci = 0; bci < bShowCount; bci++) {
      var bcf = bConcerns[bci];
      var bRevCount = reviewByFile[bcf.path] || 0;
      var bExpCount = exposureByFile[bcf.path] || 0;
      var details = [];
      if (bRevCount > 0) details.push(bRevCount + ' uncertain candidate' + (bRevCount > 1 ? 's' : ''));
      if (bExpCount > 0) details.push(bExpCount + ' URL' + (bExpCount > 1 ? 's' : ''));
      var bsc = _scoreColor(bcf.axes.B);
      lines.push('  B:' + bsc + _padLeft(Math.round(bcf.axes.B), 3) + RESET + '  '
        + bcf.path + (details.length > 0 ? '  ' + DIM + '\u2192  ' + details.join('  ') + RESET : ''));
    }
    if (bConcerns.length > bShowCount) {
      lines.push('  ' + DIM + '[and ' + (bConcerns.length - bShowCount) + ' more]' + RESET);
    }
  }

  // --- Clean files ---
  var cleanFiles = report.cleanFiles || [];
  if (cleanFiles.length > 0) {
    lines.push('');
    lines.push(BOLD + 'CLEAN' + RESET + DIM + '  (' + cleanFiles.length + ' file' + (cleanFiles.length > 1 ? 's' : '') + ')' + RESET);
    var cleanNames = [];
    var showClean = Math.min(cleanFiles.length, 8);
    for (var ci = 0; ci < showClean; ci++) {
      cleanNames.push(_basename(cleanFiles[ci].file));
    }
    lines.push('  ' + DIM + cleanNames.join('  ') + RESET);
    if (cleanFiles.length > showClean) {
      lines.push('  ' + DIM + '[and ' + (cleanFiles.length - showClean) + ' more \u2014 use --verbose to list all]' + RESET);
    }
  }

  // --- Correlation ---
  var corrLines = _renderCorrelation(summary.correlation);
  for (var cri = 0; cri < corrLines.length; cri++) lines.push(corrLines[cri]);

  // --- Project-level slop breakdown (verbose/all) ---
  if ((opts.verbose || opts.all) && report.slopBreakdown) {
    var bdLines = _renderSlopBreakdown(report.slopBreakdown);
    for (var bdi = 0; bdi < bdLines.length; bdi++) lines.push(bdLines[bdi]);
  }

  // ===================================================================
  // Per-file detail: gated behind --verbose, --all, or --file=X
  // ===================================================================

  var fileArg = opts.file || null;
  var showAll = opts.all || false;
  var verbose = opts.verbose || false;

  var detailFiles = [];
  if (fileArg) {
    for (var dfi = 0; dfi < perFile.length; dfi++) {
      if (perFile[dfi].path === fileArg || _basename(perFile[dfi].path) === fileArg) {
        detailFiles.push(perFile[dfi]);
        break;
      }
    }
  } else if (showAll) {
    detailFiles = perFile;
  } else if (verbose) {
    for (var vfi = 0; vfi < perFile.length; vfi++) {
      var vpf = perFile[vfi];
      if (Math.max(vpf.axes.A, vpf.axes.B, vpf.axes.C) > 10) {
        detailFiles.push(vpf);
      }
    }
  }

  if (detailFiles.length > 0) {
    lines.push('');
    for (var dti = 0; dti < detailFiles.length; dti++) {
      var df = detailFiles[dti];
      lines.push('');
      lines.push(BOLD + '\u2500\u2500 ' + df.path + RESET + DIM
        + '  (' + _commaNum(df.lineCount || 0) + ' lines)' + RESET);
      lines.push('');

      var dfAxes = df.axes || { A: 0, B: 0, C: 0 };
      var dfVerdicts = {};
      for (var dak = 0; dak < AXIS_DEFS.length; dak++) {
        var dk = AXIS_DEFS[dak].key;
        dfVerdicts[dk] = _verdictFromScore(dfAxes[dk]);
      }
      var dfAxisLines = _renderAxisTable(dfAxes, dfVerdicts, axisFilter);
      for (var dal = 0; dal < dfAxisLines.length; dal++) lines.push(dfAxisLines[dal]);

      // Pattern hits for this file
      var dfPh = _renderPatternHits(report.patternHits, df.path);
      for (var dpi = 0; dpi < dfPh.length; dpi++) lines.push(dfPh[dpi]);

      // Secrets for this file
      var dfSec = _renderSecrets(report.secrets, df.path);
      for (var dsi = 0; dsi < dfSec.length; dsi++) lines.push(dfSec[dsi]);

      // Exposure for this file
      var dfExp = _renderExposure(report.exposure, df.path);
      for (var dei = 0; dei < dfExp.length; dei++) lines.push(dfExp[dei]);

      // Review for this file
      var dfRv = _renderReview(report.review, df.path);
      for (var dri = 0; dri < dfRv.length; dri++) lines.push(dfRv[dri]);
    }
  }

  lines.push('');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Main CLI renderer
// ---------------------------------------------------------------------------

function renderCli(report, opts) {
  opts = opts || {};
  var perFile = report.perFile || [];
  if (perFile.length <= 1) {
    return _renderSingleFile(report, opts);
  }
  return _renderDirectory(report, opts);
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

// Banner — exit info is now part of the main CLI output
function renderBanner() {
  return '';
}

module.exports = {
  renderCli:          renderCli,
  renderJson:         renderJson,
  exitCode:           exitCode,
  renderBanner:       renderBanner,
  _parseAxisFilter:   _parseAxisFilter,
  _parseThresholds:   _parseThresholds,
  _scoreColor:        _scoreColor,
  _bar:               _bar,
  _verdictLabel:      _verdictLabel,
  _signalLabel:       _signalLabel,
  _commaNum:          _commaNum,
  _renderAxisTable:   _renderAxisTable,
  _renderExitLine:    _renderExitLine,
  _verdictFromScore:  _verdictFromScore,
  DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
};
