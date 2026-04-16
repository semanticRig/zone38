# slopguard v2 — Build Phases

> Source of truth: `solutionV2/CLAUDE.md` and `solutionV2/planner.instructions.md`
> Current release: v0.0.1 (flat scanner, 4-layer architecture)
> Target release: v2.0.0 (16-layer sequential pipeline, 3-axis scoring)

---

## What Changes in v2

v0.0.1 ships one orchestrator (`scanner.js`) with 4 detection layers (compression, entropy, pattern rules, MCP config) that produce a single 0-100 Slop Score.

v2 replaces this with a **16-layer sequential pipeline** and **three independent scoring axes**:

- **Axis A — AI Slop Risk** (compression texture + pattern hits + cross-file repetition)
- **Axis B — Security Exposure Risk** (secrets + URL topology)
- **Axis C — Code Quality Risk** (pattern severity distribution + complexity signals)

Every layer does exactly one job. No layer repeats work from another.

---

## Phase 1: Project Skeleton
**Branch**: `feature/phase-1-skeleton`

Objective: Directory structure, updated `package.json`, CLI shell stub, empty module stubs for all 16 pipeline layers and the full `src/string/` pipeline.

Steps:
1. Create `src/pipeline/` with empty stubs for `L00-ingestion.js` through `L15-output.js`
2. Create `src/string/` stubs: `decomposer.js`, `char-frequency.js`, `bigram.js`, `compression.js`, `aggregator.js`, `vector.js`, `vector-worker.js`
3. Update `bin/slopguard.js` shebang + arg parsing (`--help`, `--verbose`, `--json`, `--mcp`, `--axis`, `--threshold`), placeholder output
4. Add `.gitignore` update, scaffold `README.md` v2 section

Validation: `node bin/slopguard.js --help` prints usage. `npm pack --dry-run` shows correct files. All stubs `require()` without throwing.

---

## Phase 2: Layer 0 + Layer 1 — Ingestion and Role Classification
**Branch**: `feature/phase-2-layer01-ingestion-role`

Objective: Walk the file tree; classify every file by territory and role.

Input: target directory path
Output: array of file metadata records `{ path, relativePath, ext, size, depth, territory, role }`

Steps:
1. Implement `walkProject(rootDir)` in `L00` — recursive, skips `node_modules`, `.git`, `dist`, `build`; tags territory (`vendor|dist|node_modules|test|config|application`) per file
2. Implement `classifyRole(fileRecord)` in `L01` — backend/frontend/isomorphic, config/logic/declaration, test/application, `.d.ts` flag
3. Wire both into a `buildRegistry(rootDir)` export consumed by the orchestrator
4. Create fixtures: one file per territory type, one per role type

Validation: `buildRegistry('.')` returns correct territory and role for each fixture. No files from excluded directories appear.

---

## Phase 3: Layer 2 — Surface Characterisation
**Branch**: `feature/phase-3-layer02-surface`

Objective: Compute fast global signals for every file before string-level work begins.

Input: file metadata record + raw file content
Output: `surface` object on each record: `{ minified, routingDensity, avgLineLength, lineDistribution, whitespaceRatio, repetitionFraction }`

Steps:
1. Implement `characteriseFile(content)` — computes all 5 surface signals
2. Single-line detection: file is one line AND length > 500 → `minified: true`
3. Repetition fingerprint: bucket lines by first 20 chars; fraction of lines sharing a bucket ≥ 3 members
4. Wire into the registry pipeline
5. Create fixtures: minified bundle, repetitive AI scaffold, normal human JS

Validation: Minified fixture → `minified: true`. Repetitive fixture → `repetitionFraction > 0.4`. Normal fixture → both flags false.

---

## Phase 4: Layer 3 — Compression Texture Analysis
**Branch**: `feature/phase-4-layer03-compression`

Objective: Measure AI-slop texture at file level via NCD and segmented compression.

Input: surface-characterised file record + raw content
Output: `compression` object: `{ selfRatio, ncdHuman, ncdAI, segmentScores, projectOutlierScore }`

Steps:
1. Implement `selfCompressionRatio(content)` — `gzip(content).length / content.length`
2. Implement `ncd(x, y)` via `zlib.gzipSync` — `(Z(xy) - min(Z(x),Z(y))) / max(Z(x),Z(y))`
3. Load `corpus/human.js.gz` and `corpus/ai.js.gz` as reference buffers
4. Implement `segmentedCompression(content, windowSize)` — slide window, compute self-ratio per window
5. `projectOutlierScore` is a placeholder; populated at Layer 12

Validation: Repetitive AI fixture → lower self-ratio than human fixture. NCD against AI corpus lower for AI fixture. Segmented scores localise the repetitive region.

---

## Phase 5: Layer 4 + Layer 5 — Entity Harvesting and Pre-Flight Gate
**Branch**: `feature/phase-5-layer0405-harvest-preflight`

Objective: Extract all candidate payloads from file content; discard logic, blobs, and duplicates.

Input: surface-characterised file record + raw content
Output: clean `candidates` array `{ value, line, col, identifierName, callSiteContext, priority }`

Steps:
1. String literal extractor — regex for single/double/template quoted strings, excluding empty and single-char
2. Gravity Welder — fuse adjacent string concatenations connected by `+` or `,`
3. URL extractor — `scheme://authority/path?query` patterns; excludes pure comment lines
4. Key-value extractor — `identifier = "string"` and `{ key: "string" }` structural patterns
5. Pre-flight gate: logic-graph discard (routing density > 0.35 on that line), blob classification, length bounds, rolling hash deduplication

Validation: Minified file → zero candidates surviving. Structured config string decomposes correctly. Rolling hash deduplicates repeated identical values.

---

## Phase 6: String Analysis Pipeline
**Branch**: `feature/phase-6-string-pipeline`

Objective: Build the full `src/string/` pipeline — decomposer through vector engine.

Input: a single candidate string value
Output: `{ score: 0-100, decided: boolean, ambiguous: boolean, signals: {} }`

Steps:
1. `decomposer.js` — 5 strategies in priority order; returns `{ values, decomposed }`
2. `char-frequency.js` — char buckets, Euclidean distance from code/secret profiles, Shannon entropy
3. `bigram.js` — bigram entropy ratio signal
4. `compression.js` — per-string compression signal (null if ≤ 20 chars)
5. `aggregator.js` — 3-signal agreement/disagreement logic, ambiguity router
6. `vector.js` — 6-dimensional weighted score, threshold 0.50
7. `vector-worker.js` — `worker_threads` entry, processes batch, posts results back

Dimensions of the vector engine:
- D1: Shannon entropy (normalised)
- D2: Kolmogorov approximation via compression
- D3: Distance from natural English text profile
- D4: Distance from code/config profile
- D5: Proximity to known-secret profile (inverted distance)
- D6: Character type alternation count (type-mix score)

Validation: mxGraph-style string → decided safe. Real API key → decided secret. Compound string with embedded secret → secret isolated and flagged. Base64 non-secret → routes to vector, scores < 0.50. All 147+ existing string tests pass.

---

## Phase 7: Layer 6 + Layer 7 + Layer 8 — Herd, Deep Analysis, Arbitration
**Branch**: `feature/phase-7-layer0608-herd-deep-arbitration`

Objective: Wire the string pipeline into the per-file candidate analysis flow.

Input: pre-flight-passed candidates array
Output: `findings` array (HIGH/MEDIUM) + `review` array (UNCERTAIN)

Steps:
1. `L06-herd.js`: entropy variance check, Inter-Herd Divergence test
2. `L07-deep.js`: calls string pipeline per value; collects ambiguous batch for worker; adds Index of Coincidence, class transition friction, entropy gradient sweep, uniformity filter
3. `L08-arbitration.js`: orthogonal lock — HIGH requires majority agreement, MEDIUM partial, UNCERTAIN goes to review

Validation: Data array of similar hex hashes → herd safe. One divergent member in herd → all escalated. Password-like string → class transition friction fires. Template wrapper hiding secret inside → gradient sweep catches it.

---

## Phase 8: Layer 9 — URL Topology Analysis
**Branch**: `feature/phase-8-layer09-url`

Objective: Classify all URL-shaped entities and feed query params back into the string pipeline.

Input: URL candidates from Layer 4 + string pipeline from Phase 6
Output: URL findings: `safe-external | suspicious-external | internal-exposed | sensitive-parameter`

Steps:
1. URL parser — split into scheme, authority, path, query (pure string ops, no URL API)
2. Authority classifier — private IP ranges (RFC 1918), `.local`, `.svc`, `.internal`
3. Feed query parameter values through Layers 6-8
4. Path analyser — admin routes, internal path patterns
5. Add URL findings to the per-file output object

Validation: `http://10.0.1.5/api/admin` → `internal-exposed`. `https://api.example.com?token=abc123` → query value routed through string pipeline. `https://cdn.example.com/logo.png` → `safe-external`.

---

## Phase 9: Layer 10 — Pattern Rule Engine
**Branch**: `feature/phase-9-layer10-patterns`

Objective: Implement all rule categories including new Tier 1-4 categories.

Input: per-file content, surface characterisation, role classification
Output: array of pattern hit objects `{ ruleId, line, lineIndex, severity, category, fix }`

New rule categories beyond v0.0.1:
- **Tier 1 (AI structural)**: `clone-pollution`, `structure-smell`, `async-abuse`, `error-handling`, `type-theater`, `config-exposure`
- **Tier 2 (quality)**: `naming-entropy`, `complexity-spike`, `import-hygiene`, `magic-values`, `interface-bloat`
- **Tier 3 (texture)**: `repetition-texture`, `comment-mismatch`, `test-theater`, `branch-symmetry`
- **Tier 4 (residue)**: `promise-graveyard`, `accessor-bloat`, `scaffold-residue`

Steps:
1. Port all v0.0.1 rules into the new rule shape (unchanged logic)
2. Add Tier 1-4 rules (one fixture per new category)
3. Wire `L10-patterns.js` into the pipeline

Validation: Each new rule fires on its intended fixture. All previous fixtures still pass. `node test/run.js` passes all assertions.

---

## Phase 10: Layer 11 — Cross-File Correlation
**Branch**: `feature/phase-10-layer11-correlation`

Objective: Project-level intelligence by correlating findings across all files.

Input: per-file findings from all previous layers (full registry)
Output: `correlation` object: `{ duplicateSecrets, slopClusters, urlCrossRef, clonePollutionMap }`

Steps:
1. Duplicate secret detection — hash candidate values, find cross-file matches
2. Slop cluster detection — group files with same dominant pattern categories by directory
3. URL cross-reference — map which internal URLs appear in which files
4. Cross-file clone-pollution — structurally near-identical functions across files

Validation: Copy-pasted secrets in 3 files → all 3 flagged as correlated. Directory with 5 AI-scaffolded files → cluster detected. Cross-referenced internal URL appears in correlation map.

---

## Phase 11: Layer 12 — Project-Level Statistical Calibration
**Branch**: `feature/phase-11-layer12-calibration`

Objective: Recalibrate confidence tiers and compression scoring based on the project's own distribution.

Input: full registry with all per-file signals computed
Output: `calibration` object: `{ entropyMAD, compressionBaseline, confidenceMultipliers }`

Steps:
1. Collect all entropy signal values; compute Median Absolute Deviation
2. Collect all self-compression ratios; compute project median and "normal range"
3. Recalibrate NCD texture scores: files in the project-normal range score 0, not 25
4. Bayesian weighting: < 10 files trust global baselines; > 100 files self-calibrate fully
5. Propagate recalibrated confidence tiers back onto all findings

Validation: slopguard self-scan scores < 15 on all three axes. Project with uniformly written code recalibrates so no files appear as outliers.

---

## Phase 12: Layer 13 + Layer 14 — Scoring and Report Assembly
**Branch**: `feature/phase-12-layer1314-scoring-report`

Objective: Produce the three-axis score and the structured report object.

Input: calibrated registry with all findings
Output: `{ axes: { A, B, C }, perFile: [], project: {}, report: {} }`

Steps:
1. `computeAxes(registry)` — Axis A (slop), Axis B (security), Axis C (quality), each 0-100
2. Per-file score with breakdown: which signals contributed to each axis
3. Project-level aggregate weighted by file role and size
4. Assemble report: exposure section, secrets section, slop section, pattern hits, clean files, review bucket, project summary
5. UNCERTAIN findings appear only in `report.review`, never in `report.findings`

Verdict thresholds (per axis): 0 Clean · 1-10 Minimal · 11-25 Some · 26-50 Noticeable · 51-75 Heavy · 76-100 Catastrophic

Validation: Sloppy fixture project → Axis A > 50. Clean project → all three axes < 15. Uncertain finding → in report.review only. Three axes are numerically independent.

---

## Phase 13: Layer 15 — Output Formatting + CLI Wiring
**Branch**: `feature/phase-13-layer15-output`

Objective: Full CLI presentation layer and JSON output.

Input: report object from Layer 14
Output: CLI text with ANSI colours OR valid JSON

Steps:
1. Pretty output: header box showing all three axes, per-file results, hit details (header → flagged line → fix)
2. `--verbose` mode: contributing signals per finding (explains WHY)
3. `--json` mode: valid JSON matching documented result shape
4. Exit code logic: configurable per-axis thresholds (default: exit 1 if Axis A > 50 OR Axis B > 25)
5. Roast messages at high axis scores
6. `--axis=A,B,C` filter and `--threshold=A:N,B:N,C:N` override

Validation: `node bin/slopguard.js . --verbose` shows coloured output with all three axes. `node bin/slopguard.js . --json | python3 -m json.tool` validates JSON. Exit codes respect per-axis thresholds. Uncertain findings rendered in a visually distinct review section.

---

## Phase 14: Self-Audit and v2.0.0 Release
**Branch**: `feature/phase-14-release-v2`

Objective: slopguard must pass its own scan with clean scores on all three axes.

Steps:
1. Run `node bin/slopguard.js . --verbose` on the entire project
2. Fix any legitimate findings
3. Adjust calibration for known rule-description false positives (document each)
4. Confirm Axis A < 15, Axis B < 15, Axis C < 15 on self-scan
5. Bump version to 2.0.0 in `package.json`
6. Tag release: `git tag v2.0.0`

Validation: All three axes < 15 on self-scan. All tests pass. `npm pack --dry-run` is clean.

---

## Post-v2 Backlog
Not started until v2 ships:
- Phase 15: VS Code Extension
- Phase 16: YAML Template Engine (Nuclei-style rule definitions)
- Phase 17: `--fix` flag (auto-apply simple fixes)
- Phase 18: `--watch` flag (re-scan on file changes)
- Phase 19: Web Dashboard (team analytics)
