'use strict';

// Layer 13 — Scoring Aggregation
// Produces three independent axes (never blended into a single number):
//   Axis A — AI Slop Risk (0-100)
//   Axis B — Security Exposure Risk (0-100)
//   Axis C — Code Quality Risk (0-100)
// Per-file score with breakdown + project-level aggregate weighted by role and size.
// Populated by Phase 12.

module.exports = {
  computeAxes: function computeAxes(_registry) {
    return {
      axes: { A: 0, B: 0, C: 0 },
      perFile: [],
      project: {},
    };
  },
};
