'use strict';

// Bigram entropy ratio signal
// Computes ratio of bigram entropy to character entropy.
// Structured text has predictable bigram transitions; random noise does not.
// Output: { bigramEntropy, charEntropy, ratio, signal: 0-1 }
// Populated by Phase 6.

module.exports = {
  analyse: function analyse(_value) {
    return { bigramEntropy: 0, charEntropy: 0, ratio: 0, signal: 0 };
  },
};
