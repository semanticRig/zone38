'use strict';

// Stage 1: Decomposer
// Breaks compound strings (key=value pairs, URLs, JSON fragments)
// into individual values so downstream stages analyze each value independently.

var VALID_KEY = /^[a-zA-Z][a-zA-Z0-9_.\-]*$/;

/**
 * Tries to decompose a string using a key=value delimiter strategy.
 * Returns extracted values if 3+ valid pairs found, or null.
 */
function tryKeyValueStrategy(str, delimiter, separators) {
  var segments = str.split(delimiter);
  var values = [];
  var validPairs = 0;

  for (var i = 0; i < segments.length; i++) {
    var segment = segments[i].trim();
    if (segment === '') continue;

    var sepIndex = -1;
    for (var s = 0; s < separators.length; s++) {
      var idx = segment.indexOf(separators[s]);
      if (idx !== -1 && (sepIndex === -1 || idx < sepIndex)) {
        sepIndex = idx;
      }
    }

    if (sepIndex === -1) continue;

    var key = segment.substring(0, sepIndex);
    var value = segment.substring(sepIndex + 1);

    if (VALID_KEY.test(key)) {
      validPairs++;
      if (value !== '') {
        values.push(value);
      }
    }
  }

  if (validPairs >= 3) return values;
  return null;
}

/**
 * Strategy 4: URL query parameters.
 * Detects URLs or query strings and extracts param values.
 * Threshold: 2+ query params.
 */
function tryURLStrategy(str) {
  var queryStart = -1;

  if (/^https?:\/\//.test(str)) {
    queryStart = str.indexOf('?');
    if (queryStart === -1) return null;
    queryStart += 1;
  } else if (str.indexOf('?') !== -1) {
    // Check if it looks like ?key=value&key=value
    var qIdx = str.indexOf('?');
    var afterQ = str.substring(qIdx + 1);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(afterQ)) {
      queryStart = qIdx + 1;
    }
  }

  if (queryStart === -1) return null;

  var queryString = str.substring(queryStart);
  var pairs = queryString.split('&');
  var values = [];
  var validPairs = 0;

  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    var eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;

    var key = pair.substring(0, eqIdx);
    if (VALID_KEY.test(key)) {
      validPairs++;
      var value = pair.substring(eqIdx + 1);
      if (value !== '') {
        values.push(value);
      }
    }
  }

  if (validPairs >= 2) return values;
  return null;
}

/**
 * Strategy 5: Simple JSON fragment.
 * Extracts string values from JSON-like objects/arrays without JSON.parse.
 * Threshold: 2+ extracted string values.
 */
function tryJSONStrategy(str) {
  var trimmed = str.trim();
  var isObj = trimmed.charAt(0) === '{' && trimmed.charAt(trimmed.length - 1) === '}';
  var isArr = trimmed.charAt(0) === '[' && trimmed.charAt(trimmed.length - 1) === ']';
  if (!isObj && !isArr) return null;

  // Match :"value" or : "value" patterns (double-quoted string values)
  var regex = /:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  var values = [];
  var match;

  while ((match = regex.exec(trimmed)) !== null) {
    if (match[1] !== '') {
      values.push(match[1]);
    }
  }

  if (values.length >= 2) return values;
  return null;
}

/**
 * Decomposes a string into individual values using structural strategies.
 * Tries strategies in order, uses the FIRST that matches.
 * Returns { values: string[], decomposed: boolean }.
 */
function decompose(str) {
  if (!str || typeof str !== 'string') {
    return { values: [], decomposed: false };
  }

  // Strategy 1: Semicolon-delimited key=value
  var result = tryKeyValueStrategy(str, ';', ['=']);
  if (result) return { values: result, decomposed: true };

  // Strategy 2: Comma-delimited key=value or key:value
  result = tryKeyValueStrategy(str, ',', ['=', ':']);
  if (result) return { values: result, decomposed: true };

  // Strategy 3: Pipe-delimited key=value
  result = tryKeyValueStrategy(str, '|', ['=']);
  if (result) return { values: result, decomposed: true };

  // Strategy 4: URL query parameters
  result = tryURLStrategy(str);
  if (result) return { values: result, decomposed: true };

  // Strategy 5: Simple JSON fragment
  result = tryJSONStrategy(str);
  if (result) return { values: result, decomposed: true };

  // No strategy matched — pass through unchanged
  return { values: [str], decomposed: false };
}

module.exports = { decompose };
