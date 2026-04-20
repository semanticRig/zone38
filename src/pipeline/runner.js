'use strict';

// Pipeline Runner — v2 orchestrator
// Chains L00 through L14, returns the structured report.
// L15 (output) is NOT called here — the CLI or library consumer calls it.

var fs = require('fs');
var path = require('path');

var L00 = require('./L00-ingestion.js');
var L01 = require('./L01-role.js');
var L02 = require('./L02-surface.js');
var L03 = require('./L03-compression.js');
var L04 = require('./L04-harvest.js');
var L05 = require('./L05-preflight.js');
var L06 = require('./L06-herd.js');
var L07 = require('./L07-deep.js');
var L08 = require('./L08-arbitration.js');
var L09 = require('./L09-url.js');
var L10 = require('./L10-patterns.js');
var L11 = require('./L11-correlation.js');
var L12 = require('./L12-calibration.js');
var L13 = require('./L13-scoring.js');
var L14 = require('./L14-report.js');
var mcpScanner = require('./mcp-scanner.js');

// ---------------------------------------------------------------------------
// Per-file pipeline (L01 through L10)
// ---------------------------------------------------------------------------

function _processFile(record, corpusDir) {
  // Read file content once
  var content;
  try {
    content = fs.readFileSync(record.path, 'utf8');
  } catch (_err) {
    // Unreadable file — skip gracefully
    record.findings = [];
    record.review = [];
    record.patternHits = [];
    record.urlFindings = [];
    record.candidates = [];
    return;
  }

  // L01 — Role classification
  L01.classifyRole(record);

  // L02 — Surface characterisation
  L02.characteriseRecord(record, content);

  // L03 — Compression texture analysis
  L03.analyseFile(record, content, corpusDir);

  // L04 — Entity harvest (extracts string candidates)
  L04.harvestEntities(content, record);

  var candidates = record.candidates || [];

  // Extract URL candidates before L05 preflight — L05's hash deduplication is
  // type-agnostic, so a url-type candidate would be silently dropped if a string-type
  // candidate with the same value appeared earlier in the L04 output (which it always
  // does). URL candidates bypass the string preflight entirely; they go straight to L09.
  var urlCandidates = [];
  var nonUrlCandidates = [];
  for (var pi = 0; pi < candidates.length; pi++) {
    if (candidates[pi].type === 'url') {
      urlCandidates.push(candidates[pi]);
    } else {
      nonUrlCandidates.push(candidates[pi]);
    }
  }
  candidates = nonUrlCandidates;

  // Minified file guard — L04 already ran so URL harvesting is captured.
  // For minified files, skip the string-candidate pipeline (L05-L08) entirely
  // to prevent 30+ false REVIEW/SECRETS items from a single minified bundle line.
  // URL candidates still flow to L09; pattern rules still run on raw content in L10.
  if (record.surface && record.surface.minified) {
    record.candidates  = [];
    record.findings    = [];
    record.review      = [];
    record.urlFindings = L09.analyseUrls(urlCandidates);
    record.patternHits = L10.applyRules(content, record);
    return;
  }

  // L05 — Preflight (filter/prioritise candidates)
  candidates = L05.preflight(candidates, record);
  record.candidates = candidates;

  // Separate string candidates for L06-L08 (blobs excluded; urls already split above)
  var stringCandidates = [];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i].priority !== 'blob') {
      stringCandidates.push(candidates[i]);
    }
  }

  // L06 — Herd discrimination (cluster analysis on string candidates)
  L06.discriminate(stringCandidates);

  // Escalate non-herd candidates (those not in a herd, or wolves)
  var escalated = [];
  for (var j = 0; j < stringCandidates.length; j++) {
    var c = stringCandidates[j];
    // If herdId is set and herdSize >= 3, it's a herd member — skip unless wolf
    if (typeof c.herdId === 'number' && c.herdSize >= 3 && typeof c.herdIHD !== 'number') {
      continue;
    }
    escalated.push(c);
  }

  // L07 — Deep analysis (IC, CTF, EGS, uniformity + string sub-pipeline)
  var signalSets = L07.deepAnalysis(escalated);

  // L08 — Arbitration (confidence tiers)
  var arbitrated = L08.arbitrate(signalSets);
  record.findings = arbitrated.findings || [];
  record.review = arbitrated.review || [];

  // L09 — URL topology analysis
  record.urlFindings = L09.analyseUrls(urlCandidates);

  // L10 — Pattern rules
  record.patternHits = L10.applyRules(content, record);
}

// ---------------------------------------------------------------------------
// Full pipeline execution
// ---------------------------------------------------------------------------

function run(targetPath, opts) {
  opts = opts || {};
  var absPath = path.resolve(targetPath);

  // L00 — Build registry (file discovery)
  var registry = L00.buildRegistry(absPath);

  // Resolve corpus directory
  var corpusDir = path.join(__dirname, '..', '..', 'corpus');
  if (!fs.existsSync(corpusDir)) corpusDir = null;

  // Per-file pipeline (L01 through L10)
  for (var i = 0; i < registry.length; i++) {
    _processFile(registry[i], corpusDir);
  }

  // MCP config scanning (when --mcp flag is set)
  var mcpResults = [];
  if (opts.mcp) {
    mcpResults = mcpScanner.scan(absPath);
    for (var mi = 0; mi < mcpResults.length; mi++) {
      var mcpFile = mcpResults[mi];
      if (mcpFile.findings.length === 0) continue;
      // Synthetic registry record so MCP findings flow through L13 scoring
      registry.push({
        path:         mcpFile.configPath,
        relativePath: mcpFile.configRelPath,
        ext:          '.json',
        size:         mcpFile.size,
        depth:        1,
        territory:    'config',
        role:         null,
        surface:      { avgLineLength: 40, minified: false },
        compression:  null,
        candidates:   [],
        findings:     [],
        review:       [],
        patternHits:  mcpFile.findings,
        urlFindings:  [],
      });
    }
  }

  // L11 — Cross-file correlation (project-level)
  var correlation = L11.correlate(registry);

  // L12 — Project-level calibration (mutates registry in place)
  var calibration = L12.calibrate(registry);

  // L13 — Three-axis scoring
  var scoringResult = L13.computeAxes(registry, calibration);

  // L14 — Report assembly
  var report = L14.assembleReport(scoringResult, registry, correlation);

  // Attach MCP scan results to report for JSON output
  if (mcpResults.length > 0) {
    report.mcpFindings = [];
    for (var mri = 0; mri < mcpResults.length; mri++) {
      var mrf = mcpResults[mri];
      for (var mrfi = 0; mrfi < mrf.findings.length; mrfi++) {
        var f = mrf.findings[mrfi];
        report.mcpFindings.push({
          ruleId:     f.ruleId,
          severity:   f.severity,
          file:       mrf.configRelPath,
          source:     f.line,
          fix:        f.fix,
        });
      }
    }
  }

  return {
    report: report,
    registry: registry,
    calibration: calibration,
    correlation: correlation,
    scoring: scoringResult,
  };
}

module.exports = {
  run:          run,
  _processFile: _processFile,
};
