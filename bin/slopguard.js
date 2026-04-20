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

// Collect first hit line per unique file from patternHits
function collectOpenTargets(patternHits, basePath) {
  var fs = require('fs');
  var pathMod = require('path');
  // If basePath is a file, use its directory; if a directory, use it directly
  var baseDir;
  try {
    baseDir = fs.statSync(basePath).isDirectory() ? basePath : pathMod.dirname(basePath);
  } catch (e) {
    baseDir = pathMod.dirname(basePath);
  }

  var seen = {};
  var targets = [];
  for (var i = 0; i < patternHits.length; i++) {
    var ph = patternHits[i];
    if (!seen[ph.file]) {
      seen[ph.file] = true;
      targets.push({
        filePath: pathMod.resolve(baseDir, ph.file),
        displayName: ph.file,
        lineNumber: (ph.line || 0) + 1,
        hitCount: 0,
      });
    }
  }
  for (var j = 0; j < patternHits.length; j++) {
    for (var k = 0; k < targets.length; k++) {
      if (targets[k].displayName === patternHits[j].file) {
        targets[k].hitCount++;
        break;
      }
    }
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Interactive file picker — j/k navigation, Enter to open, q to quit
// ---------------------------------------------------------------------------
function interactivePicker(targets, onDone) {
  if (targets.length === 0) {
    process.stdout.write('  No files to open.\n');
    if (onDone) onDone();
    return;
  }

  var pathMod = require('path');
  var cursor = 0;
  var ARROW_UP = '\x1b[A';
  var ARROW_DOWN = '\x1b[B';
  var HIDE_CURSOR = '\x1b[?25l';
  var SHOW_CURSOR = '\x1b[?25h';

  function render() {
    // Move cursor up to overwrite previous render (except first draw)
    var clearLines = targets.length + 3; // header + items + footer
    process.stdout.write('\x1b[' + clearLines + 'A\x1b[J');
    draw();
  }

  function draw() {
    process.stdout.write('\n  ' + BOLD + 'OPEN FILES' + RESET + '  ' + DIM + '(' + targets.length + ' file' + (targets.length > 1 ? 's' : '') + ' with hits)' + RESET + '\n');
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var label = pathMod.basename(t.filePath);
      var prefix = i === cursor ? CYAN + '  \u25b6 ' : '    ';
      var hitLabel = t.hitCount + ' hit' + (t.hitCount > 1 ? 's' : '');
      if (i === cursor) {
        process.stdout.write(prefix + BOLD + label + RESET + '  ' + DIM + hitLabel + '  L' + t.lineNumber + RESET + '\n');
      } else {
        process.stdout.write(prefix + DIM + label + '  ' + hitLabel + '  L' + t.lineNumber + RESET + '\n');
      }
    }
    process.stdout.write(DIM + '\n  j/\u2193 down  k/\u2191 up  Enter open  q quit' + RESET + '\n');
  }

  function cleanup() {
    process.stdout.write(SHOW_CURSOR);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeListener('data', onKey);
    process.stdin.pause();
    if (onDone) onDone();
  }

  function onKey(buf) {
    var key = buf.toString();

    // q or Ctrl-C → quit
    if (key === 'q' || key === 'Q' || key === '\x03') {
      cleanup();
      return;
    }

    // j or Down arrow → move down
    if (key === 'j' || key === ARROW_DOWN) {
      if (cursor < targets.length - 1) cursor++;
      render();
      return;
    }

    // k or Up arrow → move up
    if (key === 'k' || key === ARROW_UP) {
      if (cursor > 0) cursor--;
      render();
      return;
    }

    // Enter → open selected file
    if (key === '\r' || key === '\n') {
      var t = targets[cursor];
      // Temporarily restore terminal for the editor
      process.stdout.write(SHOW_CURSOR);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();

      openFileAtLine(t.filePath, t.lineNumber);

      // Resume picker after editor exits
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdout.write(HIDE_CURSOR);
      render();
      return;
    }
  }

  // Guard: raw mode requires a TTY
  if (!process.stdin.isTTY) {
    process.stdout.write('  warning: --open requires an interactive terminal\n');
    if (onDone) onDone();
    return;
  }

  process.stdout.write(HIDE_CURSOR);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', onKey);

  // Initial draw (pad lines so first render() can clear them)
  for (var p = 0; p < targets.length + 3; p++) process.stdout.write('\n');
  render();
}

function printHelp() {
  var lines = [
    '',
    BOLD + '  slopguard' + RESET + ' — Detects AI slop in your codebase before your tech lead does.',
    '',
    BOLD + '  USAGE' + RESET,
    '    slopguard <path> [options]',
    '',
    BOLD + '  OPTIONS' + RESET,
    '    --help              Show this help message',
    '    --verbose           Per-file detail for files above threshold (directory mode)',
    '    --all               Per-file detail for all files (directory mode)',
    '    --file=NAME         Per-file detail for one specific file',
    '    --json              Output results as JSON',
    '    --mcp               Scan MCP server configurations for risky patterns',
    '    --axis=A,B,C        Limit output to specific scoring axes',
    '    --threshold=A:N     Override exit-code threshold per axis, e.g. A:40,B:20',
    '    --show=SECTIONS     Show only named sections: hits,secrets,review,exposure,breakdown',
    '                        Implies per-file detail. Combine with --open for focused workflow.',
    '    --open              After report, interactively open flagged files at hit line',
    '                        in $VISUAL / $EDITOR (falls back to less).',
    '',
    BOLD + '  EXAMPLES' + RESET,
    '    slopguard .',
    '    slopguard ./src --verbose',
    '    slopguard ./src --mcp --json',
    '    slopguard . --axis=A,B --threshold=A:40,B:20',
    '    slopguard bigfile.js --show=hits --open',
    '    slopguard ./src --show=hits,secrets',
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

var verbose = args.includes('--verbose');
var jsonMode = args.includes('--json');
var mcpMode = args.includes('--mcp');
var allMode = args.includes('--all');
var openMode = args.includes('--open');

// --show=hits,secrets,review,exposure,breakdown
var showArg = null;
for (var si = 0; si < args.length; si++) {
  if (args[si].indexOf('--show=') === 0) { showArg = args[si].slice(7); break; }
}

// --file=NAME
var fileArg = null;
for (var fi2 = 0; fi2 < args.length; fi2++) {
  if (args[fi2].indexOf('--file=') === 0) { fileArg = args[fi2].slice(7); break; }
}

// --axis=A,B,C
var axisArg = null;
for (var ai = 0; ai < args.length; ai++) {
  if (args[ai].indexOf('--axis=') === 0) { axisArg = args[ai].slice(7); break; }
}

// --threshold=A:N,B:N,C:N
var thresholdArg = null;
for (var ti = 0; ti < args.length; ti++) {
  if (args[ti].indexOf('--threshold=') === 0) { thresholdArg = args[ti].slice(12); break; }
}

// Find the target path (first non-flag argument)
var targetPath = null;
for (var i = 0; i < args.length; i++) {
  if (args[i].charAt(0) !== '-') {
    targetPath = args[i];
    break;
  }
}

if (!targetPath) {
  process.stderr.write(YELLOW + '[slopguard] No path specified. Run with --help for usage.' + RESET + '\n');
  process.exit(1);
}

var thresholds = L15._parseThresholds(thresholdArg);
var result = pipelineRunner.run(targetPath, { mcp: mcpMode });
var report = result.report;

if (jsonMode) {
  process.stdout.write(L15.renderJson(report) + '\n');
} else {
  var cliOutput = L15.renderCli(report, {
    verbose: verbose,
    all: allMode,
    file: fileArg,
    axis: axisArg,
    show: showArg,
    targetPath: path.resolve(targetPath),
    thresholds: thresholds,
  });
  process.stdout.write(cliOutput);
}

var v2Axes = (report.projectSummary && report.projectSummary.axes) || { A: 0, B: 0, C: 0 };
var exitCodeVal = L15.exitCode(v2Axes, thresholds);

if (openMode && !jsonMode && report.patternHits && report.patternHits.length > 0) {
  var openTargets = collectOpenTargets(report.patternHits, targetPath);
  interactivePicker(openTargets, function () {
    process.exit(exitCodeVal);
  });
} else {
  process.exit(exitCodeVal);
}
