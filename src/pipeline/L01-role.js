'use strict';

// Layer 1 — File Role Classification
// Classifies every file record by role: backend/frontend/isomorphic,
// config/logic/declaration, test/application, .d.ts flag.
// Output: adds a `role` object to each file metadata record.
// Populated by Phase 2.

module.exports = {
  classifyRole: function classifyRole(_fileRecord) { return {}; },
};
