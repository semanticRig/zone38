# CLAUDE.md

## Project Overview
slopguard is a zero-dependency npm package that detects AI-generated code patterns ("AI slop") and hardcoded secrets in JavaScript/TypeScript codebases. It assigns every file and the whole project a Slop Score (0-100) across three independent axes — AI-slop risk, security-exposure risk, and code-quality risk — and provides actionable fix suggestions.

**"Detects AI slop in your codebase before your tech lead does."**

Two interfaces:
- CLI: `npx slopguard .` or `npx slopguard ./src --mcp --verbose`
- Library: `const { slopguard } = require('slopguard')`

---

## Tech Stack
- Runtime: Node.js 16+ (CommonJS, `require`/`module.exports`)
- Compression: `zlib` (Node.js built-in)
- Concurrency: `worker_threads` (Node.js built-in, for vector engine)
- File I/O: `fs`, `path` (Node.js built-in)
- Output: Raw ANSI escape codes for CLI colors
- Testing: Custom zero-dep test runner (`node test/run.js`)
- Build step: NONE. Source IS distribution.
- Dependencies: ZERO. Forever.

---

## Architecture

```
slopguard/
├── bin/
│   └── slopguard.js              # CLI entry: arg parsing + pretty output ONLY
├── src/
│   ├── index.js                  # Public API: re-exports core modules
│   ├── pipeline/
│   │   ├── L00-ingestion.js      # Layer 0: Project file tree walk + registry build
│   │   ├── L01-role.js           # Layer 1: File role classification
│   │   ├── L02-surface.js        # Layer 2: Surface characterisation (minified? repetitive?)
│   │   ├── L03-compression.js    # Layer 3: NCD + self-compression + segmented window analysis
│   │   ├── L04-harvest.js        # Layer 4: Entity harvesting (strings, URLs, key-value pairs)
│   │   ├── L05-preflight.js      # Layer 5: Candidate pre-flight gate + deduplication
│   │   ├── L06-herd.js           # Layer 6: Herd vs Wolf discrimination
│   │   ├── L07-deep.js           # Layer 7: Deep candidate analysis (IoC, bigram, NCD, gradient)
│   │   ├── L08-arbitration.js    # Layer 8: Confidence arbitration (orthogonal lock)
│   │   ├── L09-url.js            # Layer 9: URL topology analysis
│   │   ├── L10-patterns.js       # Layer 10: Pattern rule engine (all rule categories)
│   │   ├── L11-correlation.js    # Layer 11: Cross-file correlation
│   │   ├── L12-calibration.js    # Layer 12: Project-level statistical calibration
│   │   ├── L13-scoring.js        # Layer 13: Scoring aggregation (3 independent axes)
│   │   ├── L14-report.js         # Layer 14: Report assembly
│   │   └── L15-output.js         # Layer 15: Output formatting (CLI, JSON, exit code)
│   ├── string/
│   │   ├── decomposer.js         # Compound string decomposition (5 strategies)
│   │   ├── char-frequency.js     # Character frequency profile + Shannon entropy
│   │   ├── bigram.js             # Bigram entropy ratio signal
│   │   ├── compression.js        # Per-string compression signal
│   │   ├── aggregator.js         # Fast-pipeline aggregator + ambiguity router
│   │   ├── vector.js             # 6-dimensional solution vector engine
│   │   └── vector-worker.js      # worker_threads entry for batch vector scoring
│   └── rules.js                  # Rule objects (all categories, strict shape)
├── corpus/
│   ├── human.js.gz               # Reference corpus: verified human JS (pre-2022)
│   └── ai.js.gz                  # Reference corpus: verified AI-generated JS
├── test/
│   ├── run.js                    # Test runner
│   └── fixtures/                 # Per-rule and per-layer test fixtures
├── .github/
│   └── workflows/
│       └── ci.yml
├── CLAUDE.md                     # This file
├── planner.instructions.md       # Phased build workflow
├── package.json
├── README.md
└── LICENSE
```

---

## The Pipeline: 16 Sequential Layers

Each layer does exactly one thing. Every downstream layer is smarter because of every upstream layer. No layer repeats work from another.

### Layer 0 — Project Ingestion (`L00-ingestion.js`)
Walks the full file tree. Builds a registry object. Every file gets a metadata record:
- Absolute path, relative path, extension, size in bytes
- Depth in project tree
- Territory classification: `vendor` | `dist` | `node_modules` | `test` | `config` | `application`

Nothing is analysed yet. This is pure topology mapping. Output is an array of file metadata records consumed by every downstream layer.

### Layer 1 — File Role Classification (`L01-role.js`)
For every file in the registry:
- Backend vs frontend vs isomorphic
- Config-heavy vs logic-heavy vs declaration-heavy
- Test file vs application file
- TypeScript declaration (`.d.ts`) vs implementation

Role is advisory — it biases but never hard-blocks downstream layers. Encoded as a `role` object on each file record.

### Layer 2 — Surface Characterisation (`L02-surface.js`)
For every file, compute fast global signals before touching any individual string:
- **Routing density ratio**: structural symbol fraction (`{`, `}`, `(`, `)`, `;` / total chars)
- **Average line length** and line length distribution
- **Whitespace ratio**
- **Single-line detection**: if the file is one line > 500 chars, mark as `minified: true`
- **Repetition fingerprint**: fraction of lines that are near-identical (edit distance < 5)

Output: a `surface` profile object on each file record. Every downstream layer reads this before deciding how hard to work.

### Layer 3 — Compression Texture Analysis (`L03-compression.js`)
- Self-compression ratio (gzip self-similarity)
- NCD against human corpus: `NCD(x,y) = (Z(xy) - min(Z(x),Z(y))) / max(Z(x),Z(y))`
- NCD against AI corpus (same formula, different reference)
- Segmented compression: window-by-window analysis to locate repetitive regions, not whole-file blobs
- **Project-relative outlier score**: how far does this file sit from the project's own compression distribution (MAD-normalised)

This is the AI-slop texture signal at the file level. TIME-INDEPENDENT: detects autoregressive statistical texture, not model-specific outputs.

### Layer 4 — Entity Harvesting (`L04-harvest.js`)
The first layer that looks inside the file at individual units:
- Extract all string literals (quoted values only — never raw code lines)
- Apply the **Gravity Welder**: fuse adjacent string concatenations into single candidates
- Extract all URL-shaped entities
- Extract all key-value assignments (structure-based, not name-based)
- Extract all function argument lists

Output: a `candidates` inventory with position metadata (line, column, surrounding identifier name, call-site context) for every item.

### Layer 5 — Candidate Pre-Flight Gate (`L05-preflight.js`)
For every candidate from Layer 4, apply fast discard/downgrade logic:
- **Logic graph?** High routing density → discard (this is code structure, not data)
- **Data blob?** Length > upper bound, no structural periodicity → classify as blob, skip deep analysis
- **Too short?** Length < lower bound AND no class-transition friction → downgrade to low-priority
- **Duplicate?** Rolling hash deduplication against already-seen candidates this scan

What survives is a clean, deduplicated, high-value candidate list.

### Layer 6 — Herd vs Wolf Discrimination (`L06-herd.js`)
For every surviving candidate:
1. Compute Shannon entropy of this candidate
2. Compute local entropy variance against its immediate syntactic neighbours
3. **Herd** (near-zero variance): all neighbours look similar → run Inter-Herd Divergence check
   - Same character-set distribution across all members → safe data array, discard
   - Divergent character sets → vault of secrets, escalate all members
4. **Wolf** (high variance): this candidate is an outlier among neighbours → escalate immediately

### Layer 7 — Deep Candidate Analysis (`L07-deep.js`)
Runs only on escalated candidates from Layer 6. Full multi-signal interrogation via the `src/string/` pipeline:

1. **Decompose** (decomposer.js): break compound strings into isolated values before measuring anything
2. For each decomposed value, run the fast 3-signal pipeline:
   - **Char frequency signal** (char-frequency.js): Euclidean distance from code/secret reference profiles
   - **Bigram entropy ratio** (bigram.js): ratio of bigram entropy to character entropy — structured transitions vs random noise
   - **Compression signal** (compression.js): how well the value resists compression (null if < 20 chars)
3. **Aggregate** (aggregator.js): if all 3 signals agree → decided. If signals disagree or land in the twilight zone (0.4-0.6) → ambiguous, route to vector engine
4. **Vector engine** (vector.js) for ambiguous strings only: 6-dimensional weighted score
   - D1: Shannon entropy (normalised)
   - D2: Kolmogorov approximation via compression
   - D3: Distance from natural English text profile
   - D4: Distance from code/config profile
   - D5: Proximity to known-secret profile (inverted distance)
   - D6: Character type alternation count (type-mix score)
   - Final: weighted sum ≥ 0.50 = secret

Also computes, per candidate:
- **Index of Coincidence**: measures randomness vs structured text
- **Class transition friction**: uppercase/lowercase/digit/symbol alternation patterns (catches passwords)
- **Algorithmic Alienation via NCD**: is this string structurally foreign to its surrounding code?
- **Entropy gradient sweep**: sliding window detects Trojan Horse wrappers hiding payloads inside benign text
- **Uniformity filter**: perfectly flat entropy = public hash or data blob, not a secret

Each signal produces a score. No single signal decides. All scores feed Layer 8.

### Layer 8 — Confidence Arbitration (`L08-arbitration.js`)
The decision layer — the orthogonal lock:
- Take all signals from Layer 7
- Apply the multi-signal agreement rule: a candidate is flagged ONLY when a minimum number of orthogonal signals agree
- Assign a **confidence tier**:
  - `HIGH`: majority of signals agree → flag as secret
  - `MEDIUM`: partial agreement → flag with lower severity
  - `UNCERTAIN`: weak signal → surface separately, never pollute the main score
- Uncertain findings are placed in a `review` bucket, not the `findings` bucket

### Layer 9 — URL Topology Analysis (`L09-url.js`)
Parallel to Layers 5-8 but specialised for URL-shaped entities from Layer 4:
- Split every URL into scheme, authority, path, query components
- **Authority analysis**: private IP space? Internal naming convention? `.local`/`.svc` domain?
- **Query parameter analysis**: feed each parameter value back into Layers 6-8 as a new candidate
- **Path analysis**: does the path expose admin surfaces or internal routes?
- Classify each URL: `safe-external` | `suspicious-external` | `internal-exposed` | `sensitive-parameter`

### Layer 10 — Pattern Rule Analysis (`L10-patterns.js`)
All rule categories. Each rule fires independently and is one signal among many — not the primary signal.

**Current categories (inherited from v1):**
`slopsquatting`, `context-confusion`, `over-engineering`, `dead-code`, `debug-pollution`, `security`, `dependency`, `verbosity`

**New Tier 1 (AI structural patterns):**
`clone-pollution`, `structure-smell`, `async-abuse`, `error-handling`, `type-theater`, `config-exposure`

**New Tier 2 (quality signals):**
`naming-entropy`, `complexity-spike`, `import-hygiene`, `magic-values`, `interface-bloat`

**New Tier 3 (texture signals):**
`repetition-texture`, `comment-mismatch`, `test-theater`, `branch-symmetry`

**New Tier 4 (residue signals):**
`promise-graveyard`, `accessor-bloat`, `scaffold-residue`

Rule object shape — strict, unchanged from v1:
```js
{
  id: 'kebab-case-id',
  name: 'Human-readable name',
  category: 'slopsquatting',
  severity: 7,                    // 1 (nit) to 10 (critical)
  description: 'Why this is slop.',
  test(line, ctx) { return boolean; },
  fix: 'Actionable one-liner.',
}
```

### Layer 11 — Cross-File Correlation (`L11-correlation.js`)
Project-level intelligence. Never existed in v1.
- Same secret candidates appearing in multiple files → copy-paste secret propagation
- Same slop patterns concentrated in specific directories → AI session fingerprint
- Internal URLs from Layer 9 referenced across multiple files → exposure surface map
- Clone-pollution patterns across file boundaries

### Layer 12 — Project-Level Statistical Calibration (`L12-calibration.js`)
- Compute project-wide distributions of every signal computed above
- Recalibrate confidence tiers based on what is "normal" for this specific project
- **Bayesian confidence weighting**: small projects trust global baselines; large projects earn the right to self-calibrate
- Compute Median Absolute Deviation baseline for entropy signals across the whole project
- NCD compression texture scoring uses calibrated per-project ratio → normal range for this project scores 0, not 25

### Layer 13 — Scoring Aggregation (`L13-scoring.js`)
Three independent output axes. Never blended into a single number:
- **Axis A — AI Slop Risk** (0-100): compression texture + pattern hits + cross-file repetition
- **Axis B — Security Exposure Risk** (0-100): secret candidates (confidence-weighted) + URL topology
- **Axis C — Code Quality Risk** (0-100): pattern rule severity distribution + complexity signals

Per-file score with full breakdown. Project-level aggregate weighted by file role and size.

Verdict thresholds per axis:
- 0: Clean
- 1-10: Minimal
- 11-25: Some issues
- 26-50: Noticeable
- 51-75: Heavy
- 76-100: Catastrophic

### Layer 14 — Report Assembly (`L14-report.js`)
Structured report object (consumed by Layer 15 for rendering):
- **Exposure section**: all URL findings, grouped by `internal-exposed` → `suspicious-external` → `safe-external`
- **Secret candidates section**: deduplicated, confidence-tiered, with contributing signal explanation
- **Slop breakdown**: per-file Axis A scores, dominant categories, project-level texture verdict
- **Pattern hits**: organised by category, then by file
- **Clean files**: explicitly acknowledged
- **Project summary**: which axis is the biggest problem today
- **Review bucket**: uncertain findings that need a human eye

### Layer 15 — Output Formatting (`L15-output.js`)
- Human-readable CLI output: header box, per-file results, hit details (three-line format: header → flagged line → fix)
- `--json` mode: valid JSON matching the documented result shape
- `--verbose` mode: contributing signals per finding (explains WHY something was flagged)
- Exit code logic: configurable per-axis thresholds (default: exit 1 if Axis A > 50 OR Axis B > 25)
- Roast messages at high scores

---

## ctx Object Shape (passed to rule test functions)
```js
{
  filePath: '/abs/path/to/file.js',
  fileName: 'file.js',
  lines: ['line1', 'line2', ...],
  lineIndex: 42,
  isBackend: true|false,
  isFrontend: true|false,
  role: { territory, type, isTest, isDeclaration },
  surface: { minified, routingDensity, avgLineLength, repetitionFraction },
}
```

---

## CLI Flags
- `--verbose`: Show contributing signals per finding
- `--json`: Output valid JSON
- `--mcp`: Enable MCP config scanner
- `--help`: Print usage
- `--axis=A,B,C`: Limit output to specific axes
- `--threshold=A:N,B:N,C:N`: Override exit code thresholds per axis

---

## Strict Rules

### Never Do
- Add dependencies to `package.json`. Zero means zero.
- Use `import`/`export` syntax. CommonJS only.
- Add TypeScript, Babel, Webpack, Rollup, ESBuild, or any build tool.
- Import `http`, `https`, `fetch`, `net`, `dns`, or `child_process`. Offline only.
- Use `eval()` or `new Function()`. We detect this.
- Use `console.log` for debugging. We detect this.
- Add AST parsing (no acorn, babel, esprima, tree-sitter). Detection is regex + math + string pipeline. By design.
- Change exit code thresholds without updating docs and tests.
- Make network calls of any kind. slopguard reads files on disk. That is it.
- Let any single signal decide. Signals vote. The arbitration layer decides.
- Repeat work from a prior layer. Each layer builds on the prior layer's output.
- Run the vector engine on decided strings. It runs only on `ambiguous: true` strings.
- Run compression on strings ≤ 20 chars. Return null.
- Skip the decomposer for any string. It always runs.
- Change the vector threshold (0.50) without labeled data and a documented justification.

### Always Do
- Keep functions pure where possible. No side effects in detection logic.
- Comments explain WHY, not WHAT.
- Descriptive variable names. No single-letter vars except tight loop iterators.
- Every new rule gets a test fixture in `test/fixtures/`.
- Every new layer gets integration tests in `test/`.
- The codebase must pass slopguard itself with a low score on all three axes.
- Uncertain findings go in the `review` bucket, never `findings`.

---

## Workflow Rules (Always Follow)
For any task or feature:
1. Break into small phases (3-5 steps max per phase)
2. Each phase on its own branch: `feature/phase-N-short-name`
3. Implement ONLY that phase
4. After finishing: stop and say exactly:
   > Phase X complete on branch `feature/phase-N-short-name`.
   > Test it, then reply **'merge and next'** when ready.
5. Only continue after user says "merge and next"

---

## Testing
- Run: `node test/run.js`
- Fixtures in `test/fixtures/` — one per rule category and one per pipeline layer
- Assert findings counts and signal values, not exact line numbers
- Self-check: `node bin/slopguard.js . --verbose` (all three axes should stay low)
- Vector engine: all 147+ existing string tests must still pass after any string pipeline change

---

## Common Tasks
| Task | Command |
|------|---------|
| Run CLI locally | `node bin/slopguard.js . --verbose` |
| Run tests | `node test/run.js` |
| Self-check (all axes) | `node bin/slopguard.js . --json` |
| Test single fixture | `node -e "const {scanFile}=require('./src/pipeline/L00-ingestion'); ..."` |
| Dry-run package | `npm pack --dry-run` |
| Publish | `npm publish --access public` |

---

## Philosophy
The irony is the point. This tool detects the exact patterns that AI coding assistants produce. The detection core is rooted in information theory — compression, entropy, NCD, statistical calibration. Patterns expire. Math does not. The pipeline is deep and sequential because the problem demands it, not because of architecture astronautics. Every layer earns its place by providing a signal that no other layer already provides.
