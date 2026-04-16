'use strict';

// String decomposer — 5 strategies in priority order.
// Breaks compound strings (semicolon-kv, comma-kv, pipe-kv, URL query, JSON fragment)
// into isolated values so downstream stages analyse each value independently.
// Output: { values: string[], decomposed: boolean }

var VALID_KEY = /^[a-zA-Z][a-zA-Z0-9_.\-]*$/;

// Split str by delimiter and look for key+separator+value triples.
// Requires >= minPairs valid pairs before accepting the strategy.
function _tryKV(str, delimiter, separators, minPairs) {
  var segments = str.split(delimiter);
  var values = [];
  var validPairs = 0;

  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i].trim();
    if (!seg) continue;
    var sepIdx = -1;
    for (var s = 0; s < separators.length; s++) {
      var idx = seg.indexOf(separators[s]);
      if (idx !== -1 && (sepIdx === -1 || idx < sepIdx)) sepIdx = idx;
    }
    if (sepIdx === -1) continue;
    var key = seg.substring(0, sepIdx);
    var val = seg.substring(sepIdx + 1);
    if (VALID_KEY.test(key)) {
      validPairs++;
      if (val) values.push(val);
    }
  }
  return validPairs >= minPairs ? values : null;
}

// Strategy 4: URL query parameters
function _tryURL(str) {
  var qPos = -1;
  if (/^https?:\/\//.test(str)) {
    qPos = str.indexOf('?');
    if (qPos === -1) return null;
    qPos++;
  } else {
    var q = str.indexOf('?');
    if (q !== -1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(str.substring(q + 1))) {
      qPos = q + 1;
    }
  }
  if (qPos === -1) return null;

  var pairs = str.substring(qPos).split('&');
  var values = [];
  var validPairs = 0;
  for (var i = 0; i < pairs.length; i++) {
    var eq = pairs[i].indexOf('=');
    if (eq === -1) continue;
    if (VALID_KEY.test(pairs[i].substring(0, eq))) {
      validPairs++;
      var v = pairs[i].substring(eq + 1);
      if (v) values.push(v);
    }
  }
  return validPairs >= 2 ? values : null;
}

// Strategy 5: Simple JSON-fragment — extract string values from {"k":"v",...}
function _tryJSON(str) {
  var t = str.trim();
  var isObj = t[0] === '{' && t[t.length - 1] === '}';
  var isArr = t[0] === '[' && t[t.length - 1] === ']';
  if (!isObj && !isArr) return null;

  var re = /:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  var values = [];
  var m;
  while ((m = re.exec(t)) !== null) {
    if (m[1]) values.push(m[1]);
  }
  return values.length >= 2 ? values : null;
}

function decompose(value) {
  if (!value || typeof value !== 'string') return { values: [], decomposed: false };

  var result;

  // Strategy 1: semicolon-delimited key=value
  result = _tryKV(value, ';', ['='], 3);
  if (result) return { values: result, decomposed: true };

  // Strategy 2: comma-delimited key=value or key:value
  result = _tryKV(value, ',', ['=', ':'], 3);
  if (result) return { values: result, decomposed: true };

  // Strategy 3: pipe-delimited key=value
  result = _tryKV(value, '|', ['='], 3);
  if (result) return { values: result, decomposed: true };

  // Strategy 4: URL query params
  result = _tryURL(value);
  if (result) return { values: result, decomposed: true };

  // Strategy 5: JSON fragment
  result = _tryJSON(value);
  if (result) return { values: result, decomposed: true };

  return { values: [value], decomposed: false };
}

module.exports = { decompose: decompose };
