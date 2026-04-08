'use strict';

// Stage 5: Aggregator + Ambiguity Router
// Combines 2-3 signals from Stages 2-4, determines agreement or disagreement,
// and routes ambiguous strings to the vector engine.

/**
 * Aggregates signals from char frequency, bigram, and compression stages.
 * compressionSignal may be null (strings <= 20 chars).
 * Returns { score: number (0-100), decided: boolean, ambiguous: boolean }.
 */
function aggregate(charSignal, bigramSig, compressionSig) {
  // Collect available signals
  var signals = [charSignal, bigramSig];
  if (compressionSig != null) {
    signals.push(compressionSig);
  }

  // Average of available signals
  var sum = 0;
  for (var i = 0; i < signals.length; i++) {
    sum += signals[i];
  }
  var avgSignal = sum / signals.length;

  // AGREEMENT: all signals agree the string is safe
  var allBelow = true;
  var allAbove = true;
  for (var a = 0; a < signals.length; a++) {
    if (signals[a] >= 0.25) allBelow = false;
    if (signals[a] <= 0.75) allAbove = false;
  }

  if (allBelow) {
    return { score: avgSignal * 20, decided: true, ambiguous: false };
  }

  // AGREEMENT: all signals agree the string is a secret
  if (allAbove) {
    return { score: 80 + (avgSignal - 0.75) * 80, decided: true, ambiguous: false };
  }

  // DISAGREEMENT: signals conflict significantly
  var minSig = signals[0];
  var maxSig = signals[0];
  for (var d = 1; d < signals.length; d++) {
    if (signals[d] < minSig) minSig = signals[d];
    if (signals[d] > maxSig) maxSig = signals[d];
  }

  if (maxSig - minSig > 0.35) {
    return { score: avgSignal * 100, decided: false, ambiguous: true };
  }

  // TWILIGHT ZONE: no signal confident, all hovering in the middle
  var anyTwilight = false;
  var anyExtreme = false;
  for (var t = 0; t < signals.length; t++) {
    if (signals[t] > 0.4 && signals[t] < 0.6) anyTwilight = true;
    if (signals[t] < 0.2 || signals[t] > 0.8) anyExtreme = true;
  }

  if (anyTwilight && !anyExtreme) {
    return { score: avgSignal * 100, decided: false, ambiguous: true };
  }

  // DEFAULT: mild agreement but not strong
  var score = avgSignal * 100;
  if (score < 40) {
    return { score: score, decided: true, ambiguous: false };
  }
  if (score > 60) {
    return { score: score, decided: true, ambiguous: false };
  }
  return { score: score, decided: false, ambiguous: true };
}

module.exports = { aggregate };
