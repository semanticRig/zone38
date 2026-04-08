'use strict';

// Entropy-based secret detection — hybrid pipeline
// Replaces the old Shannon-threshold approach with a 5-stage pipeline:
// decompose → charFrequency → bigram → compression → aggregate → (if ambiguous) vector

var decomposer = require('./decomposer');
var charFreq = require('./char-frequency');
var bigramMod = require('./bigram');
var compressionMod = require('./compression');
var aggregator = require('./aggregator');
var vectorEngine = require('./vector');

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

// Strings starting with these prefixes are definitively secrets — bypass all pipeline logic.
var SECRET_PREFIXES = [
  'sk-', 'ghp_', 'gho_', 'github_pat_',
  'AKIA', 'ASIA',
  'sk_live_', 'pk_live_',
  'xox', 'xoxa-', 'xapp-',
  'glpat-',
];

/**
 * Returns true if a string starts with any known secret service prefix.
 * These are always secrets regardless of pipeline signals.
 */
function hasSecretPrefix(value) {
  for (var i = 0; i < SECRET_PREFIXES.length; i++) {
    if (value.indexOf(SECRET_PREFIXES[i]) === 0) return true;
  }
  return false;
}


// Minimum string length to consider for entropy analysis
var MIN_STRING_LENGTH = 16;

// Structural exclusions: patterns that are structurally impossible secrets.
// Narrow and specific — NOT a catch-all gatekeeper like the old isSafeString().
var STRUCTURAL_EXCLUSIONS = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
  /^https?:\/\//,                                                       // URLs
  /^data:[a-z]+\/[a-z]+;base64,/,                                       // data URIs
  /^(\.\/|\.\.\/|\/)./,                                                  // file paths
];

function extractStrings(line) {
  var results = [];
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

/**
 * Runs a single value through the fast pipeline (Stages 2-4) and aggregator (Stage 5).
 * Returns { score: number (0-100), decided: boolean, ambiguous: boolean }.
 */
function pipelineAnalyze(value) {
  var cfResult = charFreq.charFrequencySignal(value);
  var bSig = bigramMod.bigramSignal(value, cfResult.charEntropy);
  var cSig = compressionMod.compressionSignal(value);
  return aggregator.aggregate(cfResult.signal, bSig, cSig);
}

/**
 * Analyzes a single line of code for high-entropy strings using the hybrid pipeline.
 * Returns array of findings: { value, entropy, charset, threshold, lineNumber, line }
 */
function analyzeLineEntropy(line, lineNumber) {
  var findings = [];
  var strings = extractStrings(line);

  // Skip comment lines
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

    // Known-prefix bypass: always flag, skip pipeline
    // But skip prose that coincidentally starts with a prefix (secrets have no spaces)
    if (hasSecretPrefix(str.value)) {
      var prefixSpaces = 0;
      for (var ps = 0; ps < str.value.length; ps++) {
        if (str.value[ps] === ' ') prefixSpaces++;
      }
      if (str.value.length > 0 && prefixSpaces / str.value.length > 0.10) continue;

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

    // Stage 1: Decompose compound strings
    var decomposed = decomposer.decompose(str.value);
    var flaggedValues = [];

    for (var v = 0; v < decomposed.values.length; v++) {
      var val = decomposed.values[v];
      if (val.length < 8) continue; // Too short for meaningful signal analysis

      // Structural exclusion: applied per-value AFTER decomposition
      // so URLs with secret query params get decomposed first
      var excluded = false;
      for (var e = 0; e < STRUCTURAL_EXCLUSIONS.length; e++) {
        if (STRUCTURAL_EXCLUSIONS[e].test(val)) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;

      // Prose filter: secrets don't contain spaces; strings with >10% whitespace
      // are human-readable text (fix descriptions, UI messages, etc.)
      var spaceCount = 0;
      for (var sc = 0; sc < val.length; sc++) {
        if (val[sc] === ' ') spaceCount++;
      }
      if (val.length > 0 && spaceCount / val.length > 0.10) continue;

      // Stages 2-5: Fast pipeline
      var result = pipelineAnalyze(val);

      if (result.decided && result.score >= 60) {
        // Decided secret
        flaggedValues.push(val);
      } else if (result.ambiguous) {
        // Escalate to vector engine (Stage 6)
        var vScore = vectorEngine.vectorScore(val);

        if (vScore >= 0.52) {
          flaggedValues.push(val);
        }
      }
      // decided && score < 60: safe, skip
    }

    if (flaggedValues.length > 0) {
      // Report the finding using the original string value for consistency
      findings.push({
        value: str.value,
        entropy: Math.round(entropy * 100) / 100,
        charset: charset,
        threshold: 0,
        lineNumber: lineNumber,
        line: line,
        flaggedValues: flaggedValues,
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
  hasSecretPrefix: hasSecretPrefix,
  pipelineAnalyze: pipelineAnalyze,
  SECRET_PREFIXES: SECRET_PREFIXES,
  MIN_STRING_LENGTH: MIN_STRING_LENGTH,
};
