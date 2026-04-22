'use strict';

// Layer 15 — Output Formatting
// Renders the report from Layer 14 to CLI (ANSI) or JSON.
// Two distinct CLI modes: single-file (full detail) and directory (summary + gated detail).

// ---------------------------------------------------------------------------
// ANSI palette — single source for all colour codes
// ---------------------------------------------------------------------------
var RESET  = '\x1b[0m';
var BOLD   = '\x1b[1m';
var DIM    = '\x1b[2m';
var RED    = '\x1b[31m';
var GREEN  = '\x1b[32m';
var YELLOW = '\x1b[33m';
var CYAN   = '\x1b[36m';
var GRAY   = '\x1b[90m';

// ---------------------------------------------------------------------------
// Severity → colour (for pattern hit line numbers)
// ---------------------------------------------------------------------------
function _severityColor(sev) {
  if (sev >= 9) return RED;
  if (sev >= 7) return YELLOW;
  if (sev >= 5) return CYAN;
  return GRAY;
}

// ---------------------------------------------------------------------------
// Category → colour (for pattern hit badges)
// ---------------------------------------------------------------------------
var CATEGORY_COLOR = {
  // Critical — red
  'security':          RED,
  'config-exposure':   RED,
  'slopsquatting':     RED,
  'error-handling':    RED,
  // Warning — yellow
  'debug-pollution':   YELLOW,
  'context-confusion': YELLOW,
  'structure-smell':   YELLOW,
  'complexity-spike':  YELLOW,
  'magic-values':      YELLOW,
  'comment-mismatch':  YELLOW,
  'scaffold-residue':  YELLOW,
  'promise-graveyard': YELLOW,
  'async-abuse':       YELLOW,
  // Quality — cyan
  'dead-code':         CYAN,
  'over-engineering':  CYAN,
  'dependency':        CYAN,
  'import-hygiene':    CYAN,
  'clone-pollution':   CYAN,
  'accessor-bloat':    CYAN,
  'interface-bloat':   CYAN,
  'branch-symmetry':   CYAN,
  'type-theater':      CYAN,
  'test-theater':      CYAN,
  'naming-entropy':    CYAN,
  // Low — gray
  'verbosity':         GRAY,
};

function _categoryColor(cat) {
  return CATEGORY_COLOR[cat] || YELLOW;
}

// ---------------------------------------------------------------------------
// Minimal syntax highlighter for code snippets
// ---------------------------------------------------------------------------
var _KW_RE = /\b(var|let|const|function|return|if|else|new|this|class|import|require|async|await|throw|typeof|instanceof)\b/g;
var _STR_RE = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;

function _highlight(line) {
  if (!line || typeof line !== 'string') return '';
  var commentIdx = line.indexOf('//');
  var code = commentIdx !== -1 ? line.slice(0, commentIdx) : line;
  var comment = commentIdx !== -1 ? line.slice(commentIdx) : '';

  code = code.replace(_STR_RE, function (m) { return GREEN + m + RESET; });
  code = code.replace(_KW_RE, function (m) { return CYAN + m + RESET; });

  if (comment) code += GRAY + comment + RESET;
  return code;
}

// ---------------------------------------------------------------------------
// Group pattern hits by category (preserves order of first occurrence)
// ---------------------------------------------------------------------------
function _groupByCategory(hits) {
  var order = [];
  var map = {};
  for (var i = 0; i < hits.length; i++) {
    var cat = hits[i].category || 'unknown';
    if (!map[cat]) { map[cat] = []; order.push(cat); }
    map[cat].push(hits[i]);
  }
  var groups = [];
  for (var g = 0; g < order.length; g++) {
    groups.push({ category: order[g], hits: map[order[g]] });
  }
  return groups;
}

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

// Parse --show=hits,secrets,review,exposure,breakdown
var VALID_SECTIONS = { hits: true, secrets: true, review: true, exposure: true, breakdown: true };

function _parseShowFilter(showArg) {
  if (!showArg) return null;
  var parts = showArg.toLowerCase().split(',');
  var filter = {};
  for (var i = 0; i < parts.length; i++) {
    var s = parts[i].trim();
    if (VALID_SECTIONS[s]) filter[s] = true;
  }
  return Object.keys(filter).length > 0 ? filter : null;
}

function _shouldShow(sectionName, showFilter) {
  if (!showFilter) return true;  // no filter = show all
  return showFilter[sectionName] === true;
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

function _renderPatternHits(hits, fileFilter, verbose) {
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
  lines.push(BOLD + 'PATTERN HITS' + RESET + '  ' + DIM + '(' + filtered.length + ')' + RESET);
  lines.push('');

  var groups = _groupByCategory(filtered);

  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    var catLabel = group.category;
    var dashes = Math.max(0, 40 - catLabel.length);
    lines.push('  ' + DIM + '\u2500\u2500 ' + catLabel + ' ' + '\u2500'.repeat(dashes) + RESET);

    if (!verbose) {
      // Collapsed: one entry per ruleId with count + first 3 lines + fix
      var byRule = {};
      var ruleOrder = [];
      for (var ri = 0; ri < group.hits.length; ri++) {
        var rh = group.hits[ri];
        var rk = rh.ruleId || 'unknown';
        if (!byRule[rk]) {
          byRule[rk] = { ruleId: rk, category: rh.category, severity: rh.severity, fix: rh.fix, hits: [] };
          ruleOrder.push(rk);
        }
        byRule[rk].hits.push(rh);
      }

      for (var rj = 0; rj < ruleOrder.length; rj++) {
        var rg = byRule[ruleOrder[rj]];
        var rCount = rg.hits.length;
        var rColor = _categoryColor(rg.category);
        var rBadge = rColor + '[' + rg.ruleId + ']' + RESET;
        var rSev = _severityColor(rg.severity || 0);
        var firstLines = rg.hits.slice(0, 3).map(function(h) { return 'L' + (h.line + 1); }).join(' ');
        var more = rCount > 3 ? '  ' + DIM + '+' + (rCount - 3) + ' more' + RESET : '';
        var countLabel = rCount + ' hit' + (rCount === 1 ? '' : 's');
        lines.push(
          '  ' + rBadge + '  ' + rSev + BOLD + countLabel + RESET +
          '  ' + DIM + '\u2014' + RESET + '  ' + firstLines + more
        );
        if (rg.fix) {
          lines.push('     ' + GREEN + '\u2192 ' + rg.fix + RESET);
        }
        lines.push('');
      }
      continue;
    }

    for (var i = 0; i < group.hits.length; i++) {
      var ph = group.hits[i];
      var sColor = _severityColor(ph.severity || 0);
      var cColor = _categoryColor(ph.category);
      var lineTag = 'L' + (ph.line + 1);
      var badge = cColor + '[' + ph.ruleId + ']' + RESET;
      var gutter = DIM + '\u2502' + RESET;

      // Line 1: bold line number + colored badge (heaviest visual weight)
      lines.push('  ' + sColor + BOLD + _padRight(lineTag, 6) + RESET + '  ' + badge);

      // Line 2: gutter + syntax-highlighted code (medium weight)
      if (ph.source) {
        var snippet = ph.source.trim();
        if (snippet.length > 80) snippet = snippet.substring(0, 79) + '\u2026';
        lines.push('  ' + _padRight('', 6) + '  ' + gutter + ' ' + _highlight(snippet));
      }

      // Line 3: gutter + green fix (distinct, actionable)
      if (ph.fix) {
        lines.push('  ' + _padRight('', 6) + '  ' + gutter + ' ' + GREEN + '\u2192 ' + ph.fix + RESET);
      }

      lines.push('');
    }
  }

  if (!verbose) {
    lines.push('  ' + DIM + 'run with -v to see every hit line' + RESET);
    lines.push('');
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Review bucket section — triage split
// ---------------------------------------------------------------------------
// Tier thresholds (presentation only — L08 arbitration is untouched)
var REVIEW_TIER1_FLOOR = 0.55;   // "worth a look"
var REVIEW_TIER2_FLOOR = 0.35;   // "probably fine"
                                  // below TIER2_FLOOR = "mathematical noise"

function _dedupeReview(items) {
  var seen = {};
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var key = items[i].line + ':' + (items[i].value || '');
    if (seen[key]) continue;
    seen[key] = true;
    out.push(items[i]);
  }
  return out;
}

function _renderReviewItem(rv) {
  var lineNum = _padLeft('L' + (rv.line + 1), 6);
  var score = 'score=' + rv.pipelineScore.toFixed(2);
  var shape = _padRight(rv.shape || 'mixed', 14);
  var len = 'len=' + _padLeft(String(rv.valueLength || 0), 3);
  var cf = 'char-freq:' + _signalLabel(rv.charFreqSignal);
  var bg = 'bigram:' + _signalLabel(rv.bigramSignal);
  return '  ' + lineNum + '  ' + DIM + score + '  ' + shape + len + '   ' + cf + '  ' + bg + RESET;
}

function _renderReview(items, fileFilter, verbose) {
  if (!items || items.length === 0) return [];
  var filtered = items;
  if (fileFilter) {
    filtered = [];
    for (var f = 0; f < items.length; f++) {
      if (items[f].file === fileFilter) filtered.push(items[f]);
    }
  }
  if (filtered.length === 0) return [];

  // Deduplicate by line + value
  filtered = _dedupeReview(filtered);

  // Split into tiers
  var tier1 = [], tier2 = [], tier3 = [];
  for (var i = 0; i < filtered.length; i++) {
    var sc = filtered[i].pipelineScore || 0;
    if (sc >= REVIEW_TIER1_FLOOR) tier1.push(filtered[i]);
    else if (sc >= REVIEW_TIER2_FLOOR) tier2.push(filtered[i]);
    else tier3.push(filtered[i]);
  }

  var lines = [];
  var totalShown = tier1.length;
  var hiddenCount = tier2.length + tier3.length;

  if (verbose) {
    // Verbose: show Tier 1 + Tier 2, suppress Tier 3
    totalShown = tier1.length + tier2.length;
    hiddenCount = tier3.length;

    lines.push('');
    lines.push(BOLD + 'REVIEW' + RESET + '  (' + filtered.length + ' uncertain \u2014 human judgment required)');

    if (tier1.length > 0) {
      lines.push('');
      lines.push('  ' + BOLD + '\u25b2 worth a look (score \u2265 0.55)' + RESET);
      for (var t1 = 0; t1 < tier1.length; t1++) lines.push(_renderReviewItem(tier1[t1]));
    }

    if (tier2.length > 0) {
      lines.push('');
      lines.push('  ' + DIM + '\u00b7 probably fine (score < 0.55)' + RESET);
      for (var t2 = 0; t2 < tier2.length; t2++) lines.push(_renderReviewItem(tier2[t2]));
    }

    if (tier3.length > 0) {
      lines.push('');
      lines.push('  ' + DIM + '+ ' + tier3.length + ' mathematical artifact'
        + (tier3.length > 1 ? 's' : '') + ' (score < 0.35) suppressed.' + RESET);
    }
  } else {
    // Default: show only Tier 1, summarize rest
    lines.push('');
    lines.push(BOLD + 'REVIEW' + RESET + '  (' + tier1.length + ' uncertain \u2014 human judgment required)');

    if (tier1.length > 0) {
      lines.push('');
      for (var d1 = 0; d1 < tier1.length; d1++) lines.push(_renderReviewItem(tier1[d1]));
    }

    if (hiddenCount > 0) {
      lines.push('');
      lines.push('  ' + DIM + '+ ' + hiddenCount + ' low-confidence item'
        + (hiddenCount > 1 ? 's' : '') + ' hidden (scores < 0.55). Run with --verbose to expand.' + RESET);
    }
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
// MCP findings section
// ---------------------------------------------------------------------------

function _renderMcpFindings(mcpFindings) {
  if (!mcpFindings || mcpFindings.length === 0) return [];
  var lines = [];
  lines.push('');
  lines.push(BOLD + 'MCP RISKS' + RESET + '  (' + mcpFindings.length + ' finding' + (mcpFindings.length > 1 ? 's' : '') + ')');
  lines.push('');
  for (var i = 0; i < mcpFindings.length; i++) {
    var mf = mcpFindings[i];
    var sevColor = mf.severity >= 8 ? RED : YELLOW;
    lines.push('  ' + sevColor + 'sev:' + mf.severity + RESET + '  '
      + _padRight(mf.ruleId, 26) + DIM + mf.source + RESET);
    lines.push('  ' + _padRight('', 5) + '  ' + DIM + '\u2192 ' + mf.fix + RESET);
  }
  return lines;
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

  var showFilter = _parseShowFilter(opts.show);
  var compact = opts.compact && !opts.verbose && !showFilter;

  // Pattern hits
  if (!compact && _shouldShow('hits', showFilter)) {
    var phLines = _renderPatternHits(report.patternHits, null, opts.verbose);
    for (var p = 0; p < phLines.length; p++) lines.push(phLines[p]);
  }

  // Secrets
  if (_shouldShow('secrets', showFilter)) {
    var secLines = _renderSecrets(report.secrets);
    for (var si = 0; si < secLines.length; si++) lines.push(secLines[si]);
  }

  // Exposure
  if (!compact && _shouldShow('exposure', showFilter)) {
    var expLines = _renderExposure(report.exposure);
    for (var e = 0; e < expLines.length; e++) lines.push(expLines[e]);
  }

  // MCP findings (not filterable — always shown if present)
  var mcpLines = _renderMcpFindings(report.mcpFindings);
  for (var mi = 0; mi < mcpLines.length; mi++) lines.push(mcpLines[mi]);

  // Review bucket
  if (!compact && _shouldShow('review', showFilter)) {
    var rvLines = _renderReview(report.review, null, opts.verbose);
    for (var r = 0; r < rvLines.length; r++) lines.push(rvLines[r]);
  }

  // Verbose: slop breakdown
  if ((opts.verbose || _shouldShow('breakdown', showFilter)) && report.slopBreakdown) {
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

  // --- MCP findings ---
  var mcpLines2 = _renderMcpFindings(report.mcpFindings);
  for (var mci = 0; mci < mcpLines2.length; mci++) lines.push(mcpLines2[mci]);

  // --- Project-level slop breakdown (verbose/all/show=breakdown) ---
  var showFilter = _parseShowFilter(opts.show);
  var compact = opts.compact && !opts.verbose && !showFilter;
  if ((opts.verbose || opts.all || _shouldShow('breakdown', showFilter)) && report.slopBreakdown) {
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
  } else if (verbose || showFilter) {
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
      if (!compact && _shouldShow('hits', showFilter)) {
        var dfPh = _renderPatternHits(report.patternHits, df.path, opts.verbose);
        for (var dpi = 0; dpi < dfPh.length; dpi++) lines.push(dfPh[dpi]);
      }

      // Secrets for this file
      if (_shouldShow('secrets', showFilter)) {
        var dfSec = _renderSecrets(report.secrets, df.path);
        for (var dsi = 0; dsi < dfSec.length; dsi++) lines.push(dfSec[dsi]);
      }

      // Exposure for this file
      if (!compact && _shouldShow('exposure', showFilter)) {
        var dfExp = _renderExposure(report.exposure, df.path);
        for (var dei = 0; dei < dfExp.length; dei++) lines.push(dfExp[dei]);
      }

      // Review for this file
      if (!compact && _shouldShow('review', showFilter)) {
        var dfRv = _renderReview(report.review, df.path, opts.verbose);
        for (var dri = 0; dri < dfRv.length; dri++) lines.push(dfRv[dri]);
      }
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
  _parseShowFilter:   _parseShowFilter,
  _shouldShow:        _shouldShow,
  DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
};
