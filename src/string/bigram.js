'use strict';

// Bigram entropy ratio signal.
// Measures whether character TRANSITIONS are structured or random.
// English text has very predictable bigram distribution ("th", "he", "in", ...).
// Secrets/tokens have near-uniform bigram distribution.
// Output: { bigramEntropy, charEntropy, ratio, signal: 0-1 }
// signal ≈ 0 = structured transitions; signal ≈ 1 = random transitions.

var charFreq = require('./char-frequency.js');

function analyse(value) {
  if (!value || value.length < 4) {
    return { bigramEntropy: 0, charEntropy: 0, ratio: 0, signal: 0.5 };
  }

  var charEntropy = charFreq._entropy(value);
  if (charEntropy === 0) {
    return { bigramEntropy: 0, charEntropy: 0, ratio: 0, signal: 0.5 };
  }

  var freq = {};
  var total = value.length - 1;
  for (var i = 0; i < total; i++) {
    var bg = value[i] + value[i + 1];
    freq[bg] = (freq[bg] || 0) + 1;
  }

  var bigramEntropy = 0;
  var keys = Object.keys(freq);
  for (var j = 0; j < keys.length; j++) {
    var p = freq[keys[j]] / total;
    bigramEntropy -= p * Math.log2(p);
  }

  var ratio = bigramEntropy / charEntropy;

  // ratio > 1 means bigrams are more diverse than individual chars:
  // that's a structured signal (repeated substrings). Mirror it back.
  if (ratio > 1.0) ratio = Math.max(0, 2.0 - ratio);

  var signal;
  if (ratio <= 0.85) {
    signal = (ratio / 0.85) * 0.3;
  } else if (ratio >= 0.95) {
    signal = 0.7 + ((ratio - 0.95) / 0.05) * 0.3;
  } else {
    signal = 0.3 + ((ratio - 0.85) / 0.10) * 0.4;
  }

  return {
    bigramEntropy: bigramEntropy,
    charEntropy:   charEntropy,
    ratio:         ratio,
    signal:        Math.max(0, Math.min(1, signal)),
  };
}

module.exports = { analyse: analyse };
