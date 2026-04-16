'use strict';

// Layer 3 — Compression Texture Analysis
// Measures AI-slop texture at file level via NCD and segmented compression.
// Mutates fileRecord.compression in place and returns it.
// Output shape: { selfRatio, ncdHuman, ncdAI, segmentScores, projectOutlierScore }

var zlib = require('zlib');
var fs = require('fs');
var path = require('path');

// Default corpus directory relative to this file
var DEFAULT_CORPUS_DIR = path.join(__dirname, '..', '..', 'corpus');

// Corpus cache — avoid repeated disk I/O across files in the same scan
var _corpusCache = {};

function _compressedSize(str) {
  var buf = Buffer.from(str, 'utf8');
  return zlib.gzipSync(buf, { level: 9 }).length;
}

// selfCompressionRatio: compressed_size / raw_size
// Lower = more repetitive (AI-like). Higher = more irregular (human-like).
function selfCompressionRatio(content) {
  if (!content || content.length === 0) return 1;
  var raw = Buffer.byteLength(content, 'utf8');
  return _compressedSize(content) / raw;
}

// NCD(x, y) = (Z(xy) - min(Z(x), Z(y))) / max(Z(x), Z(y))
// Low NCD = structurally similar. Range: ~0 (identical) to ~1+ (very different).
function ncd(x, y) {
  if (!x || !y) return 1;
  var zX = _compressedSize(x);
  var zY = _compressedSize(y);
  var zXY = _compressedSize(x + y);
  var minZ = Math.min(zX, zY);
  var maxZ = Math.max(zX, zY);
  if (maxZ === 0) return 0;
  return (zXY - minZ) / maxZ;
}

// Load a .gz corpus file, decompressing and caching on first use.
function _loadCorpus(corpusPath) {
  if (_corpusCache[corpusPath]) return _corpusCache[corpusPath];
  try {
    var compressed = fs.readFileSync(path.resolve(corpusPath));
    var content = zlib.gunzipSync(compressed).toString('utf8');
    _corpusCache[corpusPath] = content;
    return content;
  } catch (_e) {
    return null;
  }
}

// segmentedCompression: slide a window of `windowSize` lines across the file,
// compute the self-compression ratio of each window.
// Returns an array of { startLine, endLine, ratio } objects.
// This localises repetitive regions rather than treating the file as a blob.
function segmentedCompression(content, windowSize) {
  windowSize = windowSize || 30;
  var lines = content.split('\n');
  if (lines.length < windowSize) {
    // File too short for windowing — return a single segment
    return [{ startLine: 0, endLine: lines.length - 1, ratio: selfCompressionRatio(content) }];
  }

  var results = [];
  var step = Math.max(1, Math.floor(windowSize / 2)); // 50% overlap

  for (var i = 0; i + windowSize <= lines.length; i += step) {
    var segment = lines.slice(i, i + windowSize).join('\n');
    results.push({
      startLine: i,
      endLine: i + windowSize - 1,
      ratio: selfCompressionRatio(segment),
    });
  }

  return results;
}

// Map self-compression ratio to a 0-100 AI-texture score.
// Normal JS: ratio 0.35+ → 0. Very repetitive: ratio < 0.20 → 50-100.
function _ratioScore(selfRatio) {
  if (selfRatio < 0.20) {
    return 50 + ((0.20 - selfRatio) / 0.20) * 50;
  } else if (selfRatio < 0.35) {
    return ((0.35 - selfRatio) / 0.15) * 50;
  }
  return 0;
}

// Map NCD pair (ncdHuman, ncdAI) to a 0-100 NCD contribution score.
// Low NCD against AI corpus + high NCD against human = strong AI signal.
function _ncdScore(ncdHuman, ncdAI) {
  if (ncdHuman === null || ncdAI === null) return 0;
  // ncdAI close to 0 + ncdHuman far from 0 → high score
  var divergence = ncdAI - ncdHuman; // negative = closer to AI corpus
  if (divergence < -0.05) {
    // Meaningfully closer to AI corpus than to human corpus
    return Math.min(100, Math.round((-divergence / 0.30) * 100));
  }
  return 0;
}

// Main analysis function. Populates fileRecord.compression in place.
function analyseFile(fileRecord, content, corpusDir) {
  corpusDir = corpusDir || DEFAULT_CORPUS_DIR;

  var selfRatio = selfCompressionRatio(content);
  var segments = segmentedCompression(content, 30);

  var ncdHuman = null;
  var ncdAI = null;

  var humanCorpus = _loadCorpus(path.join(corpusDir, 'human.js.gz'));
  var aiCorpus = _loadCorpus(path.join(corpusDir, 'ai.js.gz'));

  if (humanCorpus && aiCorpus) {
    ncdHuman = Math.round(ncd(content, humanCorpus) * 1000) / 1000;
    ncdAI = Math.round(ncd(content, aiCorpus) * 1000) / 1000;
  }

  // Combine signals: 60% self-ratio, 40% NCD divergence
  var rScore = _ratioScore(selfRatio);
  var nScore = _ncdScore(ncdHuman, ncdAI);
  var compressionScore = Math.min(100, Math.round(rScore * 0.6 + nScore * 0.4));

  var result = {
    selfRatio: Math.round(selfRatio * 1000) / 1000,
    ncdHuman: ncdHuman,
    ncdAI: ncdAI,
    segmentScores: segments,
    // Populated at Layer 12 (project-level calibration) — placeholder for now
    projectOutlierScore: 0,
    compressionScore: compressionScore,
  };

  if (fileRecord) {
    fileRecord.compression = result;
  }
  return result;
}

module.exports = {
  selfCompressionRatio: selfCompressionRatio,
  ncd: ncd,
  segmentedCompression: segmentedCompression,
  analyseFile: analyseFile,
};
