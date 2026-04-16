'use strict';

// Layer 12 — Project-Level Statistical Calibration
// Recalibrates confidence tiers and compression scoring based on the project's
// own signal distributions (Median Absolute Deviation, Bayesian weighting).
// Small projects trust global baselines; large projects self-calibrate.
// Output: { entropyMAD, compressionBaseline, confidenceMultipliers }
//         Also mutates confidence tiers on all findings in the registry.
// Populated by Phase 11.

module.exports = {
  calibrate: function calibrate(_registry) {
    return { entropyMAD: 0, compressionBaseline: 0, confidenceMultipliers: {} };
  },
};
