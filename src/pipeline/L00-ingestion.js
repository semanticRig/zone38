'use strict';

// Layer 0 — Project Ingestion
// Walks the full file tree and builds a registry of file metadata records.
// Output: array of { path, relativePath, ext, size, depth, territory }
// Populated by Phase 2.

module.exports = {
  walkProject: function walkProject(_rootDir) { return []; },
  buildRegistry: function buildRegistry(_rootDir) { return []; },
};
