#!/usr/bin/env node

'use strict';

var args = process.argv.slice(2);

var RESET = '\x1b[0m';
var BOLD = '\x1b[1m';
var DIM = '\x1b[2m';
var RED = '\x1b[31m';
var YELLOW = '\x1b[33m';
var CYAN = '\x1b[36m';

// ---------------------------------------------------------------------------
// Editor resolution — respects $VISUAL / $EDITOR, falls back to less (read-only)
// ---------------------------------------------------------------------------
function resolveEditor() {
  var fromEnv = process.env.VISUAL || process.env.EDITOR;
  if (fromEnv) return fromEnv;
  return 'less';
}

function buildOpenArgs(editor, filePath, lineNumber) {
  var base = editor.split(' ')[0];
  var name = require('path').basename(base);

  if (name === 'code') return ['code', '--goto', filePath + ':' + lineNumber];
  if (name === 'vim' || name === 'nvim') return [name, '-R', '+' + lineNumber, '+set cursorline', filePath];
  if (name === 'less') return ['less', '-R', '-N', '+' + lineNumber + 'g', '-j3'];
  if (name === 'emacs') return ['emacs', '--eval', '(view-file "' + filePath + '")', '+' + lineNumber];
  return [editor, '+' + lineNumber, filePath];
}

// Highlight a specific line in a file with ANSI yellow background
var HIGHLIGHT_BG = '\x1b[43m\x1b[30m'; // yellow bg + black text
function _colorizeFileLine(filePath, lineNumber) {
  var fs = require('fs');
  var content = fs.readFileSync(filePath, 'utf8');
  var lines = content.split('\n');
  var idx = lineNumber - 1;
  if (idx >= 0 && idx < lines.length) {
    lines[idx] = HIGHLIGHT_BG + lines[idx] + RESET;
  }
  return lines.join('\n');
}

function openFileAtLine(filePath, lineNumber) {
  var spawnSync = require('child_process').spawnSync;
  var existsSync = require('fs').existsSync;

  if (!existsSync(filePath)) {
    process.stderr.write('  warning: cannot open ' + filePath + ' \u2014 file not found\n');
    return;
  }

  var editor = resolveEditor();
  var openArgs = buildOpenArgs(editor, filePath, lineNumber);
  var editorName = require('path').basename(editor.split(' ')[0]);

  // For less: pipe colorized content via stdin so the target line is highlighted
  if (editorName === 'less') {
    var colorized = _colorizeFileLine(filePath, lineNumber);
    var result = spawnSync(openArgs[0], openArgs.slice(1), {
      input: colorized,
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: false,
    });
    if (result.error) {
      process.stderr.write('  warning: could not open editor (' + openArgs[0] + '): ' + result.error.message + '\n');
    }
    return;
  }

  // All other editors: open the file directly
  var result = spawnSync(openArgs[0], openArgs.slice(1), {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    process.stderr.write('  warning: could not open editor (' + openArgs[0] + '): ' + result.error.message + '\n');
  }
}

// ---------------------------------------------------------------------------
// countLines — count \n chars in a string (used by in-place redraw)
// ---------------------------------------------------------------------------
function countLines(str) {
  var count = 0;
  for (var i = 0; i < str.length; i++) {
    if (str[i] === '\n') count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// printHitContext — print snippet + fix before opening the viewer
// ---------------------------------------------------------------------------
function printHitContext(hit) {
  var line        = hit.lineNumber || '?';
  var ruleId      = hit.ruleId     || '';
  var snippet     = hit.fullSnippet || hit.snippet || '';
  var fix         = hit.fix        || '';

  var headerBody  = 'L' + line + '  ' + ruleId;
  var dashes      = '';
  var dashCount   = Math.max(0, 52 - String(line).length - ruleId.length);
  for (var i = 0; i < dashCount; i++) dashes += '\u2500';
  var divider     = DIM + '\u2500\u2500 ' + headerBody + ' ' + dashes + RESET;
  var closeDivider = DIM;
  for (var j = 0; j < 60; j++) closeDivider += '\u2500';
  closeDivider += RESET;

  process.stdout.write('\n');
  process.stdout.write('  ' + divider + '\n\n');
  if (snippet) {
    process.stdout.write('    ' + snippet + '\n\n');
  }
  if (fix) {
    process.stdout.write('    \u2192 ' + fix + '\n\n');
  }
  process.stdout.write('  ' + closeDivider + '\n');
  process.stdout.write('  ' + DIM + 'opening in ' + resolveEditor() + '...' + RESET + '\n\n');
}

// ---------------------------------------------------------------------------
// --explain helpers
// ---------------------------------------------------------------------------
function _padRight(str, len) {
  str = String(str);
  while (str.length < len) str += ' ';
  return str;
}
function findExplainTarget(report, lineNumber) {
  var allHits = [];
  if (report.secrets) {
    for (var si2 = 0; si2 < report.secrets.length; si2++) allHits.push(report.secrets[si2]);
  }
  if (report.review) {
    for (var ri2 = 0; ri2 < report.review.length; ri2++) allHits.push(report.review[ri2]);
  }
  if (allHits.length === 0) return null;
  return allHits.reduce(function(best, h) {
    var hLine    = (h.line || 0) + 1; // convert to 1-based
    var bestLine = (best.line || 0) + 1;
    return Math.abs(hLine - lineNumber) < Math.abs(bestLine - lineNumber) ? h : best;
  });
}

function printExplain(hit) {
  var line = (hit.line || 0) + 1; // 1-based for display
  var SEP = DIM + '\u2500'.repeat(54) + RESET;
  process.stdout.write('\n');
  process.stdout.write('  ' + DIM + '\u2500\u2500 explain  L' + line + '  ' + SEP + RESET + '\n');

  if (hit.value) {
    var preview = hit.value.slice(0, 60);
    process.stdout.write('    candidate     ' + DIM + '"' + preview + '"' + RESET + '\n');
  }
  if (hit.shape)  process.stdout.write('    shape         ' + hit.shape + '\n');
  if (hit.valueLength !== undefined) process.stdout.write('    length        ' + hit.valueLength + ' chars\n');

  process.stdout.write('\n    signals fired\n');
  var signals = [
    ['shannon entropy',      hit.charFreqSignal],
    ['bigram randomness',    hit.bigramSignal],
    ['compression ratio',    hit.compressionSignal],
  ];
  for (var sii = 0; sii < signals.length; sii++) {
    var sig = signals[sii];
    if (sig[1] !== undefined && sig[1] !== null) {
      process.stdout.write(
        '      ' + DIM + _padRight(sig[0], 24) + RESET + String(sig[1]).slice(0, 10) + '\n'
      );
    }
  }

  process.stdout.write('\n');
  if (hit.signals !== undefined) process.stdout.write('    signals agreed        ' + hit.signals + '\n');
  if (hit.pipelineScore !== undefined) process.stdout.write('    pipeline score        ' + hit.pipelineScore.toFixed ? hit.pipelineScore.toFixed(4) : hit.pipelineScore + '\n');
  if (hit.confidence) process.stdout.write('    confidence            ' + hit.confidence + '\n');
  process.stdout.write('\n');
  process.stdout.write('    verdict               ' + BOLD + (hit.confidence || (hit.pipelineScore !== undefined ? 'REVIEW' : '?')) + RESET + '\n');
  process.stdout.write('  ' + DIM + '\u2500'.repeat(56) + RESET + '\n\n');
}

// Collect ALL hits (not just first per file) as flat ordered array.
// ph.file is relative path, ph.line is 0-based lineIndex, ph.source is line content.
function collectAllHits(patternHits, basePath) {
  var fs = require('fs');
  var pathMod = require('path');
  var baseDir;
  try {
    baseDir = fs.statSync(basePath).isDirectory() ? basePath : pathMod.dirname(basePath);
  } catch (e) {
    baseDir = pathMod.dirname(basePath);
  }

  var hits = [];
  for (var i = 0; i < patternHits.length; i++) {
    var ph = patternHits[i];
    hits.push({
      filePath:    pathMod.resolve(baseDir, ph.file),
      fileName:    pathMod.basename(ph.file),
      lineNumber:  (ph.line || 0) + 1,   // ph.line is 0-based
      ruleId:      ph.ruleId  || '',
      snippet:     (ph.source || '').slice(0, 72).trim(),
      fullSnippet: (ph.source || '').trim(),
      fix:         ph.fix    || '',
    });
  }
  // Sort by filePath first, then lineNumber ascending within each file
  hits.sort(function (a, b) {
    if (a.filePath < b.filePath) return -1;
    if (a.filePath > b.filePath) return 1;
    return a.lineNumber - b.lineNumber;
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Build tag index from flat hit array — sorted by hit count descending.
// ---------------------------------------------------------------------------
function buildTagIndex(hits) {
  var index = {};
  for (var i = 0; i < hits.length; i++) {
    var tag = hits[i].ruleId || 'uncategorised';
    if (!index[tag]) index[tag] = [];
    index[tag].push(hits[i]);
  }
  // Sort tags by hit count descending so most impactful is at top
  var sorted = {};
  Object.keys(index)
    .sort(function (a, b) { return index[b].length - index[a].length; })
    .forEach(function (k) { sorted[k] = index[k]; });
  return sorted;
}

// ---------------------------------------------------------------------------
// Level 1 — Tag Picker: pick a category, then dive into its hits.
// ---------------------------------------------------------------------------
function runTagPicker(tagIndex, allHits, exitCode) {
  var tags   = Object.keys(tagIndex);
  var cursor = 0;
  var stdin  = process.stdin;

  // Non-interactive fallback (CI / piped — requires interactive terminal)
  if (!stdin.isTTY) {
    process.stdout.write('\n  Categories (requires interactive terminal for navigation):\n\n');
    for (var n = 0; n < tags.length; n++) {
      process.stdout.write('  ' + tags[n] + '  (' + tagIndex[tags[n]].length + ' hits)\n');
    }
    process.stdout.write('\n');
    process.exit(exitCode);
    return;
  }

  var pickerLineCount = 0;
  var pickerFirstDraw = true;

  function drawPicker() {
    var out = '';
    out += '\n';
    out += '  ' + BOLD + 'SELECT CATEGORY' + RESET +
           '  ' + DIM + '(' + allHits.length + ' total hit' + (allHits.length === 1 ? '' : 's') + ')' + RESET + '\n\n';

    for (var i = 0; i < tags.length; i++) {
      var tag      = tags[i];
      var count    = tagIndex[tag].length;
      var selected = (i === cursor);
      var marker   = selected ? CYAN + '\u25b6' + RESET : ' ';
      var tagLabel = selected ? BOLD + tag + RESET : DIM + tag + RESET;
      var countStr = DIM + '(' + count + ' hit' + (count === 1 ? '' : 's') + ')' + RESET;
      out += '  ' + marker + '  ' + tagLabel + '  ' + countStr + '\n';
    }

    out += '\n  ' + DIM +
           'j/k move  Enter select  a all hits  q/Q quit' +
           RESET + '\n\n';

    if (!pickerFirstDraw) {
      process.stdout.write('\x1b[' + pickerLineCount + 'A\x1b[J');
    }
    pickerFirstDraw = false;
    pickerLineCount = countLines(out);
    process.stdout.write(out);
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  drawPicker();

  function onKey(key) {
    // Ctrl-C or Q — exit to shell immediately
    if (key === '\x03' || key === 'Q') {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onKey);
      process.stdout.write('\n');
      process.exit(exitCode);
      return;
    }
    // q — nowhere to go back, also exits
    if (key === 'q') {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onKey);
      process.stdout.write('\n');
      process.exit(exitCode);
      return;
    }
    // a / A — all hits, skip picker
    if (key === 'a' || key === 'A') {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onKey);
      runHitNavigator(allHits, tagIndex, null, exitCode);
      return;
    }
    // Enter — open selected category in hit navigator
    if (key === '\r' || key === '\n') {
      var selectedTag  = tags[cursor];
      var selectedHits = tagIndex[selectedTag];
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onKey);
      runHitNavigator(selectedHits, tagIndex, selectedTag, exitCode);
      return;
    }
    // j or down arrow
    if (key === 'j' || key === '\x1b[B') {
      if (cursor < tags.length - 1) { cursor++; drawPicker(); }
      return;
    }
    // k or up arrow
    if (key === 'k' || key === '\x1b[A') {
      if (cursor > 0) { cursor--; drawPicker(); }
      return;
    }
  }

  stdin.on('data', onKey);
}

// ---------------------------------------------------------------------------
// Level 2 — Hit Navigator: navigate hits within a chosen category.
// q returns to the tag picker. Q exits to shell.
// ---------------------------------------------------------------------------
function runHitNavigator(hits, tagIndex, activeTag, exitCode) {
  if (hits.length === 0) {
    process.stdout.write('\n  No hits in this category.\n\n');
    // Rebuild allHits from tagIndex and return to picker
    var backHits = [];
    Object.keys(tagIndex).forEach(function (t) {
      tagIndex[t].forEach(function (h) { backHits.push(h); });
    });
    runTagPicker(tagIndex, backHits, exitCode);
    return;
  }

  var cursor      = 0;
  var MAX_VISIBLE = 14;
  var stdin       = process.stdin;
  var label       = activeTag ? activeTag : 'all hits';

  // Non-interactive fallback
  if (!stdin.isTTY) {
    process.stdout.write('\n  Hits (' + label + ') (requires interactive terminal for navigation):\n\n');
    for (var n = 0; n < hits.length; n++) {
      var hh = hits[n];
      process.stdout.write(
        '  ' + hh.fileName + '  L' + hh.lineNumber +
        (hh.ruleId  ? '  [' + hh.ruleId  + ']' : '') +
        (hh.snippet ? '  ' + hh.snippet  : '') + '\n'
      );
    }
    process.stdout.write('\n');
    process.exit(exitCode);
    return;
  }

  var navLineCount = 0;
  var navFirstDraw = true;

  function drawList() {
    var total    = hits.length;
    var winStart = Math.max(0, cursor - Math.floor(MAX_VISIBLE / 2));
    var winEnd   = Math.min(total, winStart + MAX_VISIBLE);
    if (winEnd - winStart < MAX_VISIBLE) {
      winStart = Math.max(0, winEnd - MAX_VISIBLE);
    }

    var out = '';
    out += '\n';
    out += '  ' + BOLD + label.toUpperCase() + RESET +
           '  ' + DIM + '(' + total + ' hit' + (total === 1 ? '' : 's') + ')' + RESET + '\n\n';

    var lastFile = null;
    for (var i = winStart; i < winEnd; i++) {
      var h = hits[i];
      if (h.filePath !== lastFile) {
        out += '  ' + DIM + '\u2014 ' + h.fileName + ' \u2014' + RESET + '\n';
        lastFile = h.filePath;
      }
      var selected = (i === cursor);
      var marker   = selected ? CYAN + '\u25b6' + RESET : ' ';
      var lineStr  = DIM + 'L' + h.lineNumber + RESET;
      var snipStr  = DIM + h.snippet + RESET;
      out += '  ' + marker + '  ' + lineStr + '  ' + snipStr + '\n';
    }

    if (total > MAX_VISIBLE) {
      var pct = Math.round((cursor / Math.max(total - 1, 1)) * 100);
      out += '\n  ' + DIM + pct + '%  \u2014  ' + total + ' total' + RESET + '\n';
    }

    out += '\n  ' + DIM +
           'j/k move  Enter open  q back to categories  Q quit' +
           RESET + '\n\n';

    if (!navFirstDraw) {
      process.stdout.write('\x1b[' + navLineCount + 'A\x1b[J');
    }
    navFirstDraw = false;
    navLineCount = countLines(out);
    process.stdout.write(out);
  }

  function openCurrent() {
    var h = hits[cursor];
    stdin.setRawMode(false);
    stdin.pause();
    printHitContext(h);
    openFileAtLine(h.filePath, h.lineNumber);
    stdin.resume();
    stdin.setRawMode(true);
    navFirstDraw = true;   // viewer output is on screen — append cleanly below it
    drawList();
  }

  function returnToPicker() {
    stdin.setRawMode(false);
    stdin.pause();
    stdin.removeListener('data', onKey);
    var backHits = [];
    Object.keys(tagIndex).forEach(function (t) {
      tagIndex[t].forEach(function (h) { backHits.push(h); });
    });
    runTagPicker(tagIndex, backHits, exitCode);
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  drawList();

  function onKey(key) {
    // Ctrl-C or Q — exit to shell immediately
    if (key === '\x03' || key === 'Q') {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onKey);
      process.stdout.write('\n');
      process.exit(exitCode);
      return;
    }
    // q — back to tag picker
    if (key === 'q') {
      returnToPicker();
      return;
    }
    // Enter — open current hit
    if (key === '\r' || key === '\n') {
      openCurrent();
      return;
    }
    // j or down arrow
    if (key === 'j' || key === '\x1b[B') {
      if (cursor < hits.length - 1) { cursor++; drawList(); }
      return;
    }
    // k or up arrow
    if (key === 'k' || key === '\x1b[A') {
      if (cursor > 0) { cursor--; drawList(); }
      return;
    }
  }

  stdin.on('data', onKey);
}

function printHelp() {
  var lines = [
    '',
    '  slopguard \u2014 Detects AI slop before your tech lead does.',
    '',
    '  USAGE',
    '    slopguard <path> [options]',
    '',
    '  START HERE',
    '    slopguard .                       scan, compact summary',
    '    slopguard . -v -o                 scan, triage hits interactively',
    '    slopguard . -j                    scan, JSON output for CI',
    '',
    '  DETAIL',
    '    -v, --verbose       Per-file detail for flagged files',
    '    -a, --all           Per-file detail for all files',
    '    -f, --file=NAME     Per-file detail for one specific file',
    '',
    '  FOCUS',
    '    -s, --show=SECTIONS Show only: hits secrets review exposure breakdown',
    '    -o, --open          Interactive hit navigator (tag picker first)',
    '                        j/k move  Enter select  q back  Q quit',
    '',
    '  OUTPUT',
    '    -j, --json          JSON output',
    '        --compact       Compact summary only (default when no flags set)',
    '',
    '  \u2500\u2500 advanced \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    '    -m, --mcp           Scan MCP server configs for risky patterns',
    '    -A, --axis=A,B,C    Limit axes  A=Slop  B=Security  C=Quality',
    '    -t, --threshold=A:N Override exit threshold  e.g. -t A:40,B:20',
    '    -S, --since=REF     Scan only files changed since a git ref',
    '                        e.g. --since=HEAD~1  --since=origin/main',
    '        --explain=LINE  Full pipeline breakdown for one line number',
    '',
    '  EXAMPLES',
    '    # Triage only security issues interactively',
    '    slopguard ./src -v -s secrets -o',
    '',
    '    # PR check \u2014 only files changed vs main',
    '    slopguard . --since=origin/main -j',
    '',
    '    # Full scan with custom CI thresholds',
    '    slopguard . -j -A A,B -t A:40,B:20',
    '',
  ];
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
}

var path = require('path');
var pipelineRunner = require('../src/pipeline/runner');
var L15 = require('../src/pipeline/L15-output');

var verbose = args.includes('--verbose') || args.includes('-v');
var jsonMode = args.includes('--json') || args.includes('-j');
var mcpMode = args.includes('--mcp') || args.includes('-m');
var allMode = args.includes('--all') || args.includes('-a');
var openMode = args.includes('--open') || args.includes('-o');
var compactFlag = args.includes('--compact') || args.includes('-c');

// --since=<git-ref> / -S=<git-ref>: scan only files changed since ref
var sinceArg = null;
for (var sai = 0; sai < args.length; sai++) {
  if (args[sai].indexOf('--since=') === 0) { sinceArg = args[sai].slice(8); break; }
  if (args[sai].indexOf('-S=')     === 0) { sinceArg = args[sai].slice(3); break; }
}

// --show=hits,secrets,review,exposure,breakdown  (-s, --show=)
var showArg = null;
for (var si = 0; si < args.length; si++) {
  if (args[si].indexOf('--show=') === 0) { showArg = args[si].slice(7); break; }
  if (args[si].indexOf('-s=')     === 0) { showArg = args[si].slice(3); break; }
}

// --file=NAME  (-f, --file=)
var fileArg = null;
for (var fi2 = 0; fi2 < args.length; fi2++) {
  if (args[fi2].indexOf('--file=') === 0) { fileArg = args[fi2].slice(7); break; }
  if (args[fi2].indexOf('-f=')     === 0) { fileArg = args[fi2].slice(3); break; }
}

// --axis=A,B,C  (-A, --axis=)
var axisArg = null;
for (var ai = 0; ai < args.length; ai++) {
  if (args[ai].indexOf('--axis=') === 0) { axisArg = args[ai].slice(7); break; }
  if (args[ai].indexOf('-A=')     === 0) { axisArg = args[ai].slice(3); break; }
}

// --threshold=A:N,B:N,C:N  (-t, --threshold=)
var thresholdArg = null;
for (var ti = 0; ti < args.length; ti++) {
  if (args[ti].indexOf('--threshold=') === 0) { thresholdArg = args[ti].slice(12); break; }
  if (args[ti].indexOf('-t=')          === 0) { thresholdArg = args[ti].slice(3);  break; }
}

// Compact is default when no expansive flags are set
var useCompact = compactFlag || (!verbose && !allMode && !fileArg && !showArg);

// --explain=LINE: full pipeline breakdown for one line number
var explainLine = null;
for (var eli = 0; eli < args.length; eli++) {
  if (args[eli].indexOf('--explain=') === 0) {
    var eln = parseInt(args[eli].slice(10), 10);
    if (!isNaN(eln) && eln > 0) explainLine = eln;
    break;
  }
}

// Find the target path (first non-flag argument)
var targetPath = null;
for (var i = 0; i < args.length; i++) {
  if (args[i].charAt(0) !== '-') {
    targetPath = args[i];
    break;
  }
}

// ---------------------------------------------------------------------------
// --since: resolve list of changed JS/TS files via git diff
// ---------------------------------------------------------------------------
function getChangedFiles(sinceRef, basePath) {
  var execFileSync = require('child_process').execFileSync;
  var output;
  try {
    output = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=d', sinceRef, '--', basePath],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
  } catch (e) {
    process.stdout.write(
      '  warning: --since failed (' + e.message.split('\n')[0] + ')\n' +
      '  Falling back to full scan.\n\n'
    );
    return null;
  }
  var files = output
    .split('\n')
    .map(function (f) { return f.trim(); })
    .filter(function (f) {
      return f.length > 0 && /\.(js|ts|mjs|cjs|jsx|tsx)$/.test(f);
    });
  if (files.length === 0) {
    process.stdout.write(
      '  No changed JS/TS files since ' + sinceRef + '. Nothing to scan.\n\n'
    );
    process.exit(0);
  }
  return files;
}

if (!targetPath) {
  process.stderr.write(YELLOW + '[slopguard] No path specified. Run with --help for usage.' + RESET + '\n');
  process.exit(1);
}

var thresholds = L15._parseThresholds(thresholdArg);

// Resolve scan targets — full path or per-file list from --since
var scanTargets = null;  // null = single scan on targetPath
if (sinceArg) {
  var changedFiles = getChangedFiles(sinceArg, path.resolve(targetPath));
  if (changedFiles !== null) {
    scanTargets = changedFiles.map(function (f) {
      return path.resolve(process.cwd(), f);
    });
    process.stdout.write(
      '  Scanning ' + scanTargets.length +
      ' changed file' + (scanTargets.length === 1 ? '' : 's') +
      ' since ' + sinceArg + '\n\n'
    );
  }
}

var result, report, exitCodeVal;

if (scanTargets) {
  // --since mode: scan each changed file individually, track worst exit code
  exitCodeVal = 0;
  for (var sci = 0; sci < scanTargets.length; sci++) {
    var scResult = pipelineRunner.run(scanTargets[sci], { mcp: mcpMode });
    var scReport = scResult.report;
    if (jsonMode) {
      process.stdout.write(L15.renderJson(scReport) + '\n');
    } else {
      process.stdout.write(L15.renderCli(scReport, {
        verbose: verbose,
        all: allMode,
        file: fileArg,
        axis: axisArg,
        show: showArg,
        compact: useCompact,
        targetPath: scanTargets[sci],
        thresholds: thresholds,
      }));
    }
    var scAxes = (scReport.projectSummary && scReport.projectSummary.axes) || { A: 0, B: 0, C: 0 };
    if (L15.exitCode(scAxes, thresholds) === 1) exitCodeVal = 1;
  }
  // Use last report for --open navigation if needed
  result = pipelineRunner.run(scanTargets[scanTargets.length - 1], { mcp: false });
  report = result.report;
} else {
  result = pipelineRunner.run(targetPath, { mcp: mcpMode });
  report = result.report;

  if (jsonMode) {
    process.stdout.write(L15.renderJson(report) + '\n');
  } else {
    var cliOutput = L15.renderCli(report, {
      verbose: verbose,
      all: allMode,
      file: fileArg,
      axis: axisArg,
      show: showArg,
      compact: useCompact,
      targetPath: path.resolve(targetPath),
      thresholds: thresholds,
    });
    process.stdout.write(cliOutput);
    // Compact hint: only when compacted and there are hits
    if (useCompact && !jsonMode && report.patternHits && report.patternHits.length > 0) {
      process.stdout.write(
        '\n  ' + DIM +
        'run with -v for full detail  \u00b7  -v -o to triage hits interactively' +
        RESET + '\n\n'
      );
    }
  }

  var v2Axes = (report.projectSummary && report.projectSummary.axes) || { A: 0, B: 0, C: 0 };
  exitCodeVal = L15.exitCode(v2Axes, thresholds);
}

// --explain: print pipeline breakdown for the hit closest to requested line
if (explainLine !== null && !jsonMode) {
  var isDir = false;
  try { isDir = require('fs').statSync(targetPath || '.').isDirectory(); } catch (e) {}
  if (isDir || scanTargets) {
    process.stdout.write('  warning: --explain requires a single file path, not a directory\n');
  } else {
    var explainTarget = findExplainTarget(report, explainLine);
    if (!explainTarget) {
      process.stdout.write('  --explain: no hit found near L' + explainLine + '\n');
    } else {
      printExplain(explainTarget);
    }
  }
}

if (openMode && !jsonMode) {
  var allHits  = collectAllHits(report.patternHits || [], path.resolve(targetPath));
  var tagIndex = buildTagIndex(allHits);
  if (allHits.length === 0) {
    process.stdout.write('\n  No hits to navigate.\n\n');
    process.exit(exitCodeVal);
  } else {
    runTagPicker(tagIndex, allHits, exitCodeVal);
  }
} else {
  process.exit(exitCodeVal);
}
