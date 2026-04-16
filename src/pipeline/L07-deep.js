'use strict';

// Layer 7 — Deep Candidate Analysis
//
// Runs only on candidates escalated from Layer 6.
// Calls the full src/string/ pipeline per value, then adds 4 orthogonal signals:
//
//   1. Index of Coincidence (IC): probability that two randomly chosen chars are
//      equal. English text ≈ 0.065, random tokens ≈ 0.038 (26-char alphabet).
//      IC < 0.045 → high-randomness signal.
//
//   2. Class Transition Friction (CTF): fraction of char-type transitions that
//      cross the letter/digit/symbol boundary. Pure lowercase = 0. Mixed secret = high.
//      CTF > 0.4 → escalate.
//
//   3. Entropy Gradient Sweep (EGS): splits value into 3 segments, computes entropy
//      of each. A flat profile = natural text. A spike in the last segment = secret
//      embedded at the end of a template wrapper.
//
//   4. Uniformity Filter: if character frequency distribution has standard deviation
//      < 0.03 (nearly perfectly uniform) AND value length > 16 → strong random signal.
//
// Output: array of { candidate, signals: { stringPipeline, ic, ctf, egs, uniformity } }

var decomposer  = require('../string/decomposer.js');
var aggregator  = require('../string/aggregator.js');
var vector      = require('../string/vector.js');
var charFreq    = require('../string/char-frequency.js');

function _indexOfCoincidence(value) {
  if (!value || value.length < 2) return 1;
  var freq = {};
  for (var i = 0; i < value.length; i++) {
    freq[value[i]] = (freq[value[i]] || 0) + 1;
  }
  var n = value.length;
  var sum = 0;
  var keys = Object.keys(freq);
  for (var j = 0; j < keys.length; j++) {
    var f = freq[keys[j]];
    sum += f * (f - 1);
  }
  return n <= 1 ? 1 : sum / (n * (n - 1));
}

function _classTransitionFriction(value) {
  if (!value || value.length < 2) return 0;
  function cls(c) {
    if (c >= 'a' && c <= 'z') return 0;
    if (c >= 'A' && c <= 'Z') return 1;
    if (c >= '0' && c <= '9') return 2;
    return 3;
  }
  var crossBoundary = 0;
  var prev = cls(value[0]);
  for (var i = 1; i < value.length; i++) {
    var cur = cls(value[i]);
    // crossing the letter/digit/symbol boundary (not upper→lower)
    if ((prev <= 1 && cur === 2) || (prev === 2 && cur <= 1) ||
        (prev <= 2 && cur === 3) || (prev === 3 && cur <= 2)) {
      crossBoundary++;
    }
    prev = cur;
  }
  return crossBoundary / (value.length - 1);
}

function _entropyGradient(value) {
  if (!value || value.length < 9) return [0, 0, 0];
  var segLen = Math.floor(value.length / 3);
  var s1 = value.slice(0, segLen);
  var s2 = value.slice(segLen, segLen * 2);
  var s3 = value.slice(segLen * 2);
  return [
    charFreq._entropy(s1),
    charFreq._entropy(s2),
    charFreq._entropy(s3),
  ];
}

function _uniformitySignal(value) {
  if (!value || value.length <= 16) return false;
  var freq = {};
  for (var i = 0; i < value.length; i++) {
    freq[value[i]] = (freq[value[i]] || 0) + 1;
  }
  var keys = Object.keys(freq);
  var expectedFreq = value.length / keys.length;
  var sumSq = 0;
  for (var j = 0; j < keys.length; j++) {
    var deviation = (freq[keys[j]] - expectedFreq) / value.length;
    sumSq += deviation * deviation;
  }
  var stdDev = Math.sqrt(sumSq / keys.length);
  return stdDev < 0.03;
}

function _analyseValue(value) {
  // Decompose first — compound strings route each sub-value independently
  var decomposed = decomposer.decompose(value);
  var values = decomposed.values;

  // Score each sub-value through the pipeline
  var subResults = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var aggResult = aggregator.aggregate(v);
    var vecResult = null;
    if (aggResult.ambiguous) {
      vecResult = vector.score(v);
    }

    subResults.push({
      value:          v,
      aggregator:     aggResult,
      vector:         vecResult,
      // Resolved score: use vector if available, else aggregator.score / 100
      resolvedScore:  vecResult ? vecResult.score : aggResult.score / 100,
    });
  }

  // IC and CTF on the original (undecomposed) value
  var ic  = _indexOfCoincidence(value);
  var ctf = _classTransitionFriction(value);
  var egs = _entropyGradient(value);
  var uni = _uniformitySignal(value);

  // Max resolved score across all sub-values
  var maxScore = 0;
  for (var s = 0; s < subResults.length; s++) {
    if (subResults[s].resolvedScore > maxScore) maxScore = subResults[s].resolvedScore;
  }

  return {
    subResults: subResults,
    signals: {
      maxPipelineScore: maxScore,
      ic:               ic,
      icSignal:         ic < 0.045 ? 1 : 0,  // 1 = high-randomness
      ctf:              ctf,
      ctfSignal:        ctf > 0.4  ? 1 : 0,  // 1 = suspicious transitions
      egs:              egs,
      egsSpike:         egs[2] > egs[0] + 0.5, // entropy rises at end = template wrapper
      uniformity:       uni,
    },
  };
}

function deepAnalysis(escalatedCandidates) {
  if (!escalatedCandidates || escalatedCandidates.length === 0) return [];

  var results = [];
  for (var i = 0; i < escalatedCandidates.length; i++) {
    var cand = escalatedCandidates[i];
    var analysis = _analyseValue(cand.value);
    results.push({
      candidate: cand,
      signals:   analysis.signals,
      subResults: analysis.subResults,
    });
  }
  return results;
}

module.exports = {
  deepAnalysis: deepAnalysis,
  // Exported for tests
  _indexOfCoincidence:      _indexOfCoincidence,
  _classTransitionFriction: _classTransitionFriction,
  _entropyGradient:         _entropyGradient,
  _uniformitySignal:        _uniformitySignal,
};
