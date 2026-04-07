# Planner Instructions

## Purpose
This file outlines the planning process for building slopguard from scratch. It ensures adherence to the workflow and strict rules defined in the CLAUDE.md file. Every feature follows a phased, branch-based approach with explicit user approval between phases.

## Planning Guidelines
1. **Understand the Context**: Always refer to CLAUDE.md for project rules, architecture, detection logic, and constraints before starting any work.
2. **Break Down Tasks**: Divide every task into small, manageable phases (3-5 steps max per phase).
3. **Branch Naming**: Use the format `feature/phase-N-short-name` for each phase.
4. **Focus on One Phase**: Implement only the tasks for the current phase. Do not look ahead.
5. **Completion Protocol**: After completing a phase, stop and confirm with the exact message:
   > Phase X complete on branch `feature/phase-N-short-name`.
   > Test it, then reply **'merge and next'** when ready.
6. **Wait for Approval**: Proceed to the next phase only after receiving explicit approval.
7. **Zero Dependencies**: At no point in any phase should an external npm package be added. Every phase must use only Node.js built-ins.
8. **Self-Check After Each Phase**: Run `node test/run.js` and `node bin/slopguard.js . --verbose` before declaring phase complete.

## Task Planning Template
Use the following template to plan each phase:

### Phase X: [Short Description]
- **Objective**: [What this phase achieves]
- **Steps**:
  1. [Step 1]
  2. [Step 2]
  3. [Step 3]
- **Branch Name**: `feature/phase-X-[short-name]`
- **Validation**: [How to verify this phase works]

---

## Master Build Plan

### Phase 1: Project Skeleton and CLI Shell
- **Objective**: Set up the project structure, package.json, bin entry, and a CLI that runs and prints help. No detection logic yet.
- **Steps**:
  1. Create directory structure: `bin/`, `src/`, `test/`, `test/fixtures/`, `corpus/`
  2. Create `package.json` with zero dependencies, bin field pointing to `bin/slopguard.js`
  3. Create `bin/slopguard.js` with shebang, arg parsing (--help, --verbose, --json, --mcp), and placeholder output
  4. Create `src/index.js` as public API entry (empty exports for now)
  5. Add `.gitignore`, `LICENSE` (MIT), scaffold `README.md`
- **Branch Name**: `feature/phase-1-project-skeleton`
- **Validation**: `node bin/slopguard.js --help` prints usage. `npm pack --dry-run` shows correct files.

### Phase 2: File Walker and Context Classifier
- **Objective**: Build the file discovery engine that walks directories, respects ignore patterns, and classifies files as backend/frontend.
- **Steps**:
  1. Create `src/scanner.js` with `walkDir()` function (recursive, skips node_modules/.git/dist/build)
  2. Add context detection: `isBackendFile()` and `isFrontendFile()` based on file path heuristics
  3. Create test fixtures: one backend file, one frontend file, one ambiguous file
  4. Wire walker into CLI: `npx slopguard .` should list discovered files (no scoring yet)
- **Branch Name**: `feature/phase-2-file-walker`
- **Validation**: `node bin/slopguard.js .` lists all JS/TS files in project. Backend/frontend classification works on test fixtures.

### Phase 3: Pattern Rules Engine
- **Objective**: Build the rule system and implement all 16+ pattern detection rules.
- **Steps**:
  1. Create `src/rules.js` with rule array following the strict object shape from CLAUDE.md
  2. Implement rules across all categories: slopsquatting, context-confusion, over-engineering, dead-code, debug-pollution, security, dependency, verbosity
  3. Create sloppy test fixtures that trigger each rule category
  4. Create clean test fixture that triggers zero or minimal rules
  5. Create `test/run.js` test runner that validates rule detection against fixtures
- **Branch Name**: `feature/phase-3-pattern-rules`
- **Validation**: `node test/run.js` passes all assertions. Each rule fires on its intended fixture.

### Phase 4: Shannon Entropy Calculator
- **Objective**: Build the entropy-based secret detection module.
- **Steps**:
  1. Create `src/entropy.js` with Shannon entropy function
  2. Add string literal extractor (finds strings > 16 chars in code lines)
  3. Add charset detection (base64 vs hex vs alphanumeric) with per-charset thresholds
  4. Add entropy findings to scan results (severity 10, category: security)
  5. Add test fixtures: file with real-looking high-entropy secrets, file with low-entropy safe strings
- **Branch Name**: `feature/phase-4-entropy`
- **Validation**: Entropy module correctly flags high-entropy strings. Low-entropy strings (variable names, placeholder text) are NOT flagged. Test runner passes.

### Phase 5: Compression Analysis (NCD Core)
- **Objective**: Build the compression-based detection layer using Node.js zlib.
- **Steps**:
  1. Create `src/compression.js` with self-compression ratio function using `zlib.gzipSync`
  2. Implement NCD formula: `NCD(x,y) = (Z(xy) - min(Z(x),Z(y))) / max(Z(x),Z(y))`
  3. Create initial reference corpora in `corpus/`: small gzipped samples of human-written and AI-generated JS
  4. Add compression score to per-file results
  5. Add test: highly repetitive (AI-like) code scores differently than irregular (human-like) code
- **Branch Name**: `feature/phase-5-compression-ncd`
- **Validation**: Repetitive code produces lower self-compression ratio than irregular code. NCD distance is measurably different against human vs AI corpus. No external dependencies used (only `zlib`).

### Phase 6: Scoring Engine (Weighted Fusion)
- **Objective**: Build the scoring system that combines all 4 detection layers into a single 0-100 score.
- **Steps**:
  1. Create `src/scorer.js` with weighted scoring: compression 40%, patterns 35%, entropy 15%, MCP 10%
  2. Implement per-file scoring and project-level aggregation
  3. Add verdict mapping (score ranges to emoji + text verdicts)
  4. Wire scorer into scanner orchestrator
  5. Update test runner to validate score ranges for sloppy vs clean fixtures
- **Branch Name**: `feature/phase-6-scoring-engine`
- **Validation**: Sloppy fixture scores > 50. Clean fixture scores < 15. Project self-scan scores < 25.

### Phase 7: CLI Pretty Output and JSON Mode
- **Objective**: Build the full CLI presentation layer with colored output, verbose mode, and JSON mode.
- **Steps**:
  1. Implement pretty output with ANSI colors: header box, per-file results, hit details
  2. Implement `--verbose` mode: line-by-line hits with fix suggestions
  3. Implement `--json` mode: valid JSON matching documented result shape
  4. Add roast messages for high scores
  5. Implement exit code logic (0 if score <= 50, 1 if > 50)
- **Branch Name**: `feature/phase-7-cli-output`
- **Validation**: `node bin/slopguard.js . --verbose` shows colored output. `node bin/slopguard.js . --json | python3 -m json.tool` validates JSON. Exit codes work.

### Phase 8: MCP Config Scanner
- **Objective**: Add the optional MCP server configuration audit (--mcp flag).
- **Steps**:
  1. Implement `scanMCPConfig()` in scanner: checks `.vscode/settings.json`, `.vscode/mcp.json`, `.cursor/mcp.json`
  2. Define risky MCP patterns: shell exec commands, hardcoded API keys, insecure HTTP, localhost bindings
  3. Add MCP results to output (both pretty and JSON)
  4. Create test fixture: mock MCP config with risky entries
- **Branch Name**: `feature/phase-8-mcp-scanner`
- **Validation**: `--mcp` flag detects risky patterns in test fixture. Without `--mcp`, MCP scan is skipped.

### Phase 9: README, Docs, and GitHub Action
- **Objective**: Write production-ready documentation and CI configuration.
- **Steps**:
  1. Write full README.md: install, CLI usage, API usage, result shape, rule table, scoring explanation, philosophy
  2. Create `.github/workflows/ci.yml`: test on Node 16/18/20/22, self-check with slopguard
  3. Create GitHub Action usage example in README (for users to add to their own CI)
  4. Final `npm pack --dry-run` check
- **Branch Name**: `feature/phase-9-docs-ci`
- **Validation**: README is complete and accurate. CI workflow syntax is valid. `npm pack --dry-run` shows only intended files.

### Phase 10: Self-Audit and v1.0.0 Release
- **Objective**: Final quality pass. slopguard must pass its own scan with a clean score.
- **Steps**:
  1. Run `node bin/slopguard.js . --verbose --mcp` on the entire project
  2. Fix any legitimate findings in slopguard's own code
  3. Exclude expected false positives (rule description strings matching patterns) via code adjustment or documentation
  4. Bump version to 1.0.0 in package.json
  5. Tag release: `git tag v1.0.0`
- **Branch Name**: `feature/phase-10-release`
- **Validation**: Self-scan score < 15. All tests pass. `npm pack --dry-run` is clean. Ready to `npm publish`.

---

## Post-v1 Phases (Backlog, not started until v1 ships)

### Phase 11: VS Code Extension
### Phase 12: YAML Template Engine (Nuclei-style rule definitions)
### Phase 13: --fix Flag (Auto-apply simple fixes)
### Phase 14: --watch Flag (Re-scan on file changes)
### Phase 15: Web Dashboard (Team analytics, paid tier)

---

## Notes
- Always keep the code minimal, clean, and readable.
- Every phase must leave the project in a runnable, testable state.
- No phase should break existing functionality from previous phases.
- The codebase must pass slopguard's own scan at every phase.
- When in doubt, refer to CLAUDE.md. It is the source of truth.
