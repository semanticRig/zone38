'use strict';

// Compression-based AI code detection using zlib
// Two metrics:
// 1. Self-compression ratio: compressed_size / raw_size (AI code compresses more)
// 2. NCD (Normalized Compression Distance): structural similarity to reference corpora

var zlib = require('zlib');
var fs = require('fs');
var path = require('path');

/**
 * Compresses a string using gzip and returns the compressed size in bytes.
 */
function compressedSize(str) {
  var buf = Buffer.from(str, 'utf8');
  var compressed = zlib.gzipSync(buf, { level: 9 });
  return compressed.length;
}

/**
 * Calculates self-compression ratio: compressed_size / raw_size.
 * Lower ratio = more repetitive/compressible (AI-like).
 * Higher ratio = more complex/irregular (human-like).
 * Returns a value between 0 and 1 (typically 0.1 - 0.8 for code).
 */
function selfCompressionRatio(content) {
  if (!content || content.length === 0) return 1;
  var raw = Buffer.byteLength(content, 'utf8');
  var comp = compressedSize(content);
  return comp / raw;
}

/**
 * Calculates Normalized Compression Distance between two strings.
 * NCD(x,y) = (Z(xy) - min(Z(x), Z(y))) / max(Z(x), Z(y))
 * Lower NCD = more similar. Range: ~0 (identical) to ~1+ (very different).
 */
function ncd(strX, strY) {
  if (!strX || !strY) return 1;

  var zX = compressedSize(strX);
  var zY = compressedSize(strY);
  var zXY = compressedSize(strX + strY);

  var minZ = Math.min(zX, zY);
  var maxZ = Math.max(zX, zY);

  if (maxZ === 0) return 0;
  return (zXY - minZ) / maxZ;
}

// Cache for loaded corpora
var corpusCache = {};

/**
 * Loads a gzipped corpus file and returns its decompressed content.
 * Caches result to avoid repeated disk I/O.
 */
function loadCorpus(corpusPath) {
  if (corpusCache[corpusPath]) return corpusCache[corpusPath];

  var resolvedPath = path.resolve(corpusPath);
  try {
    var compressed = fs.readFileSync(resolvedPath);
    var content = zlib.gunzipSync(compressed).toString('utf8');
    corpusCache[corpusPath] = content;
    return content;
  } catch (err) {
    // Corpus not available — return null, callers handle gracefully
    return null;
  }
}

/**
 * Calculates compression analysis for a file's content.
 * Returns {
 *   selfRatio,       // self-compression ratio (0-1)
 *   ncdHuman,        // NCD against human corpus (null if corpus unavailable)
 *   ncdAI,           // NCD against AI corpus (null if corpus unavailable)
 *   compressionScore // normalized 0-100 score (higher = more AI-like)
 * }
 */
function analyzeCompression(content, corpusDir) {
  var selfRatio = selfCompressionRatio(content);

  var result = {
    selfRatio: Math.round(selfRatio * 1000) / 1000,
    ncdHuman: null,
    ncdAI: null,
    compressionScore: 0,
  };

  // Self-ratio scoring: AI code typically has ratio < 0.35, human > 0.45
  // Map ratio to a 0-100 contribution (lower ratio = higher score)
  var ratioScore = 0;
  if (selfRatio < 0.20) {
    ratioScore = 100;
  } else if (selfRatio < 0.30) {
    ratioScore = 80;
  } else if (selfRatio < 0.40) {
    ratioScore = 50;
  } else if (selfRatio < 0.50) {
    ratioScore = 25;
  } else {
    ratioScore = 0;
  }

  // If corpora are available, compute NCD distances
  var ncdScore = 0;
  var hasCorpora = false;

  if (corpusDir) {
    var humanCorpus = loadCorpus(path.join(corpusDir, 'human.js.gz'));
    var aiCorpus = loadCorpus(path.join(corpusDir, 'ai.js.gz'));

    if (humanCorpus && aiCorpus) {
      hasCorpora = true;
      var ncdH = ncd(content, humanCorpus);
      var ncdA = ncd(content, aiCorpus);
      result.ncdHuman = Math.round(ncdH * 1000) / 1000;
      result.ncdAI = Math.round(ncdA * 1000) / 1000;

      // NCD scoring: closer to AI corpus = higher score
      // If ncdAI < ncdHuman, file is more like AI code
      if (ncdA < ncdH) {
        var diff = ncdH - ncdA;
        ncdScore = Math.min(100, Math.round(diff * 200));
      }
    }
  }

  // Final compression score: blend self-ratio and NCD (if available)
  if (hasCorpora) {
    result.compressionScore = Math.round(ratioScore * 0.5 + ncdScore * 0.5);
  } else {
    result.compressionScore = ratioScore;
  }

  return result;
}

/**
 * Clears the corpus cache (useful for testing).
 */
function clearCorpusCache() {
  corpusCache = {};
}

module.exports = {
  compressedSize: compressedSize,
  selfCompressionRatio: selfCompressionRatio,
  ncd: ncd,
  loadCorpus: loadCorpus,
  analyzeCompression: analyzeCompression,
  clearCorpusCache: clearCorpusCache,
};
