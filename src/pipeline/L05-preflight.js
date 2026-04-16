'use strict';

// Layer 5 — Candidate Pre-Flight Gate
// Applies fast discard/downgrade logic before expensive deep analysis.
// Rules (in order):
//   1. Logic-graph discard: line routing density > 0.35 → discard (code structure, not data)
//   2. Blob classification: value.length > BLOB_THRESHOLD → classify as blob, lower priority
//   3. Length bounds: value.length < MIN_LEN AND no class-transition friction → downgrade
//   4. Rolling hash deduplication: exact duplicates discarded after first occurrence
// Output: clean, deduplicated, high-value candidate list (mutates fileRecord.candidates)

var MIN_LEN = 4;
var BLOB_THRESHOLD = 2000;
var ROUTING_DENSITY_THRESHOLD = 0.35;

// Structural routing chars — same set as L02 surface characterisation
var ROUTING_CHARS = '{};()[]<>';

// Semicolon-delimited key=value style strings (CSS-like, config-like).
// Matches patterns like "fillColor=#03B5BB;gradientColor=none;" or "dashed=0;html=1;".
// If ≥50% of semicolon-separated segments are key=value pairs, it's a style literal.
var KV_SEGMENT_RE = /^[\w.-]+=.+$/;

function _isStyleLiteral(value) {
  // Must contain at least one semicolon — the delimiter
  if (value.indexOf(';') === -1) return false;
  var segments = value.split(';');
  // Filter out empty trailing segments from trailing semicolons
  var nonEmpty = [];
  for (var i = 0; i < segments.length; i++) {
    var trimmed = segments[i].trim();
    if (trimmed.length > 0) nonEmpty.push(trimmed);
  }
  if (nonEmpty.length < 2) return false;
  var kvCount = 0;
  for (var j = 0; j < nonEmpty.length; j++) {
    if (KV_SEGMENT_RE.test(nonEmpty[j])) kvCount++;
  }
  return kvCount / nonEmpty.length >= 0.5;
}

function _lineRoutingDensity(line) {
  if (!line || line.length === 0) return 0;
  var count = 0;
  for (var i = 0; i < line.length; i++) {
    if (ROUTING_CHARS.indexOf(line[i]) !== -1) count++;
  }
  return count / line.length;
}

// Simple class-transition friction: how many adjacent character-type boundaries exist?
// Transitions: lower→upper, letter→digit, letter/digit→symbol, etc.
// A value with many transitions is more likely to be a secret than plain text.
function _classTransitionCount(value) {
  if (value.length < 2) return 0;
  var transitions = 0;
  function charClass(c) {
    if (c >= 'a' && c <= 'z') return 0;
    if (c >= 'A' && c <= 'Z') return 1;
    if (c >= '0' && c <= '9') return 2;
    return 3; // symbol
  }
  for (var i = 1; i < value.length; i++) {
    if (charClass(value[i]) !== charClass(value[i - 1])) transitions++;
  }
  return transitions;
}

// djb2 hash for rolling deduplication — fast, collision-resistant enough for this use
function _hash(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h & h; // keep 32-bit
  }
  return h;
}

function preflight(candidates, _fileRecord) {
  var seen = {};
  var result = [];

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var value = c.value;

    // 1. Logic-graph discard: if the line this candidate came from is mostly
    //    structural symbols, it's code structure — not a data payload
    if (_lineRoutingDensity(c.line) > ROUTING_DENSITY_THRESHOLD) continue;

    // 2. Style-literal discard: semicolon-delimited key=value pairs are
    //    CSS/SVG/config style strings, not secrets (eliminates draw.io-style FPs)
    if ((c.type === 'string' || c.type === 'kv') && _isStyleLiteral(value)) continue;

    // 3. Blob classification: extremely long values are unlikely to be secrets;
    //    lower their priority but keep them for URL/pattern analysis
    if (value.length > BLOB_THRESHOLD) {
      c.priority = 'blob';
    }

    // 4. Length + friction gate: very short values with no class transitions
    //    are almost certainly identifiers or config labels — skip
    if (value.length < MIN_LEN) continue;
    if (value.length < 8 && _classTransitionCount(value) === 0) {
      c.priority = 'low';
    }

    // 5. Rolling hash deduplication: keep only the first occurrence of each value
    var h = _hash(value);
    if (seen[h]) continue;
    seen[h] = true;

    result.push(c);
  }

  return result;
}

module.exports = {
  preflight: preflight,
  // Exported for tests
  _lineRoutingDensity: _lineRoutingDensity,
  _classTransitionCount: _classTransitionCount,
  _isStyleLiteral: _isStyleLiteral,
  _hash: _hash,
};
