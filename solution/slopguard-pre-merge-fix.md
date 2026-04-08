# Pre-Merge Fix: Vector Threshold + Self-Scan Score

## Branch
`fix/phase-4-pipeline-integration`

---

## Problem 1: Vector threshold was changed from 0.50 to 0.52

### Why this is wrong
The 0.50 threshold comes from the RIT thesis "Beyond RegEx: Heuristic-based Secret Detection" (2025). It was tested on 20,275 strings (Main Dataset, 90.88% accuracy) and validated on 306,965 unseen strings (Comparison Dataset, 89.31% accuracy). The thesis tested NO other thresholds. 0.50 is the canonical value for a weighted-average solution vector. Moving to 0.52 without labeled data means strings scoring 0.50-0.51 now pass as "not secret" with zero empirical justification.

### The fix
Revert the vector threshold in `entropy.js` from 0.52 back to 0.50. The line that checks if the vector score indicates a secret must use `>= 0.50`, not `>= 0.52`.

---

## Problem 2: Self-scan score is 25 because of NCD compression baseline on new modules

### Why the score is high
The project grew by 6 new files (decomposer.js, char-frequency.js, bigram.js, compression.js, aggregator.js, vector.js). Each file gets a file-level NCD compression texture score. Normal JavaScript source code compresses to roughly 30-40% of its original size with gzip. The NCD scoring is interpreting this normal compression ratio as "somewhat AI-textured" and assigning C=25 to each file.

This is a calibration problem in the file-level NCD scoring, not in the pipeline or the tests.

### The root cause
The file-level compression texture score (the 10% weight component in the per-file scoring formula) is comparing each file's compression ratio against reference corpora. But the reference corpora baselines have not been calibrated for slopguard's own code style. Normal, well-written JavaScript has a certain compression profile. The current NCD scoring treats that profile as partially AI-like.

### The fix — two changes

**Change 1: Recalibrate the NCD compression texture scoring baseline.**

The file-level NCD texture score currently maps raw gzip compression ratios to a 0-100 scale. The mapping needs adjustment. Normal human-written JavaScript has a gzip compression ratio of approximately 0.25-0.40 (compresses to 25-40% of original). AI-generated JavaScript with high repetition compresses to approximately 0.15-0.25 (compresses more because of structural repetitiveness).

The current mapping treats anything below 0.45 as partially suspicious. It should treat anything below 0.30 as suspicious and anything above 0.30 as normal.

In `scorer.js` (or wherever the file-level compression texture score is computed): find where the gzip ratio is mapped to a 0-100 score. Adjust the mapping so that:
- Compression ratio >= 0.35: texture score = 0 (normal JavaScript, no AI signal)
- Compression ratio 0.20-0.35: texture score = 0 to 50 (linear interpolation, mild AI signal)
- Compression ratio < 0.20: texture score = 50 to 100 (strong AI signal, highly repetitive)

This means normal JavaScript files score 0 on texture instead of 25.

**Change 2: Revert the self-scan test threshold back to `< 25`.**

After Change 1, the self-scan score should drop well below 25 because the 6 new files will no longer contribute C=25 each. The test should use `< 25`, not `<= 25`. The boundary should have margin, not sit right on the edge.

---

## Problem 3: Reverting 0.50 may re-expose false positives that 0.52 was hiding

### Why this might happen
If the agent raised the threshold to 0.52 because specific strings were scoring 0.50-0.51 and causing false positives, reverting to 0.50 brings those back. But the right fix is not to move the threshold — it's to fix WHY those strings score 0.50-0.51.

### What to do if false positives reappear after reverting to 0.50

Check what strings score 0.50-0.51 in the vector engine. For each one:

1. If it's a test infrastructure string (ANSI color codes, assertion messages, test descriptions): the prose filter (>10% whitespace) should already catch these. If it doesn't, the prose filter needs to also check for strings containing common English words — a string with 3+ English dictionary words of 4+ letters is prose, not a secret.

2. If it's a string from the slopguard source code itself (rule descriptions, error messages): these are human-written prose that happens to have moderate entropy. The prose filter handles this. If the prose filter isn't catching them, lower the whitespace threshold from 10% to 5%, or add a word-count check: if the string contains 3+ words separated by spaces, it's prose.

3. If it's a legitimate edge case (a config value that's borderline): leave it flagged. A score of 0.50 IS borderline. The user should review it. That's correct behavior.

Do NOT raise the vector threshold to hide these. Fix the upstream pipeline (better decomposition, better prose detection) or accept that borderline strings get flagged.

---

## Execution order

1. Revert vector threshold from 0.52 to 0.50 in `entropy.js`
2. Recalibrate NCD compression texture scoring in `scorer.js` (adjust ratio-to-score mapping)
3. Run tests — check what breaks
4. If false positives reappear from step 1, apply prose filter improvements (not threshold bumps)
5. Revert self-scan test threshold from `<= 25` back to `< 25`
6. Run full test suite + self-scan
7. Commit

---

## What NOT to do

1. Do NOT keep the vector threshold at 0.52. Revert to 0.50.
2. Do NOT keep the self-scan test at `<= 25`. Fix the score, not the test.
3. Do NOT add more structural exclusions to hide scoring issues. The pipeline should handle classification mathematically.
4. Do NOT change the per-file scoring weights (45/35/10/10). The weights are correct. The NCD baseline calibration is what's off.

---

## Files to modify
- `src/entropy.js` — revert vector threshold to 0.50
- `src/scorer.js` (or wherever file-level NCD texture score is computed) — recalibrate compression ratio to score mapping
- `test/run.js` — revert self-scan threshold to `< 25`
- Possibly `src/entropy.js` again — improve prose filter if false positives reappear
