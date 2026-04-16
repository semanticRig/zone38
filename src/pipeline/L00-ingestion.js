'use strict';

// Layer 0 — Project Ingestion
// Walks the full file tree and builds a registry of file metadata records.
// Output: array of { path, relativePath, ext, size, depth, territory }

var fs = require('fs');
var path = require('path');

var SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.cache', '.parcel-cache', '.turbo', 'out', '__pycache__', '.nyc_output',
]);

var SCAN_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
]);

// Segments whose presence anywhere in the relative path marks territory.
// Order matters: first match wins.
var TERRITORY_RULES = [
  { territory: 'vendor',       test: function (rel) { return rel.indexOf('vendor/') !== -1 || rel.indexOf('/vendor/') !== -1; } },
  { territory: 'dist',         test: function (rel) { return rel.indexOf('dist/') !== -1 || rel.indexOf('/dist/') !== -1 || rel.indexOf('build/') !== -1; } },
  { territory: 'node_modules', test: function (rel) { return rel.indexOf('node_modules/') !== -1; } },
  { territory: 'test',         test: function (rel) { return rel.indexOf('test/') !== -1 || rel.indexOf('tests/') !== -1 || rel.indexOf('__tests__/') !== -1 || rel.indexOf('.test.') !== -1 || rel.indexOf('.spec.') !== -1; } },
  { territory: 'config',       test: function (rel) { var base = path.basename(rel); return base.indexOf('config') !== -1 || base.indexOf('.rc.') !== -1 || base.indexOf('.rc') === base.length - 3 || rel.indexOf('config/') !== -1; } },
];

function classifyTerritory(relPath) {
  var rel = relPath.replace(/\\/g, '/');
  for (var i = 0; i < TERRITORY_RULES.length; i++) {
    if (TERRITORY_RULES[i].test(rel)) return TERRITORY_RULES[i].territory;
  }
  return 'application';
}

// Count path depth from rootDir (number of directory separators).
function pathDepth(relPath) {
  var normalized = relPath.replace(/\\/g, '/');
  var count = 0;
  for (var i = 0; i < normalized.length; i++) {
    if (normalized[i] === '/') count++;
  }
  return count;
}

function walkProject(rootDir) {
  var results = [];
  var absRoot = path.resolve(rootDir);

  function walk(dir, depth) {
    var entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      return; // unreadable directory — skip silently
    }

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var absPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(absPath, depth + 1);
      } else if (entry.isFile()) {
        var ext = path.extname(entry.name).toLowerCase();
        if (!SCAN_EXTENSIONS.has(ext)) continue;

        var relPath = path.relative(absRoot, absPath);
        var stat;
        try {
          stat = fs.statSync(absPath);
        } catch (_e) {
          continue;
        }

        results.push({
          path: absPath,
          relativePath: relPath,
          ext: ext,
          size: stat.size,
          depth: depth,
          territory: classifyTerritory(relPath),
          // role is populated by L01-role.js
          role: null,
          // surface/compression/candidates/findings are populated by downstream layers
          surface: null,
          compression: null,
          candidates: null,
          findings: null,
          review: null,
        });
      }
    }
  }

  walk(absRoot, 0);
  return results;
}

function buildSingleFileEntry(absPath) {
  var stat;
  try {
    stat = fs.statSync(absPath);
  } catch (_e) {
    return [];
  }
  var ext = path.extname(absPath).toLowerCase();
  if (!SCAN_EXTENSIONS.has(ext)) return [];
  var relPath = path.basename(absPath);
  return [{
    path: absPath,
    relativePath: relPath,
    ext: ext,
    size: stat.size,
    depth: 0,
    territory: classifyTerritory(relPath),
    role: null,
    surface: null,
    compression: null,
    candidates: null,
    findings: null,
    review: null,
  }];
}

function buildRegistry(rootDir) {
  var absRoot = path.resolve(rootDir);
  var stat;
  try {
    stat = fs.statSync(absRoot);
  } catch (_e) {
    return [];
  }
  if (stat.isFile()) return buildSingleFileEntry(absRoot);
  return walkProject(rootDir);
}

module.exports = {
  walkProject: walkProject,
  buildRegistry: buildRegistry,
  // Exposed for tests
  classifyTerritory: classifyTerritory,
};
