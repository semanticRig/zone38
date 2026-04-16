'use strict';

// Per-string compression signal
// Measures how well a string resists gzip compression.
// Returns null for strings ≤ 20 chars (too short for reliable signal).
// Output: { ratio, signal: 0-1 } or null
// Populated by Phase 6.

module.exports = {
  analyse: function analyse(_value) {
    return null;
  },
};
