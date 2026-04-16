'use strict';

// String decomposer — 5 strategies in priority order
// Breaks compound strings into isolated values before measuring anything.
// Output: { values: string[], decomposed: boolean }
// Populated by Phase 6.

module.exports = {
  decompose: function decompose(_value) {
    return { values: [_value], decomposed: false };
  },
};
