'use strict';

// 6-Dimensional Solution Vector Engine
// Heavyweight detector for ambiguous strings that the fast pipeline could not classify.
// Computes 6 independent mathematical dimensions and combines them into a final score.

var zlib = require('zlib');

// Reference profiles for distance calculations
var ENGLISH_PROFILE = { uppercase: 0.02, lowercase: 0.82, digits: 0.03, symbols: 0.13 };
var CODE_PROFILE = { uppercase: 0.05, lowercase: 0.75, digits: 0.10, symbols: 0.10 };
var SECRET_PROFILE = { uppercase: 0.25, lowercase: 0.25, digits: 0.25, symbols: 0.25 };

// Maximum possible Euclidean distance for 4 buckets summing to 1.0 = sqrt(4) = 2.0
var MAX_DISTANCE = 2.0;

/**
 * Computes Shannon entropy of a string (independent from Stage 2).
 */
function shannonEntropy(str) {
  if (!str || str.length <= 1) return 0;

  var freq = {};
  for (var i = 0; i < str.length; i++) {
    var ch = str[i];
    freq[ch] = (freq[ch] || 0) + 1;
  }

  var len = str.length;
  var entropy = 0;
  var keys = Object.keys(freq);
  for (var j = 0; j < keys.length; j++) {
    var p = freq[keys[j]] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Computes character type profile for a string.
 */
function charProfile(str) {
  var counts = { uppercase: 0, lowercase: 0, digits: 0, symbols: 0 };
  for (var i = 0; i < str.length; i++) {
    var ch = str[i];
    if (ch >= 'A' && ch <= 'Z') counts.uppercase++;
    else if (ch >= 'a' && ch <= 'z') counts.lowercase++;
    else if (ch >= '0' && ch <= '9') counts.digits++;
    else counts.symbols++;
  }
  var len = str.length;
  return {
    uppercase: counts.uppercase / len,
    lowercase: counts.lowercase / len,
    digits: counts.digits / len,
    symbols: counts.symbols / len,
  };
}

/**
 * Euclidean distance between two 4-bucket profiles.
 */
function euclideanDist(a, b) {
  var sum = 0;
  sum += Math.pow(a.uppercase - b.uppercase, 2);
  sum += Math.pow(a.lowercase - b.lowercase, 2);
  sum += Math.pow(a.digits - b.digits, 2);
  sum += Math.pow(a.symbols - b.symbols, 2);
  return Math.sqrt(sum);
}

/**
 * Returns the character type bucket for a character.
 */
function charType(ch) {
  if (ch >= 'A' && ch <= 'Z') return 0; // uppercase
  if (ch >= 'a' && ch <= 'z') return 1; // lowercase
  if (ch >= '0' && ch <= '9') return 2; // digit
  return 3; // symbol
}

/**
 * Dimension 1: Shannon entropy, normalized by theoretical max.
 */
function dimEntropy(str) {
  var entropy = shannonEntropy(str);
  var uniqueChars = Object.keys(str.split('').reduce(function (acc, ch) {
    acc[ch] = true;
    return acc;
  }, {})).length;
  var theoreticalMax = Math.log2(uniqueChars);
  if (theoreticalMax === 0) return 0;
  return Math.min(1, entropy / theoreticalMax);
}

/**
 * Dimension 2: Compressibility (Kolmogorov approximation).
 */
function dimCompressibility(str) {
  if (str.length < 80) {
    // Short-medium strings: gzip header dominates, use unique char ratio instead
    var unique = Object.keys(str.split('').reduce(function (acc, ch) {
      acc[ch] = true;
      return acc;
    }, {})).length;
    return Math.min(1, unique / str.length);
  }

  var raw = Buffer.from(str, 'utf8');
  var compressed = zlib.gzipSync(raw, { level: 9 });
  var ratio = compressed.length / raw.length;

  // Normalize: cap at 1.5 then scale to 0-1
  if (ratio > 1.5) ratio = 1.5;
  return Math.min(1, ratio / 1.5);
}

/**
 * Dimension 3: Distance from natural English text profile.
 */
function dimEnglishDist(str) {
  var profile = charProfile(str);
  return Math.min(1, euclideanDist(profile, ENGLISH_PROFILE) / MAX_DISTANCE);
}

/**
 * Dimension 4: Distance from code/config profile.
 */
function dimCodeDist(str) {
  var profile = charProfile(str);
  return Math.min(1, euclideanDist(profile, CODE_PROFILE) / MAX_DISTANCE);
}

/**
 * Dimension 5: Inverted distance from secret profile (closer = higher).
 */
function dimSecretProximity(str) {
  var profile = charProfile(str);
  var dist = euclideanDist(profile, SECRET_PROFILE) / MAX_DISTANCE;
  return 1 - Math.min(1, dist);
}

/**
 * Dimension 6: Character type alternation count.
 */
function dimAlternation(str) {
  if (str.length <= 1) return 0;
  var alternations = 0;
  var prevType = charType(str[0]);
  for (var i = 1; i < str.length; i++) {
    var curType = charType(str[i]);
    if (curType !== prevType) alternations++;
    prevType = curType;
  }
  return alternations / (str.length - 1);
}

/**
 * Computes the 6-dimensional vector score for a string.
 * Returns a number 0-1 where >= 0.5 means secret.
 */
function vectorScore(str) {
  if (!str || str.length === 0) return 0;

  var dims = [
    dimEntropy(str),
    dimCompressibility(str),
    dimEnglishDist(str),
    dimCodeDist(str),
    dimSecretProximity(str),
    dimAlternation(str),
  ];

  // Equal weights for v1
  var weight = 1 / 6;
  var score = 0;
  for (var i = 0; i < dims.length; i++) {
    score += dims[i] * weight;
  }

  return score;
}

module.exports = {
  vectorScore: vectorScore,
  // Expose dimensions for testing
  dimEntropy: dimEntropy,
  dimCompressibility: dimCompressibility,
  dimEnglishDist: dimEnglishDist,
  dimCodeDist: dimCodeDist,
  dimSecretProximity: dimSecretProximity,
  dimAlternation: dimAlternation,
};
