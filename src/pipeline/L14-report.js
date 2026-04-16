'use strict';

// Layer 14 — Report Assembly
// Assembles the structured report object consumed by Layer 15 for rendering.
// Sections: exposure, secrets, slop breakdown, pattern hits, clean files,
//           project summary, review bucket (UNCERTAIN findings only).
// Populated by Phase 12.

module.exports = {
  assembleReport: function assembleReport(_scoringResult, _registry) {
    return {
      exposure: [],
      secrets: [],
      slopBreakdown: [],
      patternHits: [],
      cleanFiles: [],
      projectSummary: {},
      review: [],
    };
  },
};
