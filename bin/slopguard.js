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

// Placeholder until scan logic is implemented in later phases
process.stdout.write(YELLOW + '[slopguard] Scan not yet implemented.' + RESET + '\n');
process.exit(0);
