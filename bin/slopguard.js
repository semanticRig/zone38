#!/usr/bin/env node

'use strict';

var args = process.argv.slice(2);

var RESET = '\x1b[0m';
var BOLD = '\x1b[1m';
var DIM = '\x1b[2m';
var RED = '\x1b[31m';
var GREEN = '\x1b[32m';
var YELLOW = '\x1b[33m';
var CYAN = '\x1b[36m';
var MAGENTA = '\x1b[35m';
var WHITE = '\x1b[37m';
var BG_RED = '\x1b[41m';
var BG_GREEN = '\x1b[42m';
var BG_YELLOW = '\x1b[43m';

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
var scorer = require('../src/scorer');

var verbose = args.includes('--verbose');
var jsonMode = args.includes('--json');
var mcpMode = args.includes('--mcp');

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

// --- Run the scan ---
var scanResult = scanner.scanAll(targetPath, { mcp: mcpMode });
var project = scanResult.project;

// --- Roast messages for high scores ---
var ROASTS = [
  { min: 0,  max: 10,  msg: 'Looking clean. Your tech lead would be proud.' },
  { min: 11, max: 25,  msg: 'A little sloppy, but nothing a quick review can\'t fix.' },
  { min: 26, max: 50,  msg: 'This code has that unmistakable AI aftertaste.' },
  { min: 51, max: 75,  msg: 'Did you even read what the AI wrote before committing?' },
  { min: 76, max: 100, msg: 'This is pure, uncut AI slop. Your tech lead is already writing the Slack message.' },
];

function getRoast(score) {
  for (var i = 0; i < ROASTS.length; i++) {
    if (score >= ROASTS[i].min && score <= ROASTS[i].max) return ROASTS[i].msg;
  }
  return '';
}

function scoreColor(score) {
  if (score <= 10) return GREEN;
  if (score <= 25) return YELLOW;
  if (score <= 50) return YELLOW;
  if (score <= 75) return RED;
  return RED;
}

function padLeft(str, len) {
  str = String(str);
  while (str.length < len) str = ' ' + str;
  return str;
}

function severityColor(sev) {
  if (sev >= 9) return RED + BOLD;
  if (sev >= 7) return RED;
  if (sev >= 5) return YELLOW;
  if (sev >= 3) return CYAN;
  return DIM;
}

// --- JSON output ---
if (jsonMode) {
  var jsonOutput = {
    target: path.resolve(targetPath),
    score: project.score,
    verdict: project.verdict.label,
    fileCount: project.fileCount,
    totalHits: project.totalHits,
    totalEntropyFindings: project.totalEntropyFindings,
    totalMCPFindings: project.totalMCPFindings || 0,
    files: scanResult.files.map(function (fr) {
      var scored = scorer.scoreFile(fr);
      return {
        relativePath: fr.relativePath,
        isBackend: fr.isBackend,
        isFrontend: fr.isFrontend,
        score: scored.score,
        verdict: scored.verdict.label,
        breakdown: scored.breakdown,
        hits: fr.hits.map(function (h) {
          return {
            ruleId: h.ruleId,
            ruleName: h.ruleName,
            category: h.category,
            severity: h.severity,
            lineNumber: h.lineNumber,
            line: h.line.trim(),
            fix: h.fix,
          };
        }),
        entropyFindings: fr.entropyFindings,
        compression: fr.compression,
      };
    }),
    mcpFindings: scanResult.mcpFindings || [],
  };
  process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');
  process.exit(project.score > 50 ? 1 : 0);
}

// --- Pretty output ---
var w = process.stdout;

// Header
w.write('\n');
w.write('  ' + BOLD + CYAN + 'slopguard' + RESET + DIM + ' — AI slop detector' + RESET + '\n');
w.write('  ' + DIM + path.resolve(targetPath) + RESET + '\n');
w.write('\n');

// Project summary bar
var projColor = scoreColor(project.score);
var bar = projColor + BOLD + '  ' + project.verdict.emoji + ' Project Score: ' + project.score + '/100 — ' + project.verdict.label + RESET;
w.write(bar + '\n');
w.write('  ' + DIM + project.fileCount + ' files scanned | ' + project.totalHits + ' pattern hits | ' + project.totalEntropyFindings + ' entropy findings' + (mcpMode ? ' | ' + (project.totalMCPFindings || 0) + ' MCP findings' : '') + RESET + '\n');
w.write('\n');

// Roast
var roast = getRoast(project.score);
if (roast) {
  w.write('  ' + DIM + '"' + roast + '"' + RESET + '\n\n');
}

// Per-file results
w.write('  ' + BOLD + 'Per-file scores:' + RESET + '\n\n');

// Sort files by score descending for readability
var sortedScores = project.fileScores.slice().sort(function (a, b) { return b.score - a.score; });

for (var j = 0; j < sortedScores.length; j++) {
  var fs = sortedScores[j];
  var fc = scoreColor(fs.score);
  var scoreStr = padLeft(fs.score, 3);
  var hitStr = fs.hitCount > 0 ? (' (' + fs.hitCount + ' hits)') : '';
  w.write('    ' + fc + scoreStr + RESET + ' ' + fs.verdict.emoji + ' ' + fs.relativePath + DIM + hitStr + RESET + '\n');

  // Verbose: show hits for this file
  if (verbose && fs.hitCount > 0) {
    // Find the matching file result
    var fileResult = null;
    for (var k = 0; k < scanResult.files.length; k++) {
      if (scanResult.files[k].relativePath === fs.relativePath) {
        fileResult = scanResult.files[k];
        break;
      }
    }

    if (fileResult) {
      for (var h = 0; h < fileResult.hits.length; h++) {
        var hit = fileResult.hits[h];
        var sevC = severityColor(hit.severity);
        w.write('        ' + sevC + 'L' + hit.lineNumber + RESET + ' ' + DIM + '[' + hit.category + ']' + RESET + ' ' + hit.ruleName + '\n');
        w.write('        ' + DIM + hit.line.trim().substring(0, 80) + RESET + '\n');
        w.write('        ' + GREEN + '\u21B3 ' + hit.fix + RESET + '\n');
      }

      // Show entropy findings
      for (var e = 0; e < fileResult.entropyFindings.length; e++) {
        var ef = fileResult.entropyFindings[e];
        var prefixNote = ef.prefixMatch ? ' [known prefix]' : ' (H=' + ef.entropy + ')';
        w.write('        ' + RED + BOLD + 'L' + ef.lineNumber + RESET + ' ' + DIM + '[entropy]' + RESET + ' High-entropy ' + ef.charset + ' string' + prefixNote + '\n');
        if (ef.line) {
          w.write('        ' + DIM + ef.line.trim().substring(0, 80) + RESET + '\n');
        }
        w.write('        ' + GREEN + '\u21B3 Move secrets to environment variables.' + RESET + '\n');
      }

      w.write('\n');
    }
  }
}

w.write('\n');

// MCP findings section
if (mcpMode && scanResult.mcpFindings && scanResult.mcpFindings.length > 0) {
  w.write('  ' + BOLD + 'MCP Configuration Findings:' + RESET + '\n\n');
  for (var m = 0; m < scanResult.mcpFindings.length; m++) {
    var mf = scanResult.mcpFindings[m];
    var mSevC = severityColor(mf.severity);
    w.write('    ' + mSevC + '[sev ' + mf.severity + ']' + RESET + ' ' + mf.name + '\n');
    w.write('    ' + DIM + mf.configFile + ' → ' + mf.path + RESET + '\n');
    w.write('    ' + DIM + 'Value: ' + mf.value + RESET + '\n');
    w.write('    ' + GREEN + '\u21B3 ' + mf.fix + RESET + '\n\n');
  }
}

// Score breakdown
if (verbose) {
  w.write('  ' + BOLD + 'Scoring weights:' + RESET + '\n');
  w.write('    Compression analysis: 40%  |  Pattern rules: 35%  |  Entropy: 15%  |  MCP: 10%\n\n');
}

// Footer with exit code info
if (project.score > 50) {
  w.write('  ' + BG_RED + WHITE + BOLD + ' FAIL ' + RESET + ' Slop score exceeds threshold (50). Exiting with code 1.\n\n');
} else {
  w.write('  ' + BG_GREEN + WHITE + BOLD + ' PASS ' + RESET + ' Slop score within acceptable range.\n\n');
}

process.exit(project.score > 50 ? 1 : 0);
