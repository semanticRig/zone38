'use strict';

// Stage 3: Bigram Entropy Ratio
// Measures whether character TRANSITIONS are structured or random.
// Structured strings have predictable pairs; secrets have flat noise.

/**
 * Computes bigram entropy signal for a string.
 * Accepts charEntropy from Stage 2 to avoid recomputation.
 * Returns a signal (0-1): closer to 0 = structured, closer to 1 = random/secret-like.
 */
function bigramSignal(str, charEntropy) {
  // Insufficient data for meaningful bigram analysis
  if (!str || str.length < 4 || charEntropy === 0) {
    return 0.5;
  }

  // Build bigram frequency map
  var freq = {};
  var totalBigrams = str.length - 1;

  for (var i = 0; i < totalBigrams; i++) {
    var bigram = str[i] + str[i + 1];
    freq[bigram] = (freq[bigram] || 0) + 1;
  }

  // Shannon entropy on bigram distribution
  var bigramEntropy = 0;
  var keys = Object.keys(freq);
  for (var j = 0; j < keys.length; j++) {
    var p = freq[keys[j]] / totalBigrams;
    bigramEntropy -= p * Math.log2(p);
  }

  // Ratio: bigram entropy relative to character entropy
  var ratio = bigramEntropy / charEntropy;

  // Ratio > 1.0 means bigram entropy exceeds char entropy — this happens when
  // characters repeat but transitions remain diverse (structured, not random).
  // Mirror back into the structured zone: 1.1→0.9, 1.3→0.7, etc.
  if (ratio > 1.0) {
    ratio = Math.max(0, 2.0 - ratio);
  }

  // Map ratio to signal (clamped to 0-1)
  var signal;
  if (ratio <= 0.85) {
    // Clearly structured transitions
    signal = (ratio / 0.85) * 0.3;
  } else if (ratio >= 0.95) {
    // Clearly random transitions
    signal = 0.7 + ((ratio - 0.95) / 0.05) * 0.3;
  } else {
    // Uncertain zone: 0.85 - 0.95 maps to 0.3 - 0.7
    signal = 0.3 + ((ratio - 0.85) / 0.10) * 0.4;
  }

  return Math.max(0, Math.min(1, signal));
}

module.exports = { bigramSignal };
