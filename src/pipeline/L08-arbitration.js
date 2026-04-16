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
//   HIGH:      pipelineScore >= 0.65 AND at least 2 other signals fire   → findings
//   MEDIUM:    pipelineScore >= 0.50 AND at least 1 other signal fires   → findings
//   UNCERTAIN: pipelineScore >= 0.40 OR any single signal fires alone    → review
//   SAFE:      none of the above                                          → discarded
//
// Finding shape:
//   { value, line, lineIndex, identifierName, callSiteContext, type,
//     confidence, pipelineScore, signalCount, signals }

var HIGH_PIPELINE   = 0.65;
var MEDIUM_PIPELINE = 0.50;
var UNCERTAIN_FLOOR = 0.40;

function _countOtherSignals(signals) {
  var count = 0;
  if (signals.icSignal)   count++;
  if (signals.ctfSignal)  count++;
  if (signals.egsSpike)   count++;
  if (signals.uniformity) count++;
  return count;
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
    };

    if (pipeline >= HIGH_PIPELINE && others >= 2) {
      finding.confidence = 'HIGH';
      findings.push(finding);
    } else if (pipeline >= MEDIUM_PIPELINE && others >= 1) {
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
  HIGH_PIPELINE:   HIGH_PIPELINE,
  MEDIUM_PIPELINE: MEDIUM_PIPELINE,
  UNCERTAIN_FLOOR: UNCERTAIN_FLOOR,
};
