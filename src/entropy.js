'use strict';

// Shannon entropy calculator for secret detection
// High-entropy strings in code are likely real secrets (API keys, tokens, passwords)

/**
 * Calculates Shannon entropy of a string.
 * H = -sum(p_i * log2(p_i)) where p_i is frequency of each unique character.
 * Returns a value from 0 (all same char) to log2(uniqueChars).
 */
function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;

  var freq = {};
  for (var i = 0; i < str.length; i++) {
    var ch = str[i];
    freq[ch] = (freq[ch] || 0) + 1;
  }

  var len = str.length;
  var entropy = 0;
  var keys = Object.keys(freq);

  for (var j = 0; j < keys.length; j++) {
    var p = freq[keys[j]] / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Detects the character set of a string.
 * Returns 'base64', 'hex', 'alphanumeric', or 'mixed'.
 */
function detectCharset(str) {
  if (/^[A-Fa-f0-9]+$/.test(str)) return 'hex';
  if (/^[A-Za-z0-9+/=_-]+$/.test(str)) return 'base64';
  if (/^[A-Za-z0-9]+$/.test(str)) return 'alphanumeric';
  return 'mixed';
}

// Entropy thresholds per charset — above these = likely secret
var THRESHOLDS = {
  base64: 4.5,
  hex: 3.0,
  alphanumeric: 4.0,
  mixed: 4.5,
};

// Minimum string length to consider for entropy analysis
var MIN_STRING_LENGTH = 16;

/**
 * Extracts string literals from a line of code.
 * Returns array of { value, quote } for strings longer than MIN_STRING_LENGTH.
 */
function extractStrings(line) {
  var results = [];
  // Match single-quoted, double-quoted, and backtick strings (no multiline)
  var regex = /(['"`])([^'"`\\]*(?:\\.[^'"`\\]*)*)\1/g;
  var match;

  while ((match = regex.exec(line)) !== null) {
    var value = match[2];
    if (value.length >= MIN_STRING_LENGTH) {
      results.push({ value: value, quote: match[1] });
    }
  }

  return results;
}

// Known safe patterns that look high-entropy but are not secrets
var SAFE_PATTERNS = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
  /^https?:\/\//,                                                       // URLs
  /^\/.+\/[gimsuvy]*$/,                                                  // regex patterns
  /^data:[a-z]+\/[a-z]+;base64,/,                                       // data URIs
  /^[A-Za-z\s.,!?;:'"()-]+$/,                                           // English prose
  /^\s+$/,                                                               // whitespace only
  /^(\.\/|\.\.\/|\/)/,                                                   // file paths
];

/**
 * Checks if a string looks like a safe (non-secret) pattern.
 */
function isSafeString(value) {
  for (var i = 0; i < SAFE_PATTERNS.length; i++) {
    if (SAFE_PATTERNS[i].test(value)) return true;
  }
  return false;
}

/**
 * Analyzes a single line of code for high-entropy strings.
 * Returns array of findings: { value, entropy, charset, lineNumber }
 */
function analyzeLineEntropy(line, lineNumber) {
  var findings = [];
  var strings = extractStrings(line);

  // Skip lines that are clearly comments
  var trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return findings;
  }

  for (var i = 0; i < strings.length; i++) {
    var str = strings[i];
    if (isSafeString(str.value)) continue;

    var charset = detectCharset(str.value);
    var entropy = shannonEntropy(str.value);
    var threshold = THRESHOLDS[charset];

    if (entropy >= threshold) {
      findings.push({
        value: str.value,
        entropy: Math.round(entropy * 100) / 100,
        charset: charset,
        threshold: threshold,
        lineNumber: lineNumber,
      });
    }
  }

  return findings;
}

/**
 * Analyzes an entire file's content for high-entropy strings.
 * Returns array of all entropy findings across the file.
 */
function analyzeFileEntropy(content) {
  var lines = content.split('\n');
  var allFindings = [];

  for (var i = 0; i < lines.length; i++) {
    var lineFindings = analyzeLineEntropy(lines[i], i + 1);
    allFindings = allFindings.concat(lineFindings);
  }

  return allFindings;
}

module.exports = {
  shannonEntropy: shannonEntropy,
  detectCharset: detectCharset,
  extractStrings: extractStrings,
  analyzeLineEntropy: analyzeLineEntropy,
  analyzeFileEntropy: analyzeFileEntropy,
  isSafeString: isSafeString,
  THRESHOLDS: THRESHOLDS,
  MIN_STRING_LENGTH: MIN_STRING_LENGTH,
};
