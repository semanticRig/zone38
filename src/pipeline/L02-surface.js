'use strict';

// Layer 2 — Surface Characterisation
// Computes fast global signals for every file before string-level work begins.
// Mutates fileRecord.surface in place and returns it.
// Output shape: { minified, routingDensity, avgLineLength, lineDistribution, whitespaceRatio, repetitionFraction }

// Structural symbols that indicate routing/control-flow density (code, not data)
var ROUTING_CHARS = new Set(['{', '}', '(', ')', ';']);

// Count occurrences of chars from a Set within a string.
function countSetChars(str, charSet) {
  var count = 0;
  for (var i = 0; i < str.length; i++) {
    if (charSet.has(str[i])) count++;
  }
  return count;
}

// Simple Levenshtein distance — used only for short prefix buckets (first 20 chars),
// so the strings passed here are always ≤ 20 chars and the cost is negligible.
function editDistance(a, b) {
  var la = a.length;
  var lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Single-row DP
  var prev = [];
  var curr = [];
  for (var j = 0; j <= lb; j++) prev[j] = j;

  for (var i = 1; i <= la; i++) {
    curr[0] = i;
    for (var k = 1; k <= lb; k++) {
      var cost = a[i - 1] === b[k - 1] ? 0 : 1;
      curr[k] = Math.min(curr[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost);
    }
    var tmp = prev; prev = curr; curr = tmp;
  }
  return prev[lb];
}

// Fraction of lines that are "near-identical" to at least one other line.
// Groups lines by their first 20-char prefix; within each bucket, checks
// pairwise edit distance ≤ 4. Lines in a bucket of size ≥ 3 where any pair
// has distance ≤ 4 are counted as repetitive.
function repetitionFraction(lines) {
  if (lines.length < 3) return 0;

  // Strip whitespace before bucketing so indentation differences don't dominate
  var stripped = lines.map(function (l) { return l.trim(); });

  // Bucket by first 20 chars of stripped line
  var buckets = {};
  for (var i = 0; i < stripped.length; i++) {
    var key = stripped[i].slice(0, 20);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(i);
  }

  var repetitiveSet = {};
  var keys = Object.keys(buckets);
  for (var b = 0; b < keys.length; b++) {
    var bucket = buckets[keys[b]];
    if (bucket.length < 3) continue;

    // Check pairwise edit distance within bucket (≤ first 60 chars for speed)
    var hasClose = false;
    outer: for (var p = 0; p < bucket.length && !hasClose; p++) {
      for (var q = p + 1; q < bucket.length && !hasClose; q++) {
        var sa = stripped[bucket[p]].slice(0, 60);
        var sb = stripped[bucket[q]].slice(0, 60);
        if (editDistance(sa, sb) <= 4) {
          hasClose = true;
        }
      }
    }

    if (hasClose) {
      for (var m = 0; m < bucket.length; m++) {
        repetitiveSet[bucket[m]] = true;
      }
    }
  }

  return Object.keys(repetitiveSet).length / lines.length;
}

function characteriseFile(content) {
  if (!content || content.length === 0) {
    return {
      minified: false,
      routingDensity: 0,
      avgLineLength: 0,
      lineDistribution: [],
      whitespaceRatio: 0,
      repetitionFraction: 0,
    };
  }

  var lines = content.split('\n');
  var totalChars = content.length;

  // Strip a single trailing empty element produced by files ending with \n
  var effectiveLines = (lines.length > 0 && lines[lines.length - 1].trim() === '')
    ? lines.slice(0, lines.length - 1)
    : lines;

  // Minified: effectively one content line AND total length > 500
  var minified = effectiveLines.length === 1 && content.length > 500;

  // Routing density: structural symbols / total chars
  var routingCount = countSetChars(content, ROUTING_CHARS);
  var routingDensity = routingCount / totalChars;

  // Average line length (excluding empty lines from the average)
  var nonEmpty = effectiveLines.filter(function (l) { return l.trim().length > 0; });
  var avgLineLength = nonEmpty.length === 0 ? 0 :
    nonEmpty.reduce(function (sum, l) { return sum + l.length; }, 0) / nonEmpty.length;

  // Line length distribution: buckets [0-40], [41-80], [81-120], [121+]
  var buckets = [0, 0, 0, 0];
  for (var i = 0; i < effectiveLines.length; i++) {
    var len = effectiveLines[i].length;
    if (len <= 40) buckets[0]++;
    else if (len <= 80) buckets[1]++;
    else if (len <= 120) buckets[2]++;
    else buckets[3]++;
  }
  var lineDistribution = buckets.map(function (c) { return c / effectiveLines.length; });

  // Whitespace ratio: whitespace chars / total chars
  var wsCount = 0;
  for (var j = 0; j < content.length; j++) {
    var c = content[j];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') wsCount++;
  }
  var whitespaceRatio = wsCount / totalChars;

  // Repetition fraction
  var repFrac = repetitionFraction(effectiveLines);

  return {
    minified: minified,
    routingDensity: routingDensity,
    avgLineLength: avgLineLength,
    lineDistribution: lineDistribution,
    whitespaceRatio: whitespaceRatio,
    repetitionFraction: repFrac,
  };
}

// Convenience: characterise a file record and mutate it in place.
function characteriseRecord(fileRecord, content) {
  fileRecord.surface = characteriseFile(content);
  return fileRecord.surface;
}

module.exports = {
  characteriseFile: characteriseFile,
  characteriseRecord: characteriseRecord,
};
