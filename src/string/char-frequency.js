'use strict';

// Character frequency profile + Shannon entropy
// Computes character bucket distribution and Euclidean distance from
// code/secret reference profiles.
// Output: { entropy, distanceFromCode, distanceFromSecret, signal: 0-1 }
// Populated by Phase 6.

module.exports = {
  analyse: function analyse(_value) {
    return { entropy: 0, distanceFromCode: 0, distanceFromSecret: 0, signal: 0 };
  },
};
