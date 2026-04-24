'use strict';

// test/e2e.js — End-to-End integration tests
// Runs runner.run() on fixture files and asserts axis score ranges.
// Does NOT assert exact integer scores — range assertions only so minor
// L08 math tuning does not make these tests brittle.

var path = require('path');

var passed = 0;
var failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    process.stdout.write('  \x1b[32m\u2713\x1b[0m ' + label + '\n');
  } else {
    failed++;
    process.stderr.write('  \x1b[31m\u2717\x1b[0m ' + label + '\n');
  }
}

function section(name) {
  process.stdout.write('\n  \x1b[1m' + name + '\x1b[0m\n');
}

var runner      = require('../src/pipeline/runner.js');
var fixturesDir = path.join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// 1. Clean file — minimal signal, zero secrets, zero pattern hits
// ---------------------------------------------------------------------------
section('E2E — clean.js (single file, expect low noise)');

var cleanResult = runner.run(path.join(fixturesDir, 'clean.js'));

// Top-level structure
assert(cleanResult && typeof cleanResult === 'object',         'runner.run returns an object');
assert(cleanResult.report && typeof cleanResult.report === 'object', 'result has report');
assert(cleanResult.report.projectSummary !== null,             'report has projectSummary');

var cleanAxes = cleanResult.report.projectSummary.axes;
assert(typeof cleanAxes.A === 'number', 'Axis A is a number');
assert(typeof cleanAxes.B === 'number', 'Axis B is a number');
assert(typeof cleanAxes.C === 'number', 'Axis C is a number');
assert(cleanAxes.A >= 0 && cleanAxes.A <= 100, 'Axis A in [0, 100] (got ' + cleanAxes.A.toFixed(1) + ')');
assert(cleanAxes.B >= 0 && cleanAxes.B <= 100, 'Axis B in [0, 100] (got ' + cleanAxes.B.toFixed(1) + ')');
assert(cleanAxes.C >= 0 && cleanAxes.C <= 100, 'Axis C in [0, 100] (got ' + cleanAxes.C.toFixed(1) + ')');

// Clean file must not trigger any pattern hits or secrets
assert(Array.isArray(cleanResult.report.patternHits),          'patternHits is an array');
assert(cleanResult.report.patternHits.length === 0,            'clean.js has zero pattern hits');
assert(Array.isArray(cleanResult.report.secrets),              'secrets is an array');
assert(cleanResult.report.secrets.length === 0,                'clean.js has zero secrets');

// Axis A must stay low — no AI slop patterns in clean code
assert(cleanAxes.A < 30, 'clean.js Axis A < 30 (got ' + cleanAxes.A.toFixed(1) + ')');

// perFile populated for single-file scan
assert(Array.isArray(cleanResult.report.perFile),              'perFile is an array');
assert(cleanResult.report.perFile.length === 1,                'perFile has 1 entry for single-file scan');

// ---------------------------------------------------------------------------
// 2. Sloppy file — pattern hits present, Axis A elevated
// ---------------------------------------------------------------------------
section('E2E — sloppy.js (single file, expect pattern hits + elevated A)');

var sloppyResult = runner.run(path.join(fixturesDir, 'sloppy.js'));
var sloppyAxes   = sloppyResult.report.projectSummary.axes;

assert(Array.isArray(sloppyResult.report.patternHits),         'sloppy patternHits is an array');
assert(sloppyResult.report.patternHits.length > 0,             'sloppy.js has at least one pattern hit');

// sloppy.js has hallucinated imports (chalky, lodash-utils), TODO/FIXME, debug-like patterns
assert(sloppyAxes.A > 0, 'sloppy.js Axis A > 0 (got ' + sloppyAxes.A.toFixed(1) + ')');

// Sloppy must score higher Axis A than clean
assert(sloppyAxes.A > cleanAxes.A,
  'sloppy.js Axis A > clean.js Axis A (' + sloppyAxes.A.toFixed(1) + ' > ' + cleanAxes.A.toFixed(1) + ')');

// perFile populated
assert(sloppyResult.report.perFile.length === 1, 'sloppy.js perFile has 1 entry');

// ---------------------------------------------------------------------------
// 3. Secrets file — Axis B elevated, at least one secret detected
// ---------------------------------------------------------------------------
section('E2E — secrets.js (single file, expect B elevated + secrets found)');

var secretsResult = runner.run(path.join(fixturesDir, 'secrets.js'));
var secretsAxes   = secretsResult.report.projectSummary.axes;

assert(Array.isArray(secretsResult.report.secrets),            'secrets array present');
assert(secretsResult.report.secrets.length > 0,                'secrets.js has at least one detected secret');

// Axis B must be elevated — secrets.js has Stripe key, AWS key, JWT, hex secret
assert(secretsAxes.B > 0, 'secrets.js Axis B > 0 (got ' + secretsAxes.B.toFixed(1) + ')');

// Secrets file must score higher Axis B than clean file
assert(secretsAxes.B > cleanAxes.B,
  'secrets.js Axis B > clean.js Axis B (' + secretsAxes.B.toFixed(1) + ' > ' + cleanAxes.B.toFixed(1) + ')');

// ---------------------------------------------------------------------------
// 4. Directory scan — multi-file aggregation and report structure
// ---------------------------------------------------------------------------
section('E2E — fixtures/ directory (multi-file aggregation)');

var dirResult = runner.run(fixturesDir);
var dirAxes   = dirResult.report.projectSummary;

assert(dirAxes.fileCount > 1,                                  'directory scan finds more than 1 file');
assert(Array.isArray(dirResult.report.perFile),                'directory perFile is an array');
assert(dirResult.report.perFile.length > 1,                    'directory perFile has multiple entries');
assert(dirAxes.totalLines > 0,                                 'directory scan totalLines > 0');

// Axes valid on directory-level scan
var dAxes = dirAxes.axes;
assert(dAxes.A >= 0 && dAxes.A <= 100, 'directory Axis A in [0, 100] (got ' + dAxes.A.toFixed(1) + ')');
assert(dAxes.B >= 0 && dAxes.B <= 100, 'directory Axis B in [0, 100] (got ' + dAxes.B.toFixed(1) + ')');
assert(dAxes.C >= 0 && dAxes.C <= 100, 'directory Axis C in [0, 100] (got ' + dAxes.C.toFixed(1) + ')');

// Directory report must contain aggregate pattern hits (sloppy.js is in the tree)
assert(Array.isArray(dirResult.report.patternHits),            'directory patternHits is an array');
assert(dirResult.report.patternHits.length > 0,                'directory scan finds pattern hits across files');

// ---------------------------------------------------------------------------
// 5. Nonexistent path — must not throw, returns empty zero-file report
// ---------------------------------------------------------------------------
section('E2E — nonexistent path (resilience check)');

var ghostResult = runner.run('/tmp/does-not-exist-slopguard-e2e-xyz');
assert(ghostResult && ghostResult.report,                      'nonexistent path does not throw');
assert(ghostResult.report.projectSummary.fileCount === 0,      'nonexistent path returns 0 files');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
process.stdout.write('\n');
if (failed === 0) {
  process.stdout.write('  \x1b[32m\x1b[1m' + passed + ' passed\x1b[0m\n\n');
} else {
  process.stdout.write(
    '  \x1b[32m' + passed + ' passed\x1b[0m  \x1b[31m\x1b[1m' + failed + ' failed\x1b[0m\n\n'
  );
  process.exit(1);
}
