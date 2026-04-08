'use strict';

// Stage 2: Character Frequency Profile
// Computes character type distribution and produces a signal (0-1)
// indicating how secret-like a string is, plus Shannon entropy.

// Reference profiles: typical character type distributions
var CODE_PROFILE = { uppercase: 0.05, lowercase: 0.75, digits: 0.10, symbols: 0.10 };
var SECRET_PROFILE = { uppercase: 0.25, lowercase: 0.25, digits: 0.25, symbols: 0.25 };

/**
 * Computes Shannon entropy of a string.
 * H = -sum(p_i * log2(p_i)) for each unique character.
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
 * Computes Euclidean distance between two 4-bucket profiles.
 */
function euclideanDistance(profileA, profileB) {
  var sum = 0;
  sum += Math.pow(profileA.uppercase - profileB.uppercase, 2);
  sum += Math.pow(profileA.lowercase - profileB.lowercase, 2);
  sum += Math.pow(profileA.digits - profileB.digits, 2);
  sum += Math.pow(profileA.symbols - profileB.symbols, 2);
  return Math.sqrt(sum);
}

/**
 * Computes character frequency signal for a string.
 * Returns { signal: number (0-1), charEntropy: number }.
 * signal closer to 0 = looks like code. Closer to 1 = looks like secret.
 */
function charFrequencySignal(str) {
  if (!str || str.length <= 1) {
    return { signal: 0.5, charEntropy: 0 };
  }

  var counts = { uppercase: 0, lowercase: 0, digits: 0, symbols: 0 };
  for (var i = 0; i < str.length; i++) {
    var ch = str[i];
    if (ch >= 'A' && ch <= 'Z') counts.uppercase++;
    else if (ch >= 'a' && ch <= 'z') counts.lowercase++;
    else if (ch >= '0' && ch <= '9') counts.digits++;
    else counts.symbols++;
  }

  var len = str.length;
  var profile = {
    uppercase: counts.uppercase / len,
    lowercase: counts.lowercase / len,
    digits: counts.digits / len,
    symbols: counts.symbols / len,
  };

  var distFromCode = euclideanDistance(profile, CODE_PROFILE);
  var distFromSecret = euclideanDistance(profile, SECRET_PROFILE);

  // Avoid division by zero when both distances are 0
  var denom = distFromCode + distFromSecret;
  var signal = denom === 0 ? 0.5 : distFromCode / denom;

  var charEntropy = shannonEntropy(str);

  return { signal: signal, charEntropy: charEntropy };
}

module.exports = { charFrequencySignal, shannonEntropy };
