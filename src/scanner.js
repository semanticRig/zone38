'use strict';

var fs = require('fs');
var path = require('path');
var rules = require('./rules');
var entropy = require('./entropy');
var compression = require('./compression');
var scorer = require('./scorer');

// Default corpus directory (relative to this file)
var DEFAULT_CORPUS_DIR = path.join(__dirname, '..', 'corpus');

// Directories to always skip during file discovery
var SKIP_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.cache', '.parcel-cache', '.turbo', 'out', '__pycache__',
];

// File extensions to scan
var SCAN_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
]);

// Path segments that indicate backend context
var BACKEND_SIGNALS = [
  'server', 'api', 'route', 'controller', 'middleware',
  'handler', 'model', 'db', 'migration', 'worker', 'cron', 'queue',
];

// Path segments that indicate frontend context
var FRONTEND_SIGNALS = [
  'component', 'page', 'view', 'layout', 'hook',
  'context', 'store', 'ui', 'widget', 'screen',
];

/**
 * Checks if a file path indicates backend code.
 * Uses directory names and path segments as heuristics.
 */
function isBackendFile(filePath) {
  var lower = filePath.toLowerCase().replace(/\\/g, '/');
  for (var i = 0; i < BACKEND_SIGNALS.length; i++) {
    if (lower.indexOf('/' + BACKEND_SIGNALS[i] + '/') !== -1 ||
        lower.indexOf('/' + BACKEND_SIGNALS[i] + '.') !== -1 ||
        lower.indexOf(BACKEND_SIGNALS[i] + '/') === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a file path indicates frontend code.
 * Uses directory names, path segments, and file extensions as heuristics.
 */
function isFrontendFile(filePath) {
  var lower = filePath.toLowerCase().replace(/\\/g, '/');
  var ext = path.extname(lower);
  if (ext === '.jsx' || ext === '.tsx') {
    return true;
  }
  for (var i = 0; i < FRONTEND_SIGNALS.length; i++) {
    if (lower.indexOf('/' + FRONTEND_SIGNALS[i] + '/') !== -1 ||
        lower.indexOf('/' + FRONTEND_SIGNALS[i] + '.') !== -1 ||
        lower.indexOf(FRONTEND_SIGNALS[i] + '/') === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively walks a directory and returns an array of scannable file paths.
 * Skips directories in SKIP_DIRS and only includes files with SCAN_EXTENSIONS.
 */
function walkDir(dir) {
  var results = [];
  var resolvedDir = path.resolve(dir);
  var entries;

  try {
    entries = fs.readdirSync(resolvedDir);
  } catch (err) {
    // Silently skip directories we cannot read
    return results;
  }

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];

    // Skip hidden files/dirs (except those we explicitly want)
    if (entry.charAt(0) === '.' && entry !== '.vscode' && entry !== '.cursor') {
      continue;
    }

    if (SKIP_DIRS.indexOf(entry) !== -1) {
      continue;
    }

    var fullPath = path.join(resolvedDir, entry);
    var stat;

    try {
      stat = fs.statSync(fullPath);
    } catch (err) {
      continue;
    }

    if (stat.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else if (stat.isFile()) {
      var ext = path.extname(entry).toLowerCase();
      if (SCAN_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Discovers files and builds context objects for each.
 * Returns an array of { filePath, fileName, relativePath, isBackend, isFrontend }.
 */
function discoverFiles(targetPath) {
  var resolvedTarget = path.resolve(targetPath);
  var stat;

  try {
    stat = fs.statSync(resolvedTarget);
  } catch (err) {
    process.stderr.write('Error: path not found: ' + targetPath + '\n');
    return [];
  }

  var filePaths;
  if (stat.isFile()) {
    filePaths = [resolvedTarget];
  } else {
    filePaths = walkDir(resolvedTarget);
  }

  return filePaths.map(function (fp) {
    var relativePath = path.relative(resolvedTarget, fp);
    return {
      filePath: fp,
      fileName: path.basename(fp),
      relativePath: relativePath || path.basename(fp),
      isBackend: isBackendFile(relativePath || fp),
      isFrontend: isFrontendFile(relativePath || fp),
    };
  });
}

/**
 * Scans a single file against all pattern rules.
 * Returns { filePath, relativePath, isBackend, isFrontend, hits[] }
 * Each hit: { ruleId, ruleName, category, severity, line, lineNumber, fix }
 */
function scanFile(filePath, basePath) {
  var content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { filePath: filePath, hits: [], error: err.message };
  }

  var lines = content.split('\n');
  var relativePath = basePath ? path.relative(path.resolve(basePath), filePath) : path.basename(filePath);
  var isBackend = isBackendFile(relativePath || filePath);
  var isFrontend = isFrontendFile(relativePath || filePath);

  var ctx = {
    filePath: filePath,
    fileName: path.basename(filePath),
    lines: lines,
    lineIndex: 0,
    isBackend: isBackend,
    isFrontend: isFrontend,
  };

  var hits = [];

  for (var i = 0; i < lines.length; i++) {
    ctx.lineIndex = i;
    for (var r = 0; r < rules.length; r++) {
      var rule = rules[r];
      if (rule.test(lines[i], ctx)) {
        hits.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          severity: rule.severity,
          line: lines[i],
          lineNumber: i + 1,
          fix: rule.fix,
        });
      }
    }
  }

  // Run entropy analysis on file content
  var entropyFindings = entropy.analyzeFileEntropy(content);

  // Run compression analysis
  var compressionResult = compression.analyzeCompression(content, DEFAULT_CORPUS_DIR);

  return {
    filePath: filePath,
    relativePath: relativePath || path.basename(filePath),
    isBackend: isBackend,
    isFrontend: isFrontend,
    hits: hits,
    entropyFindings: entropyFindings,
    compression: compressionResult,
  };
}

/**
 * Scans all discovered files and returns per-file results.
 */
function scanAll(targetPath) {
  var files = discoverFiles(targetPath);
  var fileResults = files.map(function (f) {
    return scanFile(f.filePath, targetPath);
  });
  var projectScore = scorer.scoreProject(fileResults);
  return {
    files: fileResults,
    project: projectScore,
  };
}

module.exports = {
  walkDir: walkDir,
  discoverFiles: discoverFiles,
  scanFile: scanFile,
  scanAll: scanAll,
  isBackendFile: isBackendFile,
  isFrontendFile: isFrontendFile,
  SCAN_EXTENSIONS: SCAN_EXTENSIONS,
  SKIP_DIRS: SKIP_DIRS,
};
