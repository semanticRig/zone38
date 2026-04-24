'use strict';

// Layer 5 — Candidate Pre-Flight Gate
// Applies fast discard/downgrade logic before expensive deep analysis.
// Rules (in order):
//   1. Logic-graph discard: line routing density > 0.35 → discard (code structure, not data)
//   2. Style-literal discard: CSS/SVG key=value semicolon strings → discard
//   3. Entanglement filter: high symbol density in window before string → downgrade to low
//   4. Blob classification: value.length > BLOB_THRESHOLD → classify as blob, lower priority
//   5. Length bounds: value.length < MIN_LEN AND no class-transition friction → downgrade
//   6. Rolling hash deduplication: exact duplicates discarded after first occurrence
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

// Dotted-path literals: i18n/l10n translation keys like "auth.login.invalid_password"
// or "user.profile.avatar_url". The reliable discriminant is at least one underscore —
// i18n frameworks consistently use snake_case leaf nodes. This prevents matching
// hostnames (db.prod.internal) or package names (com.example.app) which have no
// underscores and may legitimately be security findings.
var DOTTED_PATH_RE = /^(?=.*_)[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;

function _isDottedPathLiteral(value) {
  return DOTTED_PATH_RE.test(value);
}

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

// Symbol density in a left-biased window around the string's position in the source line.
// c.col is the start index of the opening quote; entanglement context (operators, function
// calls, regex syntax) almost always precedes the string, so the window is 40 chars before
// and 10 chars after c.col, clamped to line bounds.
// High density means the string is syntactically entangled, not an isolated assignment.
var ENTANGLEMENT_DENSITY_THRESHOLD = 0.35;
var ENTANGLEMENT_SYMBOL_CHARS = '/\\^$.*+?()[\\]{}|<>=!,;:@#%&~';

function _symbolDensityInWindow(line, col) {
  if (!line || typeof col !== 'number') return 0;
  var start = Math.max(0, col - 40);
  var end   = Math.min(line.length, col + 10);
  if (end <= start) return 0;
  var win   = line.slice(start, end);
  var count = 0;
  for (var i = 0; i < win.length; i++) {
    if (ENTANGLEMENT_SYMBOL_CHARS.indexOf(win[i]) !== -1) count++;
  }
  return count / win.length;
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

    // 2b. Dotted-path discard: i18n/l10n keys like "auth.login.invalid_password"
    //     are namespaced identifiers, never secrets — discard before L07 math.
    if ((c.type === 'string' || c.type === 'kv') && _isDottedPathLiteral(value)) continue;

    // 3. Entanglement filter: high symbol density in the left-biased window before
    //    this string means it is syntactically entangled — a regex operand, format
    //    argument, or template fragment — not an isolated credential assignment.
    //    Downgrade to 'low' rather than discard so pattern analysis still runs.
    if (c.type !== 'url' && _symbolDensityInWindow(c.line, c.col) > ENTANGLEMENT_DENSITY_THRESHOLD) {
      c.priority = 'low';
    }

    // 4. Blob classification: extremely long values are unlikely to be secrets;
    //    lower their priority but keep them for URL/pattern analysis
    if (value.length > BLOB_THRESHOLD) {
      c.priority = 'blob';
    }

    // 5. Length + friction gate: very short values with no class transitions
    //    are almost certainly identifiers or config labels — skip
    if (value.length < MIN_LEN) continue;
    if (value.length < 8 && _classTransitionCount(value) === 0) {
      c.priority = 'low';
    }

    // 6. Rolling hash deduplication: keep only the first occurrence of each value
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
  _lineRoutingDensity:    _lineRoutingDensity,
  _classTransitionCount:  _classTransitionCount,
  _isStyleLiteral:        _isStyleLiteral,
  _isDottedPathLiteral:   _isDottedPathLiteral,
  _hash:                  _hash,
  _symbolDensityInWindow: _symbolDensityInWindow,
};
