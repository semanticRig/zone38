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

// Theoretical max entropy per charset (log2 of charset size).
// CHARSET_CEILING is the per-charset cap on adjusted thresholds.
// null = no ceiling (allow multipliers to fully suppress findings for this charset).
// For hex: context signals are authoritative — SHA hashes and OAuth IDs are
//   indistinguishable from random hex by entropy alone, so trust the LHS + fallback.
// For base64: structured OAuth IDs have H < 4.8; truly random keys have H ≥ 5.0,
//   so cap at 4.9 to ensure random keys always fire even in suppression context.
// For alphanumeric: analogous to base64, cap at 4.6.
// For mixed: no common non-secret strings reach H > 4.5, no ceiling needed.
var CHARSET_MAX = {
  hex: 4.0,
  base64: 6.0,
  alphanumeric: 5.17,
  mixed: 6.5,
};

var CHARSET_CEILING = {
  hex: null,   // No ceiling — LHS + fallback context is authoritative for hex
  base64: 4.9, // Separates structured OAuth IDs (H<4.8) from random keys (H≥5.0)
  alphanumeric: 4.6,
  mixed: null, // No ceiling — mixed strings have no structured non-secret pattern
};

// Strings starting with these prefixes are definitively secrets — bypass all threshold logic.
var SECRET_PREFIXES = [
  'sk-', 'ghp_', 'gho_', 'github_pat_',
  'AKIA', 'ASIA',
  'sk_live_', 'pk_live_',
  'xox', 'xoxa-', 'xapp-',
  'glpat-',
];

// LHS keywords that indicate the assigned variable is a secret (lower threshold)
var SECRET_LHS_KEYWORDS = ['secret', 'key', 'token', 'password', 'private', 'auth', 'credential'];

// LHS keywords that indicate the assigned variable is public config (raise threshold)
var PUBLIC_LHS_KEYWORDS = ['id', 'client', 'app', 'public', 'url', 'base', 'endpoint', 'callback'];

/**
 * Returns true if a string starts with any known secret service prefix.
 * These are always secrets regardless of entropy or context.
 */
function hasSecretPrefix(value) {
  for (var i = 0; i < SECRET_PREFIXES.length; i++) {
    if (value.indexOf(SECRET_PREFIXES[i]) === 0) return true;
  }
  return false;
}

/**
 * Extracts the variable name on the left-hand side of an assignment on this line.
 * Returns the LHS token (lowercased) or empty string if no assignment found.
 */
function extractLHS(line) {
  // Match: (optional: window.X =, var/let/const x =, x =) the identifier before =
  var match = line.match(/(?:^|[\s;])(?:var|let|const)?\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*=/);
  if (!match) return '';
  return match[1].toLowerCase();
}

/**
 * Calculates the adjusted entropy threshold for a string given its line context.
 * Applies LHS polarity and fallback-pattern multipliers, then caps at charset max × 0.90.
 */
function adjustedThreshold(charset, line) {
  var base = THRESHOLDS[charset];
  var multiplier = 1.0;

  // LHS polarity: check the variable name being assigned to
  var lhs = extractLHS(line);
  if (lhs) {
    for (var s = 0; s < SECRET_LHS_KEYWORDS.length; s++) {
      if (lhs.indexOf(SECRET_LHS_KEYWORDS[s]) !== -1) {
        multiplier *= 0.8;  // secret keyword → lower threshold, flag more aggressively
        break;
      }
    }
    for (var p = 0; p < PUBLIC_LHS_KEYWORDS.length; p++) {
      if (lhs.indexOf(PUBLIC_LHS_KEYWORDS[p]) !== -1) {
        multiplier *= 1.3;  // public keyword → raise threshold, require stronger evidence
        break;
      }
    }
  }

  // Fallback pattern: `x = x || 'value'` means this is a config default, not a secret
  if (/[A-Za-z_$][A-Za-z0-9_$.]*\s*=\s*[A-Za-z_$][A-Za-z0-9_$.]*\s*\|\|/.test(line)) {
    multiplier *= 1.5;
  }

  var adjusted = base * multiplier;

  // Per-charset ceiling: prevents over-suppression of truly random keys.
  // null means no ceiling — context is fully authoritative for this charset.
  var ceiling = CHARSET_CEILING[charset];
  if (ceiling !== null) {
    adjusted = Math.min(adjusted, ceiling);
  }
  return adjusted;
}

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
  /^[A-Za-z\s.,!?;:'"()\-\/#%&@+=${}\[\]\\|*<>~^]+$/,                 // Prose/template text
  /^\s+$/,                                                               // whitespace only
  /^(\.\/|\.\.\/|\/)./,                                                  // file paths
  /\$\{[^}]+\}/,                                                         // template literals with interpolation
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
 * Returns array of findings: { value, entropy, charset, threshold, lineNumber, line }
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
    // Template literals with interpolation are code expressions, not secrets
    if (str.quote === '`' && /\$\{/.test(str.value)) continue;

    var entropy = shannonEntropy(str.value);
    var charset = detectCharset(str.value);

    // Known-prefix bypass: check BEFORE isSafeString so e.g. 'glpat-abcdef...'
    // is not silenced by the prose-like safe pattern.
    if (hasSecretPrefix(str.value)) {
      findings.push({
        value: str.value,
        entropy: Math.round(entropy * 100) / 100,
        charset: charset,
        threshold: 0,
        lineNumber: lineNumber,
        line: line,
        prefixMatch: true,
      });
      continue;
    }

    if (isSafeString(str.value)) continue;

    // Context-aware threshold: adjusted for LHS polarity and fallback pattern,
    // capped per charset so random keys always fire
    var threshold = adjustedThreshold(charset, line);

    if (entropy >= threshold) {
      findings.push({
        value: str.value,
        entropy: Math.round(entropy * 100) / 100,
        charset: charset,
        threshold: Math.round(threshold * 100) / 100,
        lineNumber: lineNumber,
        line: line,
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
  hasSecretPrefix: hasSecretPrefix,
  adjustedThreshold: adjustedThreshold,
  extractLHS: extractLHS,
  THRESHOLDS: THRESHOLDS,
  CHARSET_MAX: CHARSET_MAX,
  CHARSET_CEILING: CHARSET_CEILING,
  SECRET_PREFIXES: SECRET_PREFIXES,
  MIN_STRING_LENGTH: MIN_STRING_LENGTH,
};
