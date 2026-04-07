#!/usr/bin/env node

'use strict';

var args = process.argv.slice(2);

var RESET = '\x1b[0m';
var BOLD = '\x1b[1m';
var CYAN = '\x1b[36m';
var YELLOW = '\x1b[33m';

function printHelp() {
  var lines = [
    '',
    BOLD + CYAN + '  slopguard' + RESET + ' — Detects AI slop in your codebase before your tech lead does.',
    '',
    BOLD + '  USAGE' + RESET,
    '    slopguard <path> [options]',
    '',
    BOLD + '  OPTIONS' + RESET,
    '    --help       Show this help message',
    '    --verbose    Show detailed per-file hit breakdown',
    '    --json       Output results as JSON',
    '    --mcp        Scan MCP server configurations for risky patterns',
    '',
    BOLD + '  EXAMPLES' + RESET,
    '    slopguard .',
    '    slopguard ./src --verbose',
    '    slopguard ./src --mcp --json',
    '',
  ];
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
}

var path = require('path');
var scanner = require('../src/scanner');

var verbose = args.includes('--verbose');
var jsonMode = args.includes('--json');

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

var files = scanner.discoverFiles(targetPath);

if (jsonMode) {
  var output = {
    target: path.resolve(targetPath),
    fileCount: files.length,
    files: files.map(function (f) {
      return {
        relativePath: f.relativePath,
        isBackend: f.isBackend,
        isFrontend: f.isFrontend,
      };
    }),
    message: 'Scoring not yet implemented.',
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
} else {
  process.stdout.write('\n' + BOLD + CYAN + '  slopguard' + RESET + ' — scanning ' + path.resolve(targetPath) + '\n\n');
  process.stdout.write('  Found ' + BOLD + files.length + RESET + ' file(s) to scan.\n\n');

  for (var j = 0; j < files.length; j++) {
    var f = files[j];
    var ctx = '';
    if (f.isBackend) ctx = YELLOW + ' [backend]' + RESET;
    else if (f.isFrontend) ctx = CYAN + ' [frontend]' + RESET;
    process.stdout.write('    ' + f.relativePath + ctx + '\n');
  }

  process.stdout.write('\n  ' + YELLOW + '[slopguard] Scoring not yet implemented.' + RESET + '\n\n');
}

process.exit(0);
