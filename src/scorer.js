'use strict';

// Scoring engine: combines all 4 detection layers into a single 0-100 score
// Weights: compression 40%, patterns 35%, entropy 15%, MCP 10%

var WEIGHTS = {
  compression: 0.40,
  patterns: 0.35,
  entropy: 0.15,
  mcp: 0.10,
};

// Verdict thresholds and labels
var VERDICTS = [
  { max: 0,   label: 'Clean',        emoji: '\u2705' },   // ✅
  { max: 10,  label: 'Minimal',      emoji: '\u2705' },   // ✅
  { max: 25,  label: 'Some slop',    emoji: '\u26A0\uFE0F' }, // ⚠️
  { max: 50,  label: 'Sloppy',       emoji: '\u26A0\uFE0F' }, // ⚠️
  { max: 75,  label: 'Heavy slop',   emoji: '\u274C' },   // ❌
  { max: 100, label: 'Catastrophic',  emoji: '\uD83D\uDCA9' }, // 💩
];

/**
 * Maps a score (0-100) to a verdict object { label, emoji }.
 */
function getVerdict(score) {
  var clamped = Math.max(0, Math.min(100, Math.round(score)));
  for (var i = 0; i < VERDICTS.length; i++) {
    if (clamped <= VERDICTS[i].max) {
      return { score: clamped, label: VERDICTS[i].label, emoji: VERDICTS[i].emoji };
    }
  }
  return { score: clamped, label: 'Catastrophic', emoji: '\uD83D\uDCA9' };
}

/**
 * Calculates a normalized pattern score (0-100) from rule hits.
 * Based on cumulative severity, capped at 100.
 */
function patternScore(hits) {
  if (!hits || hits.length === 0) return 0;

  var totalSeverity = 0;
  for (var i = 0; i < hits.length; i++) {
    totalSeverity += hits[i].severity;
  }

  // Scale: 50 cumulative severity points = score of 100
  return Math.min(100, Math.round((totalSeverity / 50) * 100));
}

/**
 * Calculates a normalized entropy score (0-100) from entropy findings.
 * Each finding contributes based on how far above threshold it is.
 */
function entropyScore(findings) {
  if (!findings || findings.length === 0) return 0;

  // Each high-entropy finding is a significant security concern
  // 1 finding = 40, 2 = 65, 3+ = 80+
  var score = Math.min(100, findings.length * 30 + 10);
  return score;
}

/**
 * Calculates a normalized MCP score (0-100) from MCP findings.
 */
function mcpScore(mcpFindings) {
  if (!mcpFindings || mcpFindings.length === 0) return 0;

  var totalSeverity = 0;
  for (var i = 0; i < mcpFindings.length; i++) {
    totalSeverity += (mcpFindings[i].severity || 5);
  }

  return Math.min(100, Math.round((totalSeverity / 30) * 100));
}

/**
 * Scores a single file scan result.
 * fileResult shape: { hits, entropyFindings, compression, mcpFindings? }
 * Returns { score, verdict, breakdown }
 */
function scoreFile(fileResult) {
  var pScore = patternScore(fileResult.hits);
  var eScore = entropyScore(fileResult.entropyFindings);
  var cScore = (fileResult.compression && typeof fileResult.compression.compressionScore === 'number')
    ? fileResult.compression.compressionScore
    : 0;
  var mScore = mcpScore(fileResult.mcpFindings);

  var weighted =
    cScore * WEIGHTS.compression +
    pScore * WEIGHTS.patterns +
    eScore * WEIGHTS.entropy +
    mScore * WEIGHTS.mcp;

  var finalScore = Math.max(0, Math.min(100, Math.round(weighted)));
  var verdict = getVerdict(finalScore);

  return {
    score: finalScore,
    verdict: verdict,
    breakdown: {
      compression: cScore,
      patterns: pScore,
      entropy: eScore,
      mcp: mScore,
    },
  };
}

/**
 * Scores an entire project from an array of file scan results.
 * Aggregates across all files, weighted by lines of code.
 */
function scoreProject(fileResults) {
  if (!fileResults || fileResults.length === 0) {
    return {
      score: 0,
      verdict: getVerdict(0),
      fileCount: 0,
      totalHits: 0,
      totalEntropyFindings: 0,
      fileScores: [],
    };
  }

  var totalWeightedScore = 0;
  var totalLines = 0;
  var totalHits = 0;
  var totalEntropyFindings = 0;
  var fileScores = [];

  for (var i = 0; i < fileResults.length; i++) {
    var fr = fileResults[i];
    var scored = scoreFile(fr);

    // Count lines from hits context (approximate from compression data or hits)
    var lineCount = 1;
    if (fr.compression && fr.compression.selfRatio > 0) {
      // Estimate: use the number of rule-scanned lines if available
      lineCount = Math.max(1, (fr.hits || []).length + (fr.entropyFindings || []).length + 10);
    }

    totalWeightedScore += scored.score * lineCount;
    totalLines += lineCount;
    totalHits += (fr.hits || []).length;
    totalEntropyFindings += (fr.entropyFindings || []).length;

    fileScores.push({
      relativePath: fr.relativePath,
      score: scored.score,
      verdict: scored.verdict,
      breakdown: scored.breakdown,
      hitCount: (fr.hits || []).length,
      entropyFindingCount: (fr.entropyFindings || []).length,
    });
  }

  var projectScore = totalLines > 0 ? Math.round(totalWeightedScore / totalLines) : 0;
  projectScore = Math.max(0, Math.min(100, projectScore));

  return {
    score: projectScore,
    verdict: getVerdict(projectScore),
    fileCount: fileResults.length,
    totalHits: totalHits,
    totalEntropyFindings: totalEntropyFindings,
    fileScores: fileScores,
  };
}

module.exports = {
  scoreFile: scoreFile,
  scoreProject: scoreProject,
  patternScore: patternScore,
  entropyScore: entropyScore,
  mcpScore: mcpScore,
  getVerdict: getVerdict,
  WEIGHTS: WEIGHTS,
  VERDICTS: VERDICTS,
};
