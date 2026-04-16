# planner.instructions.md

## Purpose
This file governs the phased build of the slopguard v2 deep sequential pipeline. It ensures adherence to the workflow and strict rules in CLAUDE.md. Every layer is built in its own phase, on its own branch, with explicit user approval before proceeding.

## Planning Guidelines
1. **Source of truth**: Always read CLAUDE.md before starting any phase.
2. **Sequential pipeline**: Layers are numbered 0-15. Build them in order. A downstream layer MUST NOT be started until the upstream layers it consumes are merged and passing.
3. **Branch naming**: `feature/phase-N-layer-N-short-name`
4. **One phase = one layer** (or one tightly coupled group of layers where the interface between them is internal).
5. **Completion protocol**: After every phase, stop and say exactly:
   > Phase X complete on branch `feature/phase-N-layer-N-short-name`.
   > Test it, then reply **'merge and next'** when ready.
6. **Wait for approval**: Never start the next phase without explicit "merge and next".
7. **Zero dependencies**: Node.js built-ins only. Forever.
8. **Self-check after every phase**: Run `node test/run.js` AND `node bin/slopguard.js . --verbose`.

---

## Task Planning Template

### Phase X: [Short Description]
- **Objective**: [What this phase achieves]
- **Layer(s)**: [L00, L01, ...]
- **Input**: [What data structure this layer receives]
- **Output**: [What data structure this layer produces]
- **Steps**:
  1. [Step 1]
  2. [Step 2]
  3. [Step 3]
- **Branch Name**: `feature/phase-X-layer-N-short-name`
- **Validation**: [Exact test commands and expected outputs]

---

## Master Build Plan

### Phase 1: Project Skeleton
- **Objective**: Directory structure, package.json, CLI shell, empty module stubs.
- **Layer(s)**: scaffold only
- **Steps**:
  1. Create `bin/`, `src/pipeline/`, `src/string/`, `test/`, `test/fixtures/`, `corpus/`
  2. Create `package.json` with zero dependencies, bin field pointing to `bin/slopguard.js`
  3. Create `bin/slopguard.js` with shebang, arg parsing (`--help`, `--verbose`, `--json`, `--mcp`, `--axis`, `--threshold`), placeholder output
  4. Create empty stub files for every module listed in CLAUDE.md architecture section
  5. Add `.gitignore`, `LICENSE` (MIT), scaffold `README.md`
- **Branch Name**: `feature/phase-1-skeleton`
- **Validation**: `node bin/slopguard.js --help` prints usage. `npm pack --dry-run` shows correct files. All stubs require without throwing.

---

### Phase 2: Layer 0 + Layer 1 — Ingestion and Role Classification
- **Objective**: Walk the file tree and classify every file by role and territory.
- **Layer(s)**: L00-ingestion.js, L01-role.js
- **Input**: target directory path (from CLI)
- **Output**: array of file metadata records, each with `{ path, relativePath, ext, size, depth, territory, role }`
- **Steps**:
  1. Implement `walkProject(rootDir)` in L00 — recursive, skips `node_modules`, `.git`, `dist`, `build`; tags territory per file
  2. Implement `classifyRole(fileRecord)` in L01 — backend/frontend/isomorphic, config/logic/declaration, test/application, `.d.ts` flag
  3. Wire both into a `buildRegistry(rootDir)` export consumed by the orchestrator
  4. Create test fixtures: one file per territory type, one per role type
- **Branch Name**: `feature/phase-2-layer01-ingestion-role`
- **Validation**: `buildRegistry('.')` returns correct territory and role for each fixture file. No files from excluded directories appear.

---

### Phase 3: Layer 2 — Surface Characterisation
- **Objective**: Compute fast global signals for every file before string-level work begins.
- **Layer(s)**: L02-surface.js
- **Input**: file metadata record + raw file content
- **Output**: `surface` object added to each record: `{ minified, routingDensity, avgLineLength, lineDistribution, whitespaceRatio, repetitionFraction }`
- **Steps**:
  1. Implement `characteriseFile(content)` — computes all 5 surface signals
  2. Single-line detection: file is one line AND length > 500 → `minified: true`
  3. Repetition fingerprint: bucket lines by first 20 chars; fraction of lines sharing a bucket ≥ 3 members
  4. Wire surface characterisation into the registry pipeline
  5. Create fixtures: minified bundle, repetitive AI scaffold, normal human JS
- **Branch Name**: `feature/phase-3-layer02-surface`
- **Validation**: Minified fixture → `minified: true`. Repetitive fixture → `repetitionFraction > 0.4`. Normal fixture → both flags false.

---

### Phase 4: Layer 3 — Compression Texture Analysis
- **Objective**: Measure AI-slop texture at file level via NCD and segmented compression.
- **Layer(s)**: L03-compression.js
- **Input**: surface-characterised file record + raw content
- **Output**: `compression` object: `{ selfRatio, ncdHuman, ncdAI, segmentScores, projectOutlierScore }`
- **Steps**:
  1. Implement `selfCompressionRatio(content)` — `gzip(content).length / content.length`
  2. Implement `ncd(x, y)` using `zlib.gzipSync` — formula from CLAUDE.md
  3. Load `corpus/human.js.gz` and `corpus/ai.js.gz` as reference buffers
  4. Implement `segmentedCompression(content, windowSize)` — slide a window, compute self-ratio per window
  5. Project-outlier score is computed at Layer 12 (calibration); placeholder field here
  6. NCD compression texture → normal JavaScript (self-ratio ≥ 0.35) scores 0; self-ratio < 0.20 scores 50-100
- **Branch Name**: `feature/phase-4-layer03-compression`
- **Validation**: Repetitive AI fixture → lower self-ratio than human fixture. NCD against AI corpus lower for AI fixture. Segmented scores localise the repetitive region.

---

### Phase 5: Layer 4 + Layer 5 — Entity Harvesting and Pre-Flight Gate
- **Objective**: Extract all candidate payloads from file content; discard logic, blobs, and duplicates.
- **Layer(s)**: L04-harvest.js, L05-preflight.js
- **Input**: surface-characterised file record + raw content
- **Output**: clean `candidates` array, each with `{ value, line, col, identifierName, callSiteContext, priority }`
- **Steps**:
  1. Implement string literal extractor — regex for single/double/template quoted strings, excluding one-char and empty strings
  2. Implement Gravity Welder — fuse consecutive string literals on the same or adjacent lines connected by `+` or `,`
  3. Implement URL extractor — matches `scheme://authority/path?query` patterns; excludes pure comment lines
  4. Implement key-value extractor — `identifier = "string"` and `{ key: "string" }` structural patterns
  5. Implement pre-flight gate: logic-graph discard (routing density > 0.35 on that line), blob classification, length bounds, rolling hash deduplication
- **Branch Name**: `feature/phase-5-layer0405-harvest-preflight`
- **Validation**: Minified file → zero candidates surviving pre-flight (all discarded as logic graphs). Structured config string decomposes correctly. Rolling hash deduplicates repeated identical values.

---

### Phase 6: String Analysis Pipeline (Layers 6 & 7 foundation)
- **Objective**: Build the full `src/string/` pipeline — decomposer through vector engine.
- **Layer(s)**: L06-herd.js consumes these; build `src/string/` first
- **Input**: a single candidate string value
- **Output**: `{ score: 0-100, decided: boolean, ambiguous: boolean, signals: {} }`
- **Steps**:
  1. Build `decomposer.js` — 5 strategies in priority order; returns `{ values, decomposed }`
  2. Build `char-frequency.js` — char buckets, Euclidean distance from code/secret profiles, Shannon entropy
  3. Build `bigram.js` — bigram entropy ratio signal
  4. Build `compression.js` — per-string compression signal (null if ≤ 20 chars)
  5. Build `aggregator.js` — 3-signal agreement/disagreement logic, ambiguity router
  6. Build `vector.js` — 6-dimensional weighted score, threshold 0.50
  7. Build `vector-worker.js` — worker_threads entry, processes batch of strings, posts results back
- **Branch Name**: `feature/phase-6-string-pipeline`
- **Validation**: mxGraph style string → decided safe. Real API key → decided secret. Compound string with embedded secret → secret value isolated and flagged, other values safe. Base64 non-secret → routes to vector, scores < 0.50. All 147 previous string tests pass.

---

### Phase 7: Layer 6 + Layer 7 + Layer 8 — Herd, Deep Analysis, Arbitration
- **Objective**: Wire the string pipeline into the per-file candidate analysis flow.
- **Layer(s)**: L06-herd.js, L07-deep.js, L08-arbitration.js
- **Input**: pre-flight-passed candidates array
- **Output**: `findings` array (HIGH/MEDIUM) + `review` array (UNCERTAIN)
- **Steps**:
  1. Implement `herdDiscrimination(candidates)` — entropy variance check, Inter-Herd Divergence test
  2. Implement `deepAnalysis(escalatedCandidates)` — calls string pipeline per value; collects ambiguous batch for worker
  3. Implement `workerDispatch(batch)` — sends to vector-worker, awaits results, merges back
  4. Implement `arbitration(signals)` — orthogonal lock: HIGH requires majority agreement, MEDIUM requires partial, UNCERTAIN goes to review
  5. Add Index of Coincidence, class transition friction, entropy gradient sweep, uniformity filter to deep analysis
- **Branch Name**: `feature/phase-7-layer0608-herd-deep-arbitration`
- **Validation**: Data array of similar hex hashes → herd safe. One divergent member in herd → all escalated. Password-like string with mixed case/digit/symbol → class transition friction fires. Template wrapper hiding secret inside → gradient sweep catches it.

---

### Phase 8: Layer 9 — URL Topology Analysis
- **Objective**: Classify all URL-shaped entities and feed query params back into the string pipeline.
- **Layer(s)**: L09-url.js
- **Input**: URL candidates from Layer 4 + string pipeline from Phase 6
- **Output**: URL findings classified as `safe-external` | `suspicious-external` | `internal-exposed` | `sensitive-parameter`
- **Steps**:
  1. Implement URL parser — split into scheme, authority, path, query without using URL API (offline, pure string ops)
  2. Implement authority classifier — private IP ranges (RFC 1918), `.local`, `.svc`, `.internal` naming
  3. Feed query parameter values through the string analysis pipeline (Layers 6-8)
  4. Implement path analyser — admin routes, internal path patterns
  5. Add URL findings to the per-file output object
- **Branch Name**: `feature/phase-8-layer09-url`
- **Validation**: `http://10.0.1.5/api/admin` → `internal-exposed`. `https://api.example.com?token=abc123` → query value `abc123` routed through string pipeline. `https://cdn.example.com/logo.png` → `safe-external`.

---

### Phase 9: Layer 10 — Pattern Rule Engine
- **Objective**: Implement all rule categories including new Tier 1-4 categories.
- **Layer(s)**: L10-patterns.js, rules.js
- **Input**: per-file content, surface characterisation, role classification
- **Output**: array of pattern hit objects with `{ ruleId, line, lineIndex, severity, category, fix }`
- **Steps**:
  1. Port all existing v1 rules from `rules.js` into the new rule shape (unchanged logic)
  2. Add Tier 1 rules: `clone-pollution`, `structure-smell`, `async-abuse`, `error-handling`, `type-theater`, `config-exposure`
  3. Add Tier 2 rules: `naming-entropy`, `complexity-spike`, `import-hygiene`, `magic-values`, `interface-bloat`
  4. Add Tier 3 rules: `repetition-texture`, `comment-mismatch`, `test-theater`, `branch-symmetry`
  5. Add Tier 4 rules: `promise-graveyard`, `accessor-bloat`, `scaffold-residue`
  6. Create test fixtures for each new rule category
- **Branch Name**: `feature/phase-9-layer10-patterns`
- **Validation**: Each new rule fires on its intended fixture. All previous rule fixtures still pass. `node test/run.js` passes all assertions.

---

### Phase 10: Layer 11 — Cross-File Correlation
- **Objective**: Build project-level intelligence by correlating findings across all files.
- **Layer(s)**: L11-correlation.js
- **Input**: per-file findings from all previous layers (full registry)
- **Output**: `correlation` object: `{ duplicateSecrets, slopClusters, urlCrossRef, clonePollutionMap }`
- **Steps**:
  1. Implement duplicate secret detection — hash candidate values, find cross-file matches
  2. Implement slop cluster detection — group files with same dominant pattern categories by directory
  3. Implement URL cross-reference — map which internal URLs appear in which files
  4. Implement cross-file clone-pollution — detect structurally near-identical functions across files (Gravity Welder applied at file level)
- **Branch Name**: `feature/phase-10-layer11-correlation`
- **Validation**: Project with copy-pasted secrets in 3 files → all 3 flagged as correlated. Directory with 5 AI-scaffolded files → cluster detected. Cross-referenced internal URL appears in correlation map.

---

### Phase 11: Layer 12 — Project-Level Statistical Calibration
- **Objective**: Recalibrate confidence tiers and compression scoring based on the project's own distribution.
- **Layer(s)**: L12-calibration.js
- **Input**: full registry with all per-file signals computed
- **Output**: `calibration` object: `{ entropyMAD, compressionBaseline, confidenceMultipliers }`; also mutates confidence tiers on all findings
- **Steps**:
  1. Collect all entropy signal values across the project; compute Median Absolute Deviation
  2. Collect all self-compression ratios; compute project median and set "normal range" for this project
  3. Recalibrate NCD texture scores: files within the project-normal range score 0 on AI texture, not 25
  4. Apply Bayesian weighting: projects < 10 files trust global baselines more; projects > 100 files self-calibrate fully
  5. Propagate recalibrated confidence tiers back onto all findings
- **Branch Name**: `feature/phase-11-layer12-calibration`
- **Validation**: slopguard self-scan scores < 15 on all three axes. Project with uniformly written code recalibrates correctly so no files appear as outliers.

---

### Phase 12: Layer 13 + Layer 14 — Scoring and Report Assembly
- **Objective**: Produce the three-axis score and the structured report object.
- **Layer(s)**: L13-scoring.js, L14-report.js
- **Input**: calibrated registry with all findings
- **Output**: `{ axes: { A, B, C }, perFile: [], project: {}, report: {} }`
- **Steps**:
  1. Implement `computeAxes(registry)` — Axis A (slop), Axis B (security), Axis C (quality) each 0-100
  2. Implement per-file score with breakdown: which signals contributed to each axis
  3. Implement project-level aggregate weighted by file role and size
  4. Assemble report object: exposure section, secrets section, slop section, pattern hits, clean files, review bucket, project summary
  5. Ensure UNCERTAIN findings appear only in `report.review`, never in `report.findings`
- **Branch Name**: `feature/phase-12-layer1314-scoring-report`
- **Validation**: Sloppy fixture project → Axis A > 50. Clean project → all three axes < 15. Uncertain finding from Layer 8 → appears in report.review, not report.findings. Three axes are numerically independent.

---

### Phase 13: Layer 15 — Output Formatting + CLI Wiring
- **Objective**: Full CLI presentation layer and JSON output.
- **Layer(s)**: L15-output.js, bin/slopguard.js
- **Input**: report object from Layer 14
- **Output**: CLI text with ANSI colors OR valid JSON
- **Steps**:
  1. Implement pretty output: header box showing all three axes, per-file results, hit details in three-line format (header → flagged line → fix suggestion)
  2. Implement `--verbose` mode: contributing signals per finding (explains WHY)
  3. Implement `--json` mode: valid JSON matching the documented result shape
  4. Implement exit code logic: configurable per-axis thresholds (default: exit 1 if Axis A > 50 OR Axis B > 25)
  5. Add roast messages at high axis scores
  6. Implement `--axis=A,B,C` filter and `--threshold=A:N,B:N,C:N` override
- **Branch Name**: `feature/phase-13-layer15-output`
- **Validation**: `node bin/slopguard.js . --verbose` shows coloured output with all three axes. `node bin/slopguard.js . --json | python3 -m json.tool` validates JSON. Exit codes respect per-axis thresholds. Uncertain findings rendered in a visually distinct review section.

---

### Phase 14: Self-Audit and v2.0.0 Release
- **Objective**: slopguard must pass its own scan with clean scores on all three axes.
- **Steps**:
  1. Run `node bin/slopguard.js . --verbose` on the entire slopguard project
  2. Fix any legitimate findings
  3. Adjust calibration for known rule-description FPs (document each adjustment)
  4. Confirm Axis A < 15, Axis B < 15, Axis C < 15 on self-scan
  5. Bump version to 2.0.0 in package.json
  6. Tag release: `git tag v2.0.0`
- **Branch Name**: `feature/phase-14-release-v2`
- **Validation**: All three axes < 15 on self-scan. All tests pass. `npm pack --dry-run` is clean.

---

## Post-v2 Backlog (not started until v2 ships)

### Phase 15: VS Code Extension
### Phase 16: YAML Template Engine (Nuclei-style rule definitions)
### Phase 17: --fix Flag (Auto-apply simple fixes)
### Phase 18: --watch Flag (Re-scan on file changes)
### Phase 19: Web Dashboard (Team analytics)

---

## Notes
- Always keep code minimal, clean, and readable.
- Every phase must leave the project in a runnable, testable state.
- No phase should break functionality from previous phases.
- When in doubt, CLAUDE.md is the source of truth.
- The vector threshold is 0.50. Do not change it without labeled data and a written justification committed alongside the change.
- The self-scan score is the canary. If it rises above 15 on any axis, something in the pipeline is miscalibrated, not broken. Fix the calibration, not the test.
