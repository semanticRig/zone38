'use strict';

// Layer 4 — Entity Harvesting
// Extracts all candidate payloads: string literals, URLs, key-value pairs.
// Applies the Gravity Welder to fuse adjacent string concatenations.
// Output: `candidates` array with position metadata per item.
// Populated by Phase 5.

module.exports = {
  harvestEntities: function harvestEntities(_content, _fileRecord) { return []; },
};
