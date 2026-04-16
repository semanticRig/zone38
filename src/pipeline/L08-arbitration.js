'use strict';

// Layer 8 — Confidence Arbitration (orthogonal lock)
// Takes all signals from Layer 7 and applies the multi-signal agreement rule.
// A candidate is flagged only when a minimum number of orthogonal signals agree.
// Confidence tiers: HIGH (majority) | MEDIUM (partial) | UNCERTAIN (weak)
// UNCERTAIN findings go to the `review` bucket, never `findings`.
// Populated by Phase 7.

module.exports = {
  arbitrate: function arbitrate(_signalSets) {
    return { findings: [], review: [] };
  },
};
