'use strict';

// Layer 4 — Entity Harvesting
// Extracts all candidate payloads: string literals, URLs, key-value pairs.
// Applies the Gravity Welder to fuse adjacent string concatenations.
// Output: candidates array, each { value, line, col, lineIndex, identifierName, callSiteContext, type, priority }

// Matches single-quoted, double-quoted, and template-literal strings.
// Does NOT match empty strings or single-character strings (discarded early).
// Capture group 1: single-quoted, group 2: double-quoted, group 3: template-literal
var STRING_RE = /'((?:[^'\\]|\\.)*)' *|"((?:[^"\\]|\\.)*)" *|`((?:[^`\\]|\\.)*)`/g;

// Matches URL-shaped entities (scheme://authority...)
var URL_RE = /https?:\/\/[^\s'"`,;)\]}>]+/g;

// Matches key = "value" or { key: "value" } patterns — structural, not name-based
var KV_ASSIGN_RE = /\b(\w+)\s*=\s*['"`]([^'"`]{4,})['"`]/g;
var KV_OBJ_RE = /\b(\w+)\s*:\s*['"`]([^'"`]{4,})['"`]/g;

// Minimum string length to bother analysing
var MIN_STRING_LEN = 4;
// Maximum length before we treat as a blob and lower priority
var BLOB_THRESHOLD = 2000;

// Identifier names on the left of an assignment — used for call-site context
var LHS_RE = /\b(\w+)\s*(?:=|:)\s*['"`]/;

function _extractStringsFromLine(line, lineIndex) {
  var results = [];
  var match;
  STRING_RE.lastIndex = 0;

  while ((match = STRING_RE.exec(line)) !== null) {
    var value = match[1] !== undefined ? match[1]
               : match[2] !== undefined ? match[2]
               : match[3];

    // Unescape common escape sequences for analysis
    value = value.replace(/\\n/g, '\n')
                 .replace(/\\t/g, '\t')
                 .replace(/\\r/g, '\r')
                 .replace(/\\\\/g, '\\')
                 .replace(/\\'/g, '\'')
                 .replace(/\\"/g, '"');

    if (value.length < MIN_STRING_LEN) continue;

    // Find the identifier name to the left of this match for context
    var lhsMatch = LHS_RE.exec(line.slice(0, match.index + 1));
    var identifierName = lhsMatch ? lhsMatch[1] : null;

    results.push({
      value: value,
      line: line,
      col: match.index,
      lineIndex: lineIndex,
      identifierName: identifierName,
      callSiteContext: null,
      type: 'string',
      priority: 'normal',
    });
  }
  return results;
}

function _extractUrlsFromLine(line, lineIndex) {
  var results = [];
  // Skip pure comment lines — URLs in comments are rarely secrets
  var trimmed = line.trim();
  if (trimmed.indexOf('//') === 0 || trimmed.indexOf('*') === 0) return results;

  var match;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(line)) !== null) {
    var value = match[0];
    // Strip trailing punctuation that was part of surrounding code
    value = value.replace(/['"`,;)\]}>]+$/, '');
    if (value.length < 10) continue;

    results.push({
      value: value,
      line: line,
      col: match.index,
      lineIndex: lineIndex,
      identifierName: null,
      callSiteContext: null,
      type: 'url',
      priority: 'normal',
    });
  }
  return results;
}

function _extractKVFromLine(line, lineIndex) {
  var results = [];
  var match;

  KV_ASSIGN_RE.lastIndex = 0;
  while ((match = KV_ASSIGN_RE.exec(line)) !== null) {
    if (match[2].length < MIN_STRING_LEN) continue;
    results.push({
      value: match[2],
      line: line,
      col: match.index,
      lineIndex: lineIndex,
      identifierName: match[1],
      callSiteContext: 'assignment',
      type: 'kv',
      priority: 'normal',
    });
  }

  KV_OBJ_RE.lastIndex = 0;
  while ((match = KV_OBJ_RE.exec(line)) !== null) {
    if (match[2].length < MIN_STRING_LEN) continue;
    results.push({
      value: match[2],
      line: line,
      col: match.index,
      lineIndex: lineIndex,
      identifierName: match[1],
      callSiteContext: 'object',
      type: 'kv',
      priority: 'normal',
    });
  }

  return results;
}

// Gravity Welder: fuse adjacent string concatenations on the same line or
// across consecutive lines connected by + or ,.
// Input: raw candidates array (ordered by lineIndex, then col).
// Output: same array with adjacent string-type candidates on consecutive lines
//         merged into a single candidate when they are connected by + or ,
function _gravityWeld(candidates) {
  if (candidates.length < 2) return candidates;

  var welded = [];
  var i = 0;

  while (i < candidates.length) {
    var cur = candidates[i];

    // Only weld string-type adjacent candidates
    if (cur.type !== 'string') {
      welded.push(cur);
      i++;
      continue;
    }

    var fused = cur.value;
    var j = i + 1;

    while (j < candidates.length) {
      var next = candidates[j];
      if (next.type !== 'string') break;
      // Adjacent = same line or consecutive line
      var lineDelta = next.lineIndex - candidates[j - 1].lineIndex;
      if (lineDelta > 1) break;
      // Only fuse if the gap between them contains + or ,
      var gapLine = next.line;
      var gapBefore = gapLine.slice(0, next.col);
      if (!/[+,]\s*$/.test(gapBefore) && !/[+,]\s*['"`]/.test(cur.line.slice(cur.col))) break;

      fused += next.value;
      j++;
    }

    if (j > i + 1) {
      // At least one weld happened — emit a merged candidate
      welded.push({
        value: fused,
        line: cur.line,
        col: cur.col,
        lineIndex: cur.lineIndex,
        identifierName: cur.identifierName,
        callSiteContext: 'concatenated',
        type: 'string',
        priority: 'normal',
      });
      i = j;
    } else {
      welded.push(cur);
      i++;
    }
  }

  return welded;
}

function harvestEntities(content, fileRecord) {
  var lines = content.split('\n');
  var candidates = [];

  for (var idx = 0; idx < lines.length; idx++) {
    var line = lines[idx];

    var strings = _extractStringsFromLine(line, idx);
    var urls = _extractUrlsFromLine(line, idx);
    var kvs = _extractKVFromLine(line, idx);

    for (var s = 0; s < strings.length; s++) candidates.push(strings[s]);
    for (var u = 0; u < urls.length; u++) candidates.push(urls[u]);
    for (var k = 0; k < kvs.length; k++) candidates.push(kvs[k]);
  }

  // Apply the Gravity Welder to string candidates
  candidates = _gravityWeld(candidates);

  if (fileRecord) {
    fileRecord.candidates = candidates;
  }
  return candidates;
}

module.exports = {
  harvestEntities: harvestEntities,
  // Exported for tests
  _extractStringsFromLine: _extractStringsFromLine,
  _extractUrlsFromLine: _extractUrlsFromLine,
  _gravityWeld: _gravityWeld,
};
