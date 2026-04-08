# Fix: Replace Shannon Entropy Detection with Hybrid Pipeline

## Branch
`fix/entropy-context-aware`

## The Problem
The current `entropy.js` uses Shannon entropy with `isSafeString()` as a gatekeeper. This approach has a fundamental flaw: Shannon entropy measures character randomness but cannot distinguish structured-but-complex strings from random secrets. Both score H ≈ 4.6-4.7. Patching `isSafeString()` with more regex patterns is whack-a-mole. The architecture itself is broken.

## The Fix: Replace the entropy-only approach with a 5-stage fast pipeline + 6-dimension vector engine

This is NOT a patch. This replaces the detection logic for strings entirely. The pattern rules engine (AI slop detection, localStorage checks, async/await checks, etc.) is NOT touched. Only the string analysis system changes.

---

## STAGE 1: DECOMPOSER

### What it does
Takes a raw string extracted from code. Attempts to break it into individual values using multiple structural strategies. Returns an array of values for downstream analysis.

### Why it exists
The string `password=Xk7mR9qL2;host=db.prod.internal` is a compound string. If you analyze it whole, the key names (`password`, `host`) dilute the entropy signal. If you decompose it first, the value `Xk7mR9qL2` gets analyzed alone and correctly flagged as suspicious.

The string `sketch=0;rounded=1;fillColor=#3aa7ff` is also compound. Decompose it into `0`, `1`, `#3aa7ff`. Each value is obviously safe. No false positive.

### Where it lives
New file: `src/decomposer.js`
Exports: `decompose(string)` returns `{ values: string[], decomposed: boolean }`

### The decomposition strategies, in order of priority

**Strategy 1: Semicolon-delimited key=value**
- Split string by `;`
- For each non-empty segment, check if it contains `=`
- Split segment on FIRST `=` only
- Validate key: starts with a letter, contains only `[a-zA-Z0-9_.\-]`
- If 3 or more segments have valid keys, this is a structured string
- Extract all VALUES (right side of `=`) as the output array
- Examples that match: mxGraph styles, CSS inline styles, JDBC connection strings, .NET config

**Strategy 2: Comma-delimited key=value or key:value**
- Same logic as Strategy 1 but split by `,` and accept both `=` and `:` as separators
- Threshold: 3+ valid pairs
- Examples that match: JSON-like configs without braces, CSV-style params

**Strategy 3: Pipe-delimited key=value**
- Same logic but split by `|`
- Threshold: 3+ valid pairs
- Examples that match: some template engines, custom config formats

**Strategy 4: URL query parameters**
- Detect if string starts with `http://`, `https://`, or contains `?` followed by `key=value&key=value`
- Split query string by `&`
- Extract values from key=value pairs
- Threshold: 2+ query params (URLs with params are clearly structured)

**Strategy 5: Simple JSON fragment**
- Detect if string starts with `{` and ends with `}` or starts with `[` and ends with `]`
- Attempt to extract string values using simple pattern matching (find `: "value"` or `:"value"` patterns)
- Do NOT use JSON.parse (it throws on malformed JSON and we want to be resilient)
- Threshold: 2+ extracted string values

### If NO strategy matches
Return `{ values: [originalString], decomposed: false }`. The original string passes through unchanged. Every downstream stage still analyzes it.

### If ANY strategy matches
Return `{ values: extractedValues, decomposed: true }`. Each extracted value goes through Stages 2-5 independently.

### Critical rules
- The decomposer NEVER decides if something is safe or dangerous. It only restructures input.
- The decomposer NEVER skips. It always runs on every string.
- If decomposition produces empty values (e.g., `key=;`), drop the empty strings from the output array.
- If decomposition produces values shorter than 4 characters, still include them. The downstream stages handle short strings correctly.
- Try strategies in order 1-5. Use the FIRST strategy that matches (3+ valid pairs). Do not try remaining strategies.

---

## STAGE 2: CHARACTER FREQUENCY PROFILE

### What it does
For each string (or decomposed value), computes the distribution of character types and produces a signal between 0 and 1 indicating how secret-like the string is.

### Where it lives
New file: `src/char-frequency.js`
Exports: `charFrequencySignal(string)` returns `{ signal: number, charEntropy: number }`

### The logic

1. Count characters in 4 buckets:
   - `uppercase`: A-Z
   - `lowercase`: a-z
   - `digits`: 0-9
   - `symbols`: everything else (including spaces, punctuation, special chars)

2. Compute ratios: each bucket count divided by total string length. Four numbers that sum to 1.0.

3. Compare against two reference profiles:
   - **Code/config profile**: `{ uppercase: 0.05, lowercase: 0.75, digits: 0.10, symbols: 0.10 }`. Typical code strings are mostly lowercase letters with some digits and occasional symbols.
   - **Secret profile**: `{ uppercase: 0.25, lowercase: 0.25, digits: 0.25, symbols: 0.25 }`. Secrets have near-uniform distribution because they're generated by random character selection across all types.

4. Compute Euclidean distance from code profile: `sqrt(sum((actual[i] - code[i])^2))`
5. Compute Euclidean distance from secret profile: `sqrt(sum((actual[i] - secret[i])^2))`
6. Signal = `distFromCode / (distFromCode + distFromSecret)`. This produces a value between 0 and 1. Closer to 0 means the string looks like code. Closer to 1 means it looks like a secret.

7. ALSO compute Shannon character entropy of the string and return it alongside the signal. Stage 3 needs this value and should NOT recompute it.

### Shannon entropy formula
```
For each unique character c in the string:
  p(c) = count(c) / length(string)
  contribution = p(c) * log2(p(c))
H = -sum(all contributions)
```

### Edge cases
- Empty string: return `{ signal: 0.5, charEntropy: 0 }` (neutral, no information)
- Single character: return `{ signal: 0.5, charEntropy: 0 }` (neutral)
- All same character: signal will be extreme in one direction depending on character type. charEntropy = 0.

### Critical rule
This stage produces a SIGNAL. It does NOT decide. The signal feeds into Stage 5.

---

## STAGE 3: BIGRAM ENTROPY RATIO

### What it does
Measures whether character TRANSITIONS in the string are structured (follow patterns) or random (flat noise). Produces a signal between 0 and 1.

### Why it exists
Shannon entropy (used in the current broken approach) treats characters independently. It asks "what characters are present?" Bigram entropy asks "what character PAIRS appear, and how predictable are the transitions?"

In `fillColor=#3aa7ff`:
- Bigrams: `fi`, `il`, `ll`, `lC`, `Co`, `ol`, `lo`, `or`, `r=`, `=#`, `#3`, `3a`, `aa`, `a7`, `7f`, `ff`
- Several bigrams repeat common patterns (`ll`, `aa`, `ff`). Transitions are partially predictable.
- Bigram entropy is LOWER relative to character entropy.

In `Xk7mR9qL2wF5nT3v`:
- Bigrams: `Xk`, `k7`, `7m`, `mR`, `R9`, `9q`, `qL`, `L2`, `2w`, `wF`, `F5`, `5n`, `nT`, `T3`, `3v`
- No bigram repeats. Every transition is unpredictable.
- Bigram entropy is roughly EQUAL to character entropy.

The RATIO `bigram_entropy / char_entropy` is the discriminant:
- Low ratio (< 0.85): structured transitions. Probably not a secret.
- High ratio (> 0.95): random transitions. Probably a secret.
- Middle (0.85 - 0.95): uncertain. Signal reflects this uncertainty.

### Where it lives
New file: `src/bigram.js`
Exports: `bigramSignal(string, charEntropy)` returns `number` (0 to 1)

### The logic

1. Accept `charEntropy` as a parameter (already computed by Stage 2, do NOT recompute)
2. If `charEntropy` is 0 or string length < 4: return 0.5 (neutral, insufficient data for meaningful bigram analysis)
3. Build a frequency map of all consecutive character pairs (bigrams):
   - For each position i from 0 to length-2: the bigram is `string[i] + string[i+1]`
   - Count occurrences of each unique bigram
4. Compute Shannon entropy on the bigram frequency distribution:
   - Total bigrams = string.length - 1
   - For each unique bigram b: `p(b) = count(b) / totalBigrams`
   - `bigramEntropy = -sum(p(b) * log2(p(b)))`
5. Compute ratio: `bigramEntropy / charEntropy`
6. Map ratio to signal:
   - If ratio <= 0.85: signal = `ratio / 0.85 * 0.3` (maps 0-0.85 to 0-0.3, clearly structured)
   - If ratio >= 0.95: signal = `0.7 + (ratio - 0.95) / 0.05 * 0.3` (maps 0.95-1.0 to 0.7-1.0, clearly random)
   - If ratio is between 0.85 and 0.95: signal = `0.3 + (ratio - 0.85) / 0.10 * 0.4` (maps linearly to 0.3-0.7, the uncertain zone)

### Critical rule
This stage produces a SIGNAL. It does NOT decide. The signal feeds into Stage 5.

---

## STAGE 4: COMPRESSION RATIO

### What it does
Compresses the string using zlib and measures how much it shrinks. Structured/repetitive strings compress well. Random strings resist compression. Produces a signal between 0 and 1.

### Where it lives
New file: `src/compression.js`
Exports: `compressionSignal(string)` returns `number | null`

### The logic

1. If string length <= 20: return `null`. zlib is unreliable on short strings because the gzip header (at least 18 bytes) dominates the output. The ratio is meaningless. Returning null tells Stage 5 that this signal is NOT AVAILABLE for this string.

2. Compress the string using `zlib.gzipSync(Buffer.from(string))`
3. Compute ratio: `compressedBuffer.length / Buffer.from(string).length`
4. Map ratio to signal:
   - Ratio around 0.3-0.5 (compresses well): signal low (0.1-0.3), string is structured
   - Ratio around 0.8-1.0+ (resists compression): signal high (0.7-0.9), string is random
   - Linear interpolation between these ranges
   - Note: gzip on short-to-medium strings often produces ratio > 1.0 (compressed is BIGGER) due to header overhead. Handle this: cap ratio at 1.5, map proportionally.

### Critical rules
- NEVER run on strings <= 20 chars. Return null.
- This stage produces a SIGNAL or null. It does NOT decide.

---

## STAGE 5: AGGREGATOR + AMBIGUITY ROUTER

### What it does
Takes 2 or 3 signals from Stages 2-4. Determines whether the signals agree (decided) or disagree (ambiguous). Produces a score 0-100 and routes ambiguous strings to the 6-dim vector engine.

### Where it lives
New file: `src/aggregator.js`
Exports: `aggregate(charSignal, bigramSignal, compressionSignal)` returns `{ score: number, decided: boolean, ambiguous: boolean }`

### The logic

1. Collect available signals into an array. If `compressionSignal` is null, use only `[charSignal, bigramSignal]`. Otherwise use all three.

2. Compute average of available signals: `avgSignal = sum(signals) / signals.length`

3. Check for AGREEMENT:
   - If ALL signals are below 0.25: strong agreement that string is safe
     - `score = avgSignal * 20` (maps to 0-5 range)
     - Return `{ score, decided: true, ambiguous: false }`
   - If ALL signals are above 0.75: strong agreement that string is a secret
     - `score = 80 + (avgSignal - 0.75) * 80` (maps to 80-100 range)
     - Return `{ score, decided: true, ambiguous: false }`

4. Check for DISAGREEMENT:
   - Compute `min` and `max` of available signals
   - If `max - min > 0.35`: signals disagree significantly
     - `score = avgSignal * 100` (maps to the 20-80 range naturally)
     - Return `{ score, decided: false, ambiguous: true }`

5. Check for TWILIGHT ZONE:
   - If any signal is between 0.4 and 0.6 AND no signal is below 0.2 or above 0.8: nobody is confident
     - `score = avgSignal * 100`
     - Return `{ score, decided: false, ambiguous: true }`

6. DEFAULT (mild agreement but not strong):
   - `score = avgSignal * 100`
   - If score < 40: `{ score, decided: true, ambiguous: false }` (leaning safe, good enough)
   - If score > 60: `{ score, decided: true, ambiguous: false }` (leaning secret, good enough)
   - Else: `{ score, decided: false, ambiguous: true }` (middle ground, escalate)

### What happens to the results
- `decided: true` strings get their score finalized. No further analysis.
- `ambiguous: true` strings get collected into a batch (per file). The batch is sent to the 6-dim vector engine.

### Critical rule
Disagreement between signals is the PRIMARY trigger for escalation. A string where char frequency says 0.2 (safe) but bigram says 0.8 (secret) is MORE suspicious than a string where both say 0.5 (uncertain). Conflict means something subtle is happening.

---

## 6-DIMENSIONAL SOLUTION VECTOR ENGINE

### What it does
The heavyweight detector. Only runs on strings that the fast pipeline (Stages 1-5) could not confidently classify. Computes 6 independent mathematical dimensions and combines them with weights into a final score that OVERRIDES the fast pipeline's ambiguous score.

### Where it lives
New file: `src/vector.js`
Exports: `vectorScore(string)` returns `number` (0 to 1, where >= 0.5 means secret)

### The 6 dimensions

**Dimension 1: Shannon Entropy (normalized)**
- Recompute Shannon entropy for the string (do not reuse Stage 2's value -- the vector engine must be independent)
- Normalize: divide by the theoretical maximum for the string's length and charset
- Theoretical max for N unique chars = log2(N)
- Result: 0 to 1. Higher = more random.

**Dimension 2: Compressibility (Kolmogorov approximation)**
- Compress the string with `zlib.gzipSync`
- Compressibility = `compressedLength / originalLength`
- If string is very short (< 10 chars), use the ratio of unique chars to total chars instead
- Normalize to 0-1. Higher = more random (harder to compress).

**Dimension 3: Character frequency distance from natural English text**
- Reference profile for English: `{ uppercase: 0.02, lowercase: 0.82, digits: 0.03, symbols: 0.13 }` (approximation from English letter frequencies plus spaces/punctuation)
- Compute Euclidean distance between string's profile and this reference
- Normalize: divide by maximum possible distance (sqrt(4) = 2.0)
- Result: 0 to 1. Higher = further from natural text.

**Dimension 4: Character frequency distance from code/config**
- Reference profile for code: `{ uppercase: 0.05, lowercase: 0.75, digits: 0.10, symbols: 0.10 }`
- Same Euclidean distance calculation
- Result: 0 to 1. Higher = further from code. Secrets score high here.

**Dimension 5: Character frequency distance from known secrets**
- Reference profile for secrets: `{ uppercase: 0.25, lowercase: 0.25, digits: 0.25, symbols: 0.25 }`
- Same Euclidean distance calculation
- INVERT: result = `1 - normalizedDistance`. So CLOSER to secret profile = higher score.
- Result: 0 to 1. Higher = more secret-like.

**Dimension 6: Character type mix (alternation count)**
- Walk through the string character by character
- Count how many times the character TYPE changes (letter→digit, digit→symbol, symbol→letter, etc.)
- Types: uppercase letter, lowercase letter, digit, symbol
- `mixScore = alternationCount / (stringLength - 1)`
- Secrets alternate types frequently (random selection from all types). Code stays in one type for runs (variable names are all lowercase, numbers are all digits).
- Result: 0 to 1. Higher = more alternation = more secret-like.

### Combining the 6 dimensions

1. Compute all 6 values: `[d1, d2, d3, d4, d5, d6]`
2. Apply weights: `weights = [1/6, 1/6, 1/6, 1/6, 1/6, 1/6]` (equal weights for v1, can be tuned later with labeled data)
3. Weighted sum: `finalScore = sum(d[i] * weights[i])`
4. If `finalScore >= 0.5`: this string is a secret. Override the fast pipeline score to 80+.
5. If `finalScore < 0.5`: this string is NOT a secret. Override the fast pipeline score to 20-.

### Parallel execution (Option A: file-level batching)

The vector engine does NOT run inline with the fast pipeline. The orchestration:

1. Fast pipeline (Stages 1-5) processes an entire file. Collects all `ambiguous: true` strings into a batch array.
2. After the file is fully processed by the fast pipeline, dispatch the batch to a worker thread.
3. The fast pipeline immediately moves to the next file (does NOT wait).
4. The worker thread computes `vectorScore()` for each string in the batch.
5. When the worker finishes, its results are merged back into the file's results: ambiguous scores get overridden by vector verdicts.
6. If `worker_threads` is not available (Node < 12), run the vector synchronously in the main thread as fallback.

### Where the worker lives
New file: `src/vector-worker.js`
- Listens for messages containing a batch of strings
- Runs `vectorScore()` on each
- Posts results back

---

## HOW THE EXISTING CODEBASE CHANGES

### Files to CREATE (new)
- `src/decomposer.js` — Stage 1
- `src/char-frequency.js` — Stage 2
- `src/bigram.js` — Stage 3
- `src/compression.js` — Stage 4 (may already exist, check first)
- `src/aggregator.js` — Stage 5
- `src/vector.js` — 6-dim engine
- `src/vector-worker.js` — worker thread entry

### Files to MODIFY
- `src/entropy.js` — the string analysis function that currently runs Shannon entropy + `isSafeString()` must be replaced. Instead of calling `isSafeString()` then computing entropy then thresholding, it should now call the pipeline: decompose → charFrequency → bigram → compression → aggregate → (optionally) vector. The function signature and return shape should stay the same so callers (scanner.js) don't break.
- `src/scanner.js` — add worker thread orchestration. After processing a file through the fast pipeline, dispatch ambiguous strings to the worker, collect results, merge.
- Test files — add comprehensive tests for each new stage.

### Files to NOT touch
- `src/rules.js` — pattern rules engine is separate, unchanged
- `bin/slopguard.js` — CLI presentation layer, unchanged
- `src/scorer.js` — scoring weights may need minor adjustment but core logic unchanged
- `package.json` — zero dependencies, unchanged

### How entropy.js changes conceptually
BEFORE: `string → isSafeString()? → Shannon entropy → threshold → flag or not`
AFTER: `string → decompose() → [charFrequency, bigram, compression] → aggregate → decided or ambiguous → (if ambiguous) vectorScore → final verdict`

The old `isSafeString()` function can be DELETED. Its job (detecting safe strings) is now distributed across the decomposer (breaks them apart), char frequency (detects code-like profiles), bigram ratio (detects structured transitions), and aggregator (combines signals). No single function has skip/gate power anymore.

---

## VALIDATION CHECKLIST

After implementation, ALL of the following must be true:

### mxGraph strings NOT flagged
- `sketch=0;rounded=1;arcSize=50;fillColor=#3aa7ff;strokeColor=#dddddd` — decomposed into values `[0, 1, 50, #3aa7ff, #dddddd]`. Each value has low char frequency signal, neutral bigram (too short), compression null (too short). Aggregator: decided safe.

### Real API keys ARE flagged
- `sk_live_abc123def456ghi789jkl012mno345` — not decomposed (no structure). Char frequency: near-uniform distribution → high signal. Bigram: random transitions → high signal. Compression: resists compression → high signal. Aggregator: decided secret.

### Embedded secret in structured string IS caught
- `user=admin;password=Xk7mR9qL2;host=db.prod.internal` — decomposed into values `[admin, Xk7mR9qL2, db.prod.internal]`. The value `Xk7mR9qL2` analyzed independently: char frequency high (mixed types), bigram high (random transitions). Aggregator: decided secret for that value. The other values: decided safe.
- This is the case the old `isSafeString()` regex patch could NOT solve. The decomposer solves it.

### Short strings handled correctly
- `abc` — not decomposed. Char frequency: pure lowercase → low signal. Bigram: neutral (too short). Compression: null (too short). Aggregator: 2 signals, one low one neutral → decided safe.

### Base64 non-secrets correctly classified
- `aGVsbG8gd29ybGQ=` — not decomposed. Char frequency: mostly lowercase → lowish signal. Bigram: somewhat structured (base64 has patterns) → medium signal. Compression: compresses somewhat → medium signal. Aggregator: signals mildly disagree → ambiguous. Vector engine: dimension analysis shows close to code profile, moderate entropy, moderate alternation → score < 0.5 → not a secret.

### All 147 existing tests still pass
- The pattern rules engine is untouched. Line-by-line AI slop detection works exactly as before.
- Only the string analysis system changed. Any test that specifically tested `isSafeString()` or entropy thresholds needs to be updated to test the new pipeline stages instead.

---

## WHAT NOT TO DO

1. Do NOT keep `isSafeString()` alongside the new pipeline. It's replaced, not augmented.
2. Do NOT add any npm dependencies. Everything uses `fs`, `path`, `zlib`, `worker_threads`.
3. Do NOT use `eval()`, `new Function()`, or dynamic imports.
4. Do NOT make any stage issue a final safe/secret verdict alone. Every stage produces a signal (0-1). Only the aggregator combines them. Only the vector engine can override.
5. Do NOT run compression on strings <= 20 chars. Return null.
6. Do NOT skip the decomposer for any string. It always runs.
7. Do NOT try ALL decomposition strategies on every string. Try in order, use the FIRST that matches. If none match, pass through whole.
8. Do NOT use JSON.parse in the JSON fragment decomposition strategy. It throws on malformed JSON. Use simple pattern matching instead.
9. Do NOT block the fast pipeline waiting for vector engine results. Dispatch the batch and move to the next file.
