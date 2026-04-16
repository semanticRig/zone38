'use strict';

// Layer 2 — Surface Characterisation
// Computes fast global signals for every file before string-level work begins.
// Output: adds a `surface` object to each file record:
//   { minified, routingDensity, avgLineLength, lineDistribution, whitespaceRatio, repetitionFraction }
// Populated by Phase 3.

module.exports = {
  characteriseFile: function characteriseFile(_content) {
    return {
      minified: false,
      routingDensity: 0,
      avgLineLength: 0,
      lineDistribution: [],
      whitespaceRatio: 0,
      repetitionFraction: 0,
    };
  },
};
