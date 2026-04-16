'use strict';

// Character frequency profile + Shannon entropy.
// Computes 4-bucket char distribution (upper/lower/digit/symbol),
// Euclidean distance from code/secret reference profiles, and Shannon entropy.
// Output: { entropy, distanceFromCode, distanceFromSecret, signal: 0-1 }
// signal ≈ 0 = code-like; signal ≈ 1 = secret-like.

// Reference char-type profiles (empirically derived)
var CODE_PROFILE    = { upper: 0.05, lower: 0.75, digit: 0.10, symbol: 0.10 };
var SECRET_PROFILE  = { upper: 0.25, lower: 0.25, digit: 0.25, symbol: 0.25 };

function _entropy(str) {
  if (!str || str.length <= 1) return 0;
  var freq = {};
  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    freq[c] = (freq[c] || 0) + 1;
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

function _euclidean(a, b) {
  return Math.sqrt(
    Math.pow(a.upper  - b.upper,  2) +
    Math.pow(a.lower  - b.lower,  2) +
    Math.pow(a.digit  - b.digit,  2) +
    Math.pow(a.symbol - b.symbol, 2)
  );
}

function analyse(value) {
  if (!value || value.length <= 1) {
    return { entropy: 0, distanceFromCode: 0, distanceFromSecret: 0, signal: 0.5 };
  }

  var counts = { upper: 0, lower: 0, digit: 0, symbol: 0 };
  for (var i = 0; i < value.length; i++) {
    var c = value[i];
    if (c >= 'A' && c <= 'Z') counts.upper++;
    else if (c >= 'a' && c <= 'z') counts.lower++;
    else if (c >= '0' && c <= '9') counts.digit++;
    else counts.symbol++;
  }

  var len = value.length;
  var profile = {
    upper:  counts.upper  / len,
    lower:  counts.lower  / len,
    digit:  counts.digit  / len,
    symbol: counts.symbol / len,
  };

  var dCode   = _euclidean(profile, CODE_PROFILE);
  var dSecret = _euclidean(profile, SECRET_PROFILE);
  var denom   = dCode + dSecret;
  var signal  = denom === 0 ? 0.5 : dCode / denom;

  return {
    entropy:           _entropy(value),
    distanceFromCode:   dCode,
    distanceFromSecret: dSecret,
    signal:             Math.max(0, Math.min(1, signal)),
  };
}

module.exports = { analyse: analyse, _entropy: _entropy };
