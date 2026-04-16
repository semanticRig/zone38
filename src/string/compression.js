'use strict';

// Per-string compression signal.
// Measures how well a string resists gzip compression.
// Low ratio (compresses easily) → structured/code-like → low signal.
// High ratio (resists compression) → random/secret-like → high signal.
// Returns null for strings ≤ 50 chars (gzip header overhead dominates, signal unreliable).
// Output: { ratio, signal: 0-1 } or null

var zlib = require('zlib');

function analyse(value) {
  if (!value || value.length <= 50) return null;

  var raw = Buffer.from(value, 'utf8');
  var compressed = zlib.gzipSync(raw, { level: 9 });
  var ratio = compressed.length / raw.length;
  if (ratio > 1.5) ratio = 1.5;

  var signal;
  if (ratio <= 0.3) {
    signal = 0.1;
  } else if (ratio <= 0.5) {
    signal = 0.1 + ((ratio - 0.3) / 0.2) * 0.2;
  } else if (ratio <= 0.8) {
    signal = 0.3 + ((ratio - 0.5) / 0.3) * 0.4;
  } else if (ratio <= 1.0) {
    signal = 0.7 + ((ratio - 0.8) / 0.2) * 0.2;
  } else {
    signal = 0.9 + ((ratio - 1.0) / 0.5) * 0.1;
  }

  // Strings 51-80 chars: gzip header inflates the ratio.
  // Compression can confirm "structured" but not reliably claim "random".
  if (value.length <= 80 && signal > 0.5) signal = 0.5;

  return {
    ratio:  Math.round(ratio * 1000) / 1000,
    signal: Math.max(0, Math.min(1, signal)),
  };
}

module.exports = { analyse: analyse };
