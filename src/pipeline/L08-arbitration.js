'use strict';

// Layer 8 — Confidence Arbitration (orthogonal lock)
//
// Takes the signal sets from Layer 7 and applies the multi-signal agreement rule.
// "Orthogonal" means the signals come from independent mathematical methods:
//   - String pipeline (char-frequency + bigram + compression + vector)
//   - Index of Coincidence (probability theory)
//   - Class Transition Friction (structural pattern)
//   - Entropy Gradient Spike (template-wrapper detection)
//   - Uniformity filter (frequency-distribution test)
//
// Confidence tiers (must match across ALL calls to this function):
//   HIGH:      effectivePipeline >= 0.65 AND at least 2 other signals fire  → findings
//   MEDIUM:    effectivePipeline >= 0.50 AND at least 2 other signals fire  → findings
//   UNCERTAIN: pipelineScore >= 0.40 OR any single signal fires alone       → review
//   SAFE:      none of the above                                             → discarded
//   effectivePipeline = pipelineScore × lengthMultiplier(valueLen), decaying
//   from 1.0 at len=12 to 0.0 at len=6. UNCERTAIN always uses raw pipelineScore.
//
// Finding shape:
//   { value, line, lineIndex, identifierName, callSiteContext, type,
//     confidence, pipelineScore, signalCount, signals }

var HIGH_PIPELINE   = 0.65;
var MEDIUM_PIPELINE = 0.50;
var UNCERTAIN_FLOOR = 0.40;

function _classifyShape(value) {
  if (!value) return 'mixed';
  if (/^eyJ/.test(value)) return 'jwt';
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(value)) return 'uuid';
  if (/^[0-9a-fA-F]+$/.test(value)) return 'hex-shaped';
  if (/^[A-Za-z0-9+/]+=*$/.test(value) && value.length > 8) return 'base64-shaped';
  return 'mixed';
}

function _countOtherSignals(signals) {
  var count = 0;
  if (signals.icSignal)   count++;
  if (signals.ctfSignal)  count++;
  if (signals.egsSpike)   count++;
  if (signals.uniformity) count++;
  return count;
}

// Length-asymptote multiplier — graduated decay from len=12 to len=6.
// At len >= 12: multiplier = 1.0 (no decay).
// At len =  9:  multiplier = 0.5.
// At len =  6:  multiplier = 0.0 — CONFIRMED tiers unreachable.
// Applied to pipeline score before HIGH/MEDIUM threshold checks only.
// UNCERTAIN always uses raw pipeline score so short candidates still surface for review.
function _lengthMultiplier(len) {
  if (len >= 12) return 1;
  if (len <= 6)  return 0;
  return (len - 6) / 6;
}

function arbitrate(signalSets) {
  if (!signalSets || signalSets.length === 0) return { findings: [], review: [] };

  var findings = [];
  var review   = [];

  for (var i = 0; i < signalSets.length; i++) {
    var item     = signalSets[i];
    var cand     = item.candidate;
    var signals  = item.signals;
    var pipeline = signals.maxPipelineScore;
    var others   = _countOtherSignals(signals);

    // Determine which sub-value had the highest score (for reporting)
    var topSubResult = null;
    if (item.subResults && item.subResults.length > 0) {
      topSubResult = item.subResults[0];
      for (var s = 1; s < item.subResults.length; s++) {
        if (item.subResults[s].resolvedScore > topSubResult.resolvedScore) {
          topSubResult = item.subResults[s];
        }
      }
    }

    // Extract sub-pipeline signal strengths from the top sub-result
    var charFreqSignal = null;
    var bigramSignal   = null;
    var compressionSignal = null;
    if (topSubResult && topSubResult.aggregator && topSubResult.aggregator.signals) {
      var aggSigs = topSubResult.aggregator.signals;
      charFreqSignal    = aggSigs.charFrequency != null ? aggSigs.charFrequency : null;
      bigramSignal      = aggSigs.bigram != null ? aggSigs.bigram : null;
      compressionSignal = aggSigs.compression != null ? aggSigs.compression : null;
    }

    var finding = {
      value:           cand.value,
      line:            cand.line,
      lineIndex:       cand.lineIndex,
      identifierName:  cand.identifierName,
      callSiteContext: cand.callSiteContext,
      type:            cand.type,
      pipelineScore:   Math.round(pipeline * 1000) / 1000,
      signalCount:     others,
      signals:         signals,
      topValue:        topSubResult ? topSubResult.value : cand.value,
      shape:           _classifyShape(cand.value),
      valueLength:     cand.value ? cand.value.length : 0,
      charFreqSignal:  charFreqSignal,
      bigramSignal:    bigramSignal,
      compressionSignal: compressionSignal,
    };

    // Length-asymptote gate: decay effective pipeline score for short strings.
    // UNCERTAIN uses raw pipeline so short candidates are never silently dropped.
    var valueLength = cand.value ? cand.value.length : 0;
    var effectivePipeline = pipeline * _lengthMultiplier(valueLength);

    if (effectivePipeline >= HIGH_PIPELINE && others >= 2) {
      finding.confidence = 'HIGH';
      findings.push(finding);
    } else if (effectivePipeline >= MEDIUM_PIPELINE && others >= 2) {
      finding.confidence = 'MEDIUM';
      findings.push(finding);
    } else if (pipeline >= UNCERTAIN_FLOOR || others >= 1) {
      finding.confidence = 'UNCERTAIN';
      review.push(finding);
    }
    // else: SAFE — discard silently
  }

  return { findings: findings, review: review };
}

module.exports = {
  arbitrate: arbitrate,
  // Exported for tests
  HIGH_PIPELINE:     HIGH_PIPELINE,
  MEDIUM_PIPELINE:   MEDIUM_PIPELINE,
  UNCERTAIN_FLOOR:   UNCERTAIN_FLOOR,
  _lengthMultiplier: _lengthMultiplier,
};
