#!/usr/bin/env node

'use strict';

var args = process.argv.slice(2);

var RESET = '\x1b[0m';
var BOLD = '\x1b[1m';
var DIM = '\x1b[2m';
var RED = '\x1b[31m';
var YELLOW = '\x1b[33m';

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
    '',
    BOLD + '  EXAMPLES' + RESET,
    '    slopguard .',
    '    slopguard ./src --verbose',
    '    slopguard ./src --mcp --json',
    '    slopguard . --axis=A,B --threshold=A:40,B:20',
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
    targetPath: path.resolve(targetPath),
    thresholds: thresholds,
  });
  process.stdout.write(cliOutput);
}

var v2Axes = (report.projectSummary && report.projectSummary.axes) || { A: 0, B: 0, C: 0 };
process.exit(L15.exitCode(v2Axes, thresholds));
