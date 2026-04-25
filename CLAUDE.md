# CLAUDE.md

## Project Overview
zone38 is a zero-dependency npm package that detects AI-generated code patterns and security risks in JavaScript/TypeScript codebases. It scores every file and the whole project across three axes: A (Slop), B (Security), C (Quality).

**"Below 0.038, nothing is innocent."**

Two interfaces:
- CLI: `npx zone38 .` or `npx zone38 ./src --mcp --verbose`
- Library: `const { run, renderCli, renderJson, exitCode, DEFAULT_THRESHOLDS } = require('zone38')`

## Tech Stack
- Runtime: Node.js 16+ (CommonJS, `require`/`module.exports`)
- Compression: `zlib` (Node.js built-in, used for NCD and compression ratio analysis)
- File I/O: `fs`, `path` (Node.js built-in)
- Output: Raw ANSI escape codes for CLI colors
- Testing: Custom zero-dep test runner (`node test/run.js`)
- Build step: NONE. Source IS distribution. No transpiler, no bundler.
- Dependencies: ZERO. The `dependencies` field in `package.json` must stay empty. Forever.

## Architecture

```
zone38/
├── bin/
│   └── zone38.js                  # CLI entry: arg parsing + pretty output ONLY
├── src/
│   ├── index.js                   # Public API: re-exports run, renderCli, renderJson, exitCode
│   ├── rules.js                   # Pattern rules: array of plain detection objects
│   └── pipeline/
│       ├── L00-ingestion.js       # File registry + territory classification
│       ├── L01-role.js            # Backend/frontend/test role detection
│       ├── L02-surface.js         # Minification, repetition, routing density
│       ├── L03-compression.js     # NCD + self-compression ratio (zlib)
│       ├── L04-harvest.js         # String/URL candidate extraction
│       ├── L05-preflight.js       # Dedup, style-literal filter, dotted-path filter
│       ├── L06-herd.js            # Herd discrimination (IHD clustering)
│       ├── L07-deep.js            # IC, CTF, entropy gradient per candidate
│       ├── L08-arbitration.js     # Confidence gating: HIGH / MEDIUM / UNCERTAIN / SAFE
│       ├── L09-url.js             # URL topology: internal-exposed, suspicious-external
│       ├── L10-patterns.js        # Apply rules.js to each file line-by-line
│       ├── L11-correlation.js     # Cross-file: duplicate secrets, slop clusters, clone pollution
│       ├── L12-calibration.js     # Project-level Bayesian recalibration
│       ├── L13-scoring.js         # Three-axis scoring (A/B/C, 0–100)
│       ├── L14-report.js          # Report assembly: secrets, exposure, patternHits, review
│       ├── L15-output.js          # CLI rendering + JSON output
│       ├── mcp-scanner.js         # MCP config security scanner (--mcp flag)
│       └── runner.js              # Orchestrator: chains L00–L14, returns report
├── src/string/
│   ├── aggregator.js              # Multi-signal aggregator
│   ├── bigram.js                  # Bigram entropy analysis
│   ├── char-frequency.js          # Character frequency + IC
│   ├── compression.js             # Per-string compression ratio
│   ├── decomposer.js              # Compound string decomposition (KV, JSON, URL params)
│   ├── vector.js                  # Six-dimensional secret scoring vector
│   └── vector-worker.js           # Async batch processor for vector scoring
├── corpus/
│   ├── human.js.gz                # Reference corpus: verified human-written JS
│   └── ai.js.gz                   # Reference corpus: verified AI-generated JS
├── templates/                     # Reserved for future YAML rule templates
├── test/
│   ├── run.js                     # Unit + integration test runner (590 tests)
│   ├── e2e.js                     # End-to-end smoke tests
│   └── fixtures/                  # Sample files: clean, sloppy, secrets, minified, etc.
├── .github/
│   └── workflows/
│       ├── ci.yml                 # GitHub Actions CI (Node 16/18/20/22/24)
│       └── publish.yml            # npm publish on release tag
├── CLAUDE.md                      # This file
├── package.json
├── README.md
└── LICENSE                        # BSL 1.1
```

## Detection Architecture

### Axis A — Slop (AI-pattern density)
- **Compression texture** (L03): self-compression ratio. AI code compresses more due to structural repetitiveness.
- **Pattern rules** (L10): 40+ rules in `src/rules.js` covering verbosity, dead code, scaffold residue, clone pollution, over-engineering.
- **Calibration** (L12): Bayesian downweighting when a pattern appears across the whole project (not an outlier).

### Axis B — Security (secrets + risky API exposure)
- **Candidate harvest** (L04): extracts string literals and URLs from every line.
- **Pre-flight filter** (L05): discards duplicates, style literals, dotted-path i18n keys, structural lines.
- **Herd discrimination** (L06): discards uniform clusters (e.g. a list of identical-entropy hex IDs).
- **Deep analysis** (L07): Index of Coincidence (IC), Class Transition Friction (CTF), Entropy Gradient per candidate.
- **Arbitration** (L08): HIGH (pipeline ≥ 0.65 + 2 signals), MEDIUM (≥ 0.50 + 2 signals), UNCERTAIN (≥ 0.40), SAFE (discarded).
- **URL topology** (L09): classifies URLs as internal-exposed, suspicious-external, or safe-external.
- **MCP scanner** (mcp-scanner.js): optional `--mcp` flag scans `.vscode/mcp.json`, `.cursor/mcp.json`.

### Axis C — Quality (code health)
- Pattern rules from `src/rules.js` in categories: error-handling, async-abuse, debug-pollution, magic-values, naming-entropy.

### Three core math signals (Security axis)
- **Shannon Entropy**: `H = -Σ p_i log₂(p_i)` — character distribution uniformity
- **Index of Coincidence**: `IC = Σ nᵢ(nᵢ−1) / N(N−1)` — zone38 threshold = 0.038
- **Normalized Compression Distance**: `NCD(x,y) = (C(xy) − min(C(x),C(y))) / max(C(x),C(y))` — structural alienness

All three must agree. Single-signal hits are discarded.

## Rule Object Shape (strict)
```js
{
  id: 'kebab-case-id',           // unique, stable, never renamed
  name: 'Human-readable name',
  category: 'verbosity',         // from fixed category list in rules.js
  severity: 7,                   // 1 (nit) to 10 (critical)
  description: 'Why this is a problem.',
  test(line, ctx) {              // pure function, no side effects, no async
    return boolean;              // true = this line fires the rule
  },
  fix: 'Actionable one-liner.',
}
```

### ctx Object Shape
```js
{
  filePath: '/abs/path/to/file.js',
  lineIndex: 42,        // current line, 0-based
  lines: ['line1', ...],
  isBackend: true|false,
  isFrontend: true|false,
}
```

## CLI Behavior
- Entry: `bin/zone38.js` handles ONLY arg parsing and presentation
- All business logic lives in `src/`
- Flags: `--verbose` / `-v`, `--all` / `-a`, `--json` / `-j`, `--mcp` / `-m`, `--open` / `-o`, `--show` / `-s`, `--axis` / `-A`, `--since` / `-S`, `--threshold` / `-t`, `--file` / `-f`, `--explain`, `--help`
- Exit code 0: all axes within thresholds (defaults: A ≤ 50, B ≤ 25, C ≤ 100)
- Exit code 1: any axis exceeds threshold

## Strict Rules

### Never Do
- Add dependencies to `package.json`. Zero means zero.
- Use `import`/`export` syntax. CommonJS only.
- Add TypeScript, Babel, Webpack, Rollup, ESBuild, or any build tool.
- Import `http`, `https`, `fetch`, `net`, `dns`. This tool is offline-only.
- Use `eval()` or `new Function()`. We detect this.
- Use `console.log` for debugging. We detect this.
- Add AST parsing. Detection is regex + compression + entropy. By design.
- Change CLI exit code thresholds without updating docs and tests.

### Always Do
- Keep functions pure where possible. No side effects in detection logic.
- Comments explain WHY, not WHAT.
- Descriptive variable names. No single-letter vars except tight loop iterators.
- Every new rule gets a test fixture in `test/fixtures/`.
- The codebase must pass zone38 itself with a low score. Eat the dog food.

## Workflow Rules (Always Follow)
For any task or feature:
1. Break into small phases (3-5 max)
2. Each phase on its own branch: `feature/phase-N-short-name`
3. Implement ONLY that phase
4. After finishing the phase: stop and say exactly
   "Phase X complete on branch `feature/phase-N-short-name`.
   Test it, then reply **'merge and next'** when ready."
5. Only continue after user says "merge and next"

## Testing
- Run: `node test/run.js` (590 tests, zero dependencies)
- E2E: `node test/e2e.js`
- Fixtures in `test/fixtures/` trigger specific rules
- Self-check: `node bin/zone38.js . --verbose` (score should stay low)
- Check publishable content: `npm pack --dry-run`

## Common Tasks
| Task | Command |
|------|---------|
| Run CLI locally | `node bin/zone38.js . --verbose` |
| Run tests | `node test/run.js` |
| Self-check | `node bin/zone38.js . --json` |
| Dry-run package | `npm pack --dry-run` |

## Philosophy
The irony is the point. This tool detects the exact patterns that AI coding assistants produce. If you're using an AI to contribute to this project, the code must pass zone38's own rules. The detection core is rooted in information theory (compression, entropy, IC) not pattern matching alone. Patterns expire. Math does not.


**"Detects AI slop in your codebase before your tech lead does."**

Two interfaces:
- CLI: `npx slopguard .` or `npx slopguard ./src --mcp --verbose`
- Library: `const { slopguard } = require('slopguard')`

## Tech Stack
- Runtime: Node.js 16+ (CommonJS, `require`/`module.exports`)
- Compression: `zlib` (Node.js built-in, used for NCD and compression ratio analysis)
- File I/O: `fs`, `path` (Node.js built-in)
- Output: Raw ANSI escape codes for CLI colors
- Testing: Custom zero-dep test runner (`node test/run.js`)
- Build step: NONE. Source IS distribution. No transpiler, no bundler.
- Dependencies: ZERO. The `dependencies` field in `package.json` must stay empty. Forever.

## Architecture

```
slopguard/
├── bin/
│   └── slopguard.js              # CLI entry: arg parsing + pretty output ONLY
├── src/
│   ├── index.js                   # Public API: re-exports core modules
│   ├── rules.js                   # Pattern rules: array of plain detection objects
│   ├── scanner.js                 # File walker, context classifier, orchestrator
│   ├── scorer.js                  # Scoring engine: per-file and project-level
│   ├── compression.js             # NCD + compression ratio (zlib-based, the math core)
│   └── entropy.js                 # Shannon entropy calculator for secret detection
├── corpus/
│   ├── human.js.gz                # Reference corpus: verified human-written JS (pre-2022)
│   └── ai.js.gz                   # Reference corpus: verified AI-generated JS
├── templates/                     # YAML rule templates (Nuclei-inspired, future)
├── test/
│   ├── run.js                     # Test runner
│   └── fixtures/                  # Sample sloppy + clean files
├── .github/
│   ├── copilot-instructions.md    # GitHub Copilot agent context
│   └── workflows/
│       └── ci.yml                 # GitHub Actions CI
├── CLAUDE.md                      # This file
├── planner.instructions.md        # Phased development workflow
├── package.json
├── README.md
└── LICENSE                        # MIT
```

## Detection Architecture (4 Layers)

### Layer 1: Compression Analysis (the mathematical core)
- Uses Node.js `zlib.gzipSync` to compress file contents
- **Self-compression ratio**: `compressed_size / raw_size` per file
  - AI code compresses MORE (lower ratio) due to structural repetitiveness
  - Human code resists compression (higher ratio) due to idiosyncratic patterns
- **Normalized Compression Distance (NCD)**: measures similarity between scanned file and reference corpora
  - Formula: `NCD(x,y) = (Z(xy) - min(Z(x), Z(y))) / max(Z(x), Z(y))`
  - Low NCD against AI corpus = file structurally resembles AI code
  - High NCD against human corpus = file is far from human patterns
- This layer is TIME-INDEPENDENT. It detects the statistical texture of autoregressive generation, not specific model outputs.
- Lives in `src/compression.js`

### Layer 2: Shannon Entropy (secret detection)
- Calculates character-level entropy for every string literal > 16 chars
- Formula: `H = -sum(p_i * log2(p_i))` where p_i is frequency of each unique character
- High entropy (> 4.5 for base64, > 3.0 for hex) in a code context = probable real secret
- Catches secrets WITHOUT keyword matching (no "apiKey" label needed)
- Lives in `src/entropy.js`

### Layer 3: Pattern Rules (known signatures)
- Array of plain objects in `src/rules.js`
- Each rule: `{ id, name, category, severity, description, test(line, ctx), fix }`
- Regex/string-based detection of known AI slop patterns
- Categories: `slopsquatting`, `context-confusion`, `over-engineering`, `dead-code`, `debug-pollution`, `security`, `dependency`, `verbosity`
- This layer IS time-dependent (new patterns added as discovered) but fast and high-confidence

### Layer 4: MCP Config Scanner (optional, --mcp flag)
- Scans `.vscode/settings.json`, `.vscode/mcp.json`, `.cursor/mcp.json`
- Detects risky MCP server configurations: shell exec, hardcoded keys, insecure HTTP
- Lives in scanner.js `scanMCPConfig()` function

### Scoring Engine (`src/scorer.js`)
- Each layer contributes a weighted signal:
  - Compression analysis: 40% weight (most reliable, mathematical)
  - Pattern rules: 35% weight (specific, actionable, high confidence per hit)
  - Entropy findings: 15% weight (security-critical but narrow scope)
  - MCP scan: 10% weight (optional, context-specific)
- Per-file formula: weighted combination, normalized to 0-100
- Project formula: aggregate across all files, normalized by total LOC
- Verdicts: 0 = Clean, 1-10 = Minimal, 11-25 = Some slop, 26-50 = Sloppy, 51-75 = Heavy, 76-100 = Catastrophic

## Context Detection Heuristics
- Backend file: path contains `server`, `api`, `route`, `controller`, `middleware`, `handler`, `model`, `db`, `migration`, `worker`, `cron`, `queue`
- Frontend file: path contains `component`, `page`, `view`, `layout`, `hook`, `context`, `store`, `ui`, `widget`, `screen` or ends in `.jsx`/`.tsx`
- Context determines which rules fire (e.g. localStorage rule only fires in backend context)

## Rule Object Shape (strict)
```js
{
  id: 'kebab-case-id',           // unique, stable, never renamed
  name: 'Human-readable name',
  category: 'slopsquatting',      // from fixed category list
  severity: 7,                    // 1 (nit) to 10 (critical)
  description: 'Why this is slop.',
  test(line, ctx) {               // pure function, no side effects, no async
    return boolean;               // true = this line is sloppy
  },
  fix: 'Actionable one-liner.',
}
```

### ctx Object Shape (passed to rule test functions)
```js
{
  filePath: '/abs/path/to/file.js',
  fileName: 'file.js',
  lines: ['line1', 'line2', ...],
  lineIndex: 42,                   // current line, 0-based
  isBackend: true|false,
  isFrontend: true|false,
}
```

### Severity Guide
- 1-3: Style/preference (verbose null check, unnecessary else)
- 4-6: Code quality (empty catch, async no await, debug logs, TODOs)
- 7-8: Potential bugs or supply chain risk (hallucinated imports, eval)
- 9-10: Critical security (hardcoded secrets, shell injection)

## CLI Behavior
- Entry: `bin/slopguard.js` handles ONLY arg parsing and presentation
- All business logic lives in `src/`
- Flags: `--verbose`, `--json`, `--mcp`, `--help`
- Exit code 0: slop score <= 50
- Exit code 1: slop score > 50 (CI gate)
- Colors: raw ANSI escape codes, no external color library
- Roast messages at high scores (tasteful, no profanity)

## Strict Rules

### Never Do
- Add dependencies to `package.json`. Zero means zero.
- Use `import`/`export` syntax. CommonJS only.
- Add TypeScript, Babel, Webpack, Rollup, ESBuild, or any build tool.
- Import `http`, `https`, `fetch`, `net`, `dns`, or `child_process`. This tool is offline-only.
- Use `eval()` or `new Function()`. We detect this.
- Use `console.log` for debugging. We detect this.
- Add AST parsing (no acorn, babel, typescript, esprima, tree-sitter). Detection is regex + compression + entropy. By design.
- Change CLI exit code threshold without updating docs and tests.
- Make network calls. slopguard reads files on disk. That's it.

### Always Do
- Keep functions pure where possible. No side effects in detection logic.
- Comments explain WHY, not WHAT.
- Descriptive variable names. No single-letter vars except tight loop iterators.
- Every new rule gets a test fixture in `test/fixtures/`.
- The codebase must pass slopguard itself with a low score. Eat the dog food.

## Workflow Rules (Always Follow)
For any task or feature:
1. Break into small phases (3-5 max)
2. Each phase on its own branch: `feature/phase-N-short-name`
3. Implement ONLY that phase
4. After finishing the phase: stop and say exactly
   "Phase X complete on branch `feature/phase-N-short-name`.
   Test it, then reply **'merge and next'** when ready."
5. Only continue after user says "merge and next"

## Testing
- Run: `node test/run.js`
- Fixtures in `test/fixtures/` trigger specific rules
- Assert hit counts and rule IDs, not exact line numbers
- Self-check: `node bin/slopguard.js . --verbose` (score should stay low)
- Check publishable content: `npm pack --dry-run`

## Common Tasks
| Task | Command |
|------|---------|
| Run CLI locally | `node bin/slopguard.js . --verbose` |
| Run tests | `node test/run.js` |
| Self-check | `node bin/slopguard.js . --json` |
| Test single fixture | `node -e "const {scanFile}=require('./src/scanner'); console.log(JSON.stringify(scanFile('./test/fixtures/sloppy.js', '.'), null, 2))"` |
| Dry-run package | `npm pack --dry-run` |
| Publish | `npm publish --access public` |

## Philosophy
The irony is the point. This tool detects the exact patterns that AI coding assistants produce. If you're using an AI to contribute to this project, the code must pass slopguard's own rules. The detection core is rooted in information theory (compression, entropy) not pattern matching alone. Patterns expire. Math does not.
