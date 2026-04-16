'use strict';

// Layer 9 — URL Topology Analysis
//
// Specialised path for URL-shaped entities harvested by Layer 4.
// Runs in parallel with the string pipeline (Layers 6-8), not after it.
//
// Pipeline:
//   1. Parse every URL into { scheme, authority, host, port, path, query, fragment }
//      using plain string operations — no URL API (offline-first).
//   2. Classify the authority:
//      - RFC 1918 private IP → internal
//      - Loopback (127.x, ::1) → internal
//      - Internal naming conventions (.local, .svc, .internal, .cluster.local,
//        .lan, .corp, .home, .intranet) → internal
//      - Otherwise → external
//   3. Classify the path:
//      - Admin surfaces: /admin, /console, /management, /metrics, /health,
//        /debug, /actuator, /api/internal, /_internal
//      → marks path as sensitive
//   4. Feed each query parameter VALUE through the herd + deep + arbitration pipeline
//      and collect any secret findings.
//   5. Assign a classification:
//      - internal + sensitive path → 'internal-exposed'
//      - internal (any path)       → 'internal-exposed'
//      - sensitive-parameter found → 'sensitive-parameter'
//      - suspicious scheme (http not https for a secret-hosting candidate) → 'suspicious-external'
//      - otherwise                 → 'safe-external'
//
// Output: array of URL finding objects, one per input URL candidate.

var L06 = require('./L06-herd.js');
var L07 = require('./L07-deep.js');
var L08 = require('./L08-arbitration.js');

// RFC 1918 private ranges stored as prefix strings for plain string comparison.
// Order: most specific first so 10.x isn't swallowed by a broader match.
var PRIVATE_IP_PREFIXES = [
  '10.',
  '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
  '127.',
  '0.0.0.0',
  '::1',
  'localhost',
];

var INTERNAL_TLDS = ['.local', '.svc', '.internal', '.cluster.local', '.lan', '.corp', '.home', '.intranet'];

var SENSITIVE_PATH_SEGMENTS = [
  '/admin', '/console', '/management', '/metrics', '/health',
  '/debug', '/actuator', '/api/internal', '/_internal', '/backstage',
  '/private', '/internal',
];

// ---------------------------------------------------------------------------
// URL parsing — pure string operations, no URL API
// ---------------------------------------------------------------------------

function _parseUrl(raw) {
  var rest = raw;
  var scheme = '';
  var authority = '';
  var host = '';
  var port = '';
  var path = '';
  var query = '';
  var fragment = '';

  // Scheme
  var schemeEnd = rest.indexOf('://');
  if (schemeEnd !== -1) {
    scheme = rest.slice(0, schemeEnd).toLowerCase();
    rest = rest.slice(schemeEnd + 3);
  }

  // Fragment (strip first — it's at the end)
  var fragIdx = rest.indexOf('#');
  if (fragIdx !== -1) {
    fragment = rest.slice(fragIdx + 1);
    rest = rest.slice(0, fragIdx);
  }

  // Query
  var queryIdx = rest.indexOf('?');
  if (queryIdx !== -1) {
    query = rest.slice(queryIdx + 1);
    rest = rest.slice(0, queryIdx);
  }

  // Authority + path: everything up to the first '/' after stripping scheme
  var slashIdx = rest.indexOf('/');
  if (slashIdx !== -1) {
    authority = rest.slice(0, slashIdx);
    path = rest.slice(slashIdx);
  } else {
    authority = rest;
    path = '';
  }

  // Port from authority
  var portIdx = authority.lastIndexOf(':');
  if (portIdx !== -1 && portIdx > authority.lastIndexOf(']')) {
    // IPv6 addresses are wrapped in []; only split on a colon that is outside brackets
    port = authority.slice(portIdx + 1);
    host = authority.slice(0, portIdx);
  } else {
    host = authority;
    port = '';
  }

  // Strip trailing punctuation that might be from surrounding source code context
  // (e.g. a URL followed by ' or ; in a string literal)
  host = host.replace(/['"`;,)\]}>]+$/, '');

  return { scheme: scheme, authority: authority, host: host, port: port,
           path: path, query: query, fragment: fragment };
}

// ---------------------------------------------------------------------------
// Authority classification
// ---------------------------------------------------------------------------

function _isInternal(host) {
  var h = host.toLowerCase();

  // Private IPs and loopback
  for (var i = 0; i < PRIVATE_IP_PREFIXES.length; i++) {
    if (h === PRIVATE_IP_PREFIXES[i] || h.indexOf(PRIVATE_IP_PREFIXES[i]) === 0) {
      return true;
    }
  }

  // Internal TLDs
  for (var j = 0; j < INTERNAL_TLDS.length; j++) {
    if (h === INTERNAL_TLDS[j].slice(1) || _endsWith(h, INTERNAL_TLDS[j])) {
      return true;
    }
  }

  return false;
}

function _endsWith(str, suffix) {
  return str.length >= suffix.length && str.slice(str.length - suffix.length) === suffix;
}

// ---------------------------------------------------------------------------
// Path classification
// ---------------------------------------------------------------------------

function _isSensitivePath(path) {
  var p = path.toLowerCase();
  for (var i = 0; i < SENSITIVE_PATH_SEGMENTS.length; i++) {
    if (p === SENSITIVE_PATH_SEGMENTS[i] || p.indexOf(SENSITIVE_PATH_SEGMENTS[i] + '/') === 0 ||
        p.indexOf(SENSITIVE_PATH_SEGMENTS[i] + '?') === 0 ||
        p === SENSITIVE_PATH_SEGMENTS[i] + '/') {
      return true;
    }
    // Also catch mid-path occurrences: /api/v1/admin/users
    if (p.indexOf(SENSITIVE_PATH_SEGMENTS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Query parameter feeding into string pipeline
// ---------------------------------------------------------------------------

// Parse "key=value&key2=value2" into array of { key, value } objects.
function _parseQuery(queryString) {
  if (!queryString) return [];
  var pairs = [];
  var parts = queryString.split('&');
  for (var i = 0; i < parts.length; i++) {
    var eqIdx = parts[i].indexOf('=');
    if (eqIdx === -1) continue;
    var key = parts[i].slice(0, eqIdx);
    var value = parts[i].slice(eqIdx + 1);
    // Basic percent-decode for common encodings only
    value = value.replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%26/g, '&');
    if (value.length >= 4) {
      pairs.push({ key: key, value: value });
    }
  }
  return pairs;
}

// Wrap a raw query param value as a minimal candidate for the string pipeline.
function _paramToCandidate(key, value, urlLineIndex) {
  return {
    value: value,
    line: key + '=' + value,
    col: key.length + 1,
    lineIndex: urlLineIndex || 0,
    identifierName: key,
    callSiteContext: 'url-query-param',
    type: 'string',
    priority: 'normal',
  };
}

// Run query param values through L06→L07→L08 and return any findings.
function _analyseQueryParams(pairs, urlLineIndex) {
  if (pairs.length === 0) return { findings: [], review: [] };

  var candidates = pairs.map(function (p) {
    return _paramToCandidate(p.key, p.value, urlLineIndex);
  });

  var escalated = L06.discriminate(candidates);
  if (escalated.length === 0) return { findings: [], review: [] };

  var deepResults = L07.deepAnalysis(escalated);
  return L08.arbitrate(deepResults);
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

// analyseUrls(urlCandidates) → array of URL finding objects
//
// urlCandidates: array of objects from L04, each:
//   { value: 'https://...', line, lineIndex, identifierName, callSiteContext, type, priority }
//
// Returns: array of { url, parsed, classification, internal, sensitivePath,
//                     queryFindings, queryReview, line, lineIndex }
function analyseUrls(urlCandidates) {
  if (!Array.isArray(urlCandidates) || urlCandidates.length === 0) return [];

  var results = [];

  for (var i = 0; i < urlCandidates.length; i++) {
    var candidate = urlCandidates[i];
    var raw = candidate.value || '';
    var parsed = _parseUrl(raw);
    var internal = _isInternal(parsed.host);
    var sensitivePath = _isSensitivePath(parsed.path);

    // Feed query params through the string pipeline
    var paramPairs = _parseQuery(parsed.query);
    var paramAnalysis = _analyseQueryParams(paramPairs, candidate.lineIndex);
    var hasSecretParam = paramAnalysis.findings.length > 0;

    // Classify
    var classification;
    if (internal) {
      classification = 'internal-exposed';
    } else if (hasSecretParam) {
      classification = 'sensitive-parameter';
    } else if (parsed.scheme === 'http' && sensitivePath) {
      // plaintext HTTP to a sensitive-looking external endpoint
      classification = 'suspicious-external';
    } else {
      classification = 'safe-external';
    }

    results.push({
      url: raw,
      parsed: parsed,
      classification: classification,
      internal: internal,
      sensitivePath: sensitivePath,
      queryFindings: paramAnalysis.findings,
      queryReview: paramAnalysis.review,
      line: candidate.line,
      lineIndex: candidate.lineIndex,
      identifierName: candidate.identifierName || null,
    });
  }

  return results;
}

module.exports = {
  analyseUrls: analyseUrls,
  // Exposed for unit testing
  _parseUrl: _parseUrl,
  _isInternal: _isInternal,
  _isSensitivePath: _isSensitivePath,
  _parseQuery: _parseQuery,
};
