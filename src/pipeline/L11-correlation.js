'use strict';

// Layer 11 — Cross-File Correlation
//
// Project-level intelligence: looks across ALL per-file results to find patterns
// that no single-file analysis can catch.
//
// Four detections:
//   1. duplicateSecrets — same secret candidate value in ≥2 files → copy-paste propagation
//   2. slopClusters    — directories where ≥3 files share the same dominant pattern category
//                         → AI session fingerprint (one generation session produced a whole dir)
//   3. urlCrossRef     — internal-exposed URLs referenced from multiple files
//   4. clonePollutionMap — structurally similar function signatures across file boundaries
//
// Input:  registry — array of per-file result objects, each with:
//           { path|filePath, relativePath?, findings[], patternHits[], urlFindings[] }
//         where findings come from L08, patternHits from L10, urlFindings from L09.
//
// Output: { duplicateSecrets, slopClusters, urlCrossRef, clonePollutionMap }

var path = require('path');

// ---------------------------------------------------------------------------
// 1. Duplicate secrets across files
// ---------------------------------------------------------------------------

function _findDuplicateSecrets(registry) {
  // Map: secret value → array of { filePath, lineIndex, confidence }
  var valueMap = {};

  for (var i = 0; i < registry.length; i++) {
    var entry = registry[i];
    var filePath = entry.relativePath || entry.path || entry.filePath || '';
    var findings = entry.findings || [];

    for (var f = 0; f < findings.length; f++) {
      var finding = findings[f];
      var val = finding.value || finding.topValue || '';
      if (!val || val.length < 8) continue;

      if (!valueMap[val]) valueMap[val] = [];
      valueMap[val].push({
        filePath: filePath,
        lineIndex: finding.lineIndex || 0,
        confidence: finding.confidence || 'UNKNOWN',
      });
    }
  }

  // Filter to values appearing in ≥2 distinct files
  var duplicates = [];
  var keys = Object.keys(valueMap);
  for (var k = 0; k < keys.length; k++) {
    var locations = valueMap[keys[k]];
    // Deduplicate by filePath
    var uniqueFiles = {};
    for (var u = 0; u < locations.length; u++) {
      uniqueFiles[locations[u].filePath] = true;
    }
    if (Object.keys(uniqueFiles).length >= 2) {
      duplicates.push({
        value: keys[k],
        fileCount: Object.keys(uniqueFiles).length,
        locations: locations,
      });
    }
  }

  return duplicates;
}

// ---------------------------------------------------------------------------
// 2. Slop clusters by directory
// ---------------------------------------------------------------------------

function _findSlopClusters(registry) {
  // Group files by directory. For each file, find its dominant pattern category.
  var dirMap = {}; // dirPath → array of { filePath, dominantCategory }

  for (var i = 0; i < registry.length; i++) {
    var entry = registry[i];
    var filePath = entry.relativePath || entry.path || entry.filePath || '';
    var hits = entry.patternHits || [];
    if (hits.length === 0) continue;

    // Find dominant category by frequency
    var catCount = {};
    for (var h = 0; h < hits.length; h++) {
      var cat = hits[h].category || 'unknown';
      catCount[cat] = (catCount[cat] || 0) + 1;
    }
    var dominantCat = '';
    var maxCount = 0;
    var cats = Object.keys(catCount);
    for (var c = 0; c < cats.length; c++) {
      if (catCount[cats[c]] > maxCount) {
        maxCount = catCount[cats[c]];
        dominantCat = cats[c];
      }
    }

    var dir = path.dirname(filePath) || '.';
    if (!dirMap[dir]) dirMap[dir] = [];
    dirMap[dir].push({ filePath: filePath, dominantCategory: dominantCat });
  }

  // Find directories where ≥3 files share the same dominant category
  var clusters = [];
  var dirs = Object.keys(dirMap);
  for (var d = 0; d < dirs.length; d++) {
    var files = dirMap[dirs[d]];
    if (files.length < 3) continue;

    // Group by dominant category within this directory
    var byCat = {};
    for (var f = 0; f < files.length; f++) {
      var dc = files[f].dominantCategory;
      if (!byCat[dc]) byCat[dc] = [];
      byCat[dc].push(files[f].filePath);
    }

    var dcKeys = Object.keys(byCat);
    for (var dk = 0; dk < dcKeys.length; dk++) {
      if (byCat[dcKeys[dk]].length >= 3) {
        clusters.push({
          directory: dirs[d],
          category: dcKeys[dk],
          fileCount: byCat[dcKeys[dk]].length,
          files: byCat[dcKeys[dk]],
        });
      }
    }
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// 3. Internal URL cross-references
// ---------------------------------------------------------------------------

function _findUrlCrossRefs(registry) {
  // Map: URL value → array of filePaths where it appears
  var urlMap = {};

  for (var i = 0; i < registry.length; i++) {
    var entry = registry[i];
    var filePath = entry.relativePath || entry.path || entry.filePath || '';
    var urlFindings = entry.urlFindings || [];

    for (var u = 0; u < urlFindings.length; u++) {
      var uf = urlFindings[u];
      // Only track internal-exposed URLs
      if (uf.classification !== 'internal-exposed') continue;
      var url = uf.url || '';
      if (!url) continue;

      if (!urlMap[url]) urlMap[url] = [];
      urlMap[url].push(filePath);
    }
  }

  // Filter to URLs appearing in ≥2 distinct files
  var crossRefs = [];
  var urls = Object.keys(urlMap);
  for (var k = 0; k < urls.length; k++) {
    var uniqueFiles = {};
    var locs = urlMap[urls[k]];
    for (var uf2 = 0; uf2 < locs.length; uf2++) {
      uniqueFiles[locs[uf2]] = true;
    }
    if (Object.keys(uniqueFiles).length >= 2) {
      crossRefs.push({
        url: urls[k],
        fileCount: Object.keys(uniqueFiles).length,
        files: Object.keys(uniqueFiles),
      });
    }
  }

  return crossRefs;
}

// ---------------------------------------------------------------------------
// 4. Cross-file clone pollution
// ---------------------------------------------------------------------------

// Extract function signatures from pattern hits or raw content summaries.
// A "signature" is a normalised function name shape: verb + noun stem.
function _extractSignatures(patternHits) {
  var sigs = [];
  for (var i = 0; i < patternHits.length; i++) {
    var hit = patternHits[i];
    if (hit.category !== 'clone-pollution') continue;
    // The line of a clone-pollution hit contains the function declaration
    var match = (hit.line || '').match(/\bfunction\s+(\w+)\s*\(/) ||
                (hit.line || '').match(/\b(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/);
    if (match) {
      sigs.push(match[1].toLowerCase());
    }
  }
  return sigs;
}

function _findClonePollution(registry) {
  // Map: normalised function name → array of filePaths
  var sigMap = {};

  for (var i = 0; i < registry.length; i++) {
    var entry = registry[i];
    var filePath = entry.relativePath || entry.path || entry.filePath || '';
    var sigs = _extractSignatures(entry.patternHits || []);

    for (var s = 0; s < sigs.length; s++) {
      if (!sigMap[sigs[s]]) sigMap[sigs[s]] = [];
      sigMap[sigs[s]].push(filePath);
    }
  }

  // Filter to signatures appearing in ≥2 distinct files
  var clones = [];
  var names = Object.keys(sigMap);
  for (var k = 0; k < names.length; k++) {
    var uniqueFiles = {};
    var locs = sigMap[names[k]];
    for (var l = 0; l < locs.length; l++) {
      uniqueFiles[locs[l]] = true;
    }
    if (Object.keys(uniqueFiles).length >= 2) {
      clones.push({
        functionName: names[k],
        fileCount: Object.keys(uniqueFiles).length,
        files: Object.keys(uniqueFiles),
      });
    }
  }

  return clones;
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

// correlate(registry) → { duplicateSecrets, slopClusters, urlCrossRef, clonePollutionMap }
//
// registry: array of per-file result objects from upstream layers.
function correlate(registry) {
  if (!Array.isArray(registry) || registry.length === 0) {
    return { duplicateSecrets: [], slopClusters: [], urlCrossRef: [], clonePollutionMap: [] };
  }

  return {
    duplicateSecrets:  _findDuplicateSecrets(registry),
    slopClusters:      _findSlopClusters(registry),
    urlCrossRef:       _findUrlCrossRefs(registry),
    clonePollutionMap: _findClonePollution(registry),
  };
}

module.exports = {
  correlate:              correlate,
  _findDuplicateSecrets:  _findDuplicateSecrets,
  _findSlopClusters:      _findSlopClusters,
  _findUrlCrossRefs:      _findUrlCrossRefs,
  _findClonePollution:    _findClonePollution,
};
