'use strict';

// Fast-pipeline aggregator + ambiguity router
// Runs the 3-signal pipeline (char-frequency, bigram, compression).
// If all 3 signals agree → decided. If ≥ 1 signal lands in the twilight zone
// (0.4-0.6) or signals disagree → ambiguous: true, route to vector engine.
// Output: { score: 0-100, decided: boolean, ambiguous: boolean, signals: {} }
// Populated by Phase 6.

module.exports = {
  aggregate: function aggregate(_value) {
    return { score: 0, decided: false, ambiguous: true, signals: {} };
  },
};
