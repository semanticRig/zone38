'use strict';

// 6-dimensional vector engine.
// Runs only on ambiguous strings routed from the aggregator.
//
// D1: Shannon entropy normalised by log2(unique chars) — not theoretical max.
//     Measures how close the string is to maximum entropy for its alphabet size.
// D2: Kolmogorov approximation. For strings < 80 chars gzip header dominates,
//     so we use unique-char density (unique/length) instead. High density = random.
//     For longer strings: gzip ratio / 1.5 (capped).
// D3: Distance from natural-English character profile (high = not English)
// D4: Distance from code/config character profile (high = not code)
// D5: Proximity to known-secret profile (1 - normalised distance)
// D6: Character-type alternation count (fraction of consecutive positions that change)
//
// Equal weights (1/6 each) — empirically validated on test corpus.
// Threshold: 0.50 (do NOT change without labeled test data + justification)
// Output: { score: 0-1, dimensions: [d1,d2,d3,d4,d5,d6], isSecret: boolean }

var zlib = require('zlib');

// Maximum Euclidean distance for 4 buckets summing to 1.0 = sqrt(4) = 2.0
var MAX_DISTANCE = 2.0;

var ENGLISH_PROFILE = { upper: 0.02, lower: 0.82, digit: 0.03, symbol: 0.13 };
var CODE_PROFILE    = { upper: 0.05, lower: 0.75, digit: 0.10, symbol: 0.10 };
var SECRET_PROFILE  = { upper: 0.25, lower: 0.25, digit: 0.25, symbol: 0.25 };

var THRESHOLD = 0.50;

function _entropy(str) {
  if (!str || str.length <= 1) return 0;
  var freq = {};
  for (var i = 0; i < str.length; i++) {
    freq[str[i]] = (freq[str[i]] || 0) + 1;
  }
  var len = str.length;
  var h = 0;
  var keys = Object.keys(freq);
  for (var j = 0; j < keys.length; j++) {
    var p = freq[keys[j]] / len;
    h -= p * Math.log2(p);
  }
  return h;
}

function _uniqueCount(str) {
  var seen = {};
  for (var i = 0; i < str.length; i++) seen[str[i]] = true;
  return Object.keys(seen).length;
}

function _charProfile(str) {
  var counts = { upper: 0, lower: 0, digit: 0, symbol: 0 };
  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    if (c >= 'A' && c <= 'Z') counts.upper++;
    else if (c >= 'a' && c <= 'z') counts.lower++;
    else if (c >= '0' && c <= '9') counts.digit++;
    else counts.symbol++;
  }
  var len = str.length;
  return { upper: counts.upper/len, lower: counts.lower/len, digit: counts.digit/len, symbol: counts.symbol/len };
}

function _euclidean(a, b) {
  return Math.sqrt(
    Math.pow(a.upper - b.upper, 2) + Math.pow(a.lower - b.lower, 2) +
    Math.pow(a.digit - b.digit, 2) + Math.pow(a.symbol - b.symbol, 2)
  );
}

function _charType(c) {
  if (c >= 'A' && c <= 'Z') return 0;
  if (c >= 'a' && c <= 'z') return 1;
  if (c >= '0' && c <= '9') return 2;
  return 3;
}

function _d1(str) {
  var e = _entropy(str);
  var u = _uniqueCount(str);
  var maxE = Math.log2(u);
  if (maxE === 0) return 0;
  return Math.min(1, e / maxE);
}

function _d2(str) {
  if (str.length < 80) {
    // gzip header (~18 bytes) dominates short strings — unique-char density is more reliable
    return Math.min(1, _uniqueCount(str) / str.length);
  }
  var raw = Buffer.from(str, 'utf8');
  var comp = zlib.gzipSync(raw, { level: 9 });
  var ratio = comp.length / raw.length;
  if (ratio > 1.5) ratio = 1.5;
  return Math.min(1, ratio / 1.5);
}

function _d3(str) { return Math.min(1, _euclidean(_charProfile(str), ENGLISH_PROFILE) / MAX_DISTANCE); }
function _d4(str) { return Math.min(1, _euclidean(_charProfile(str), CODE_PROFILE)    / MAX_DISTANCE); }
function _d5(str) { return 1 - Math.min(1, _euclidean(_charProfile(str), SECRET_PROFILE) / MAX_DISTANCE); }

function _d6(str) {
  if (str.length <= 1) return 0;
  var changes = 0;
  var prev = _charType(str[0]);
  for (var i = 1; i < str.length; i++) {
    var cur = _charType(str[i]);
    if (cur !== prev) changes++;
    prev = cur;
  }
  return changes / (str.length - 1);
}

function score(value) {
  if (!value || typeof value !== 'string' || value.length === 0) {
    return { score: 0, dimensions: [0, 0, 0, 0, 0, 0], isSecret: false };
  }

  var dims = [_d1(value), _d2(value), _d3(value), _d4(value), _d5(value), _d6(value)];
  var w = 1 / 6;
  var s = 0;
  for (var i = 0; i < dims.length; i++) s += dims[i] * w;

  return {
    score:      Math.round(s * 1000) / 1000,
    dimensions: dims.map(function (d) { return Math.round(d * 1000) / 1000; }),
    isSecret:   s >= THRESHOLD,
  };
}

module.exports = {
  THRESHOLD: THRESHOLD,
  score:     score,
};
