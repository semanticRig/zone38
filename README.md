# slopguard

> Detects AI slop in your codebase before your tech lead does.

Zero dependencies. Offline-only. Information theory meets pattern matching.

```bash
npx slopguard .
```

## What It Does

slopguard scans JavaScript/TypeScript codebases for patterns commonly produced by AI coding assistants — hallucinated imports, hardcoded secrets, debug leftovers, over-engineering, context confusion, and more.

It scores every project on **three independent axes**:

| Axis | What it measures | Default threshold |
|------|-----------------|-------------------|
| **A — AI Slop** | Compression anomalies + slop patterns | 50 |
| **B — Security** | Hardcoded secrets, exposed URLs, risky configs | 25 |
| **C — Quality** | Error handling, async abuse, code structure | 100 (advisory) |

Each axis is scored 0–100. The CLI exits with code 1 if any axis exceeds its threshold.

### Detection Architecture

The v2 pipeline runs **16 layers** (L00–L15) per scan:

| Layers | Purpose |
|--------|---------|
| L00–L01 | File ingestion and role classification (backend/frontend/vendor/test) |
| L02–L03 | Surface characterisation and compression texture analysis |
| L04–L05 | Entity harvesting (string literals, URLs) and pre-flight gating |
| L06–L08 | Herd discrimination, deep analysis (IC, CTF, entropy gradient), confidence arbitration |
| L09–L10 | URL topology analysis and pattern rule engine (39 rules, 25 categories) |
| L11–L12 | Cross-file correlation and project-level Bayesian calibration |
| L13–L14 | Three-axis scoring and report assembly |
| L15 | Output formatting (CLI/JSON) |

## Install

```bash
npm install -g slopguard
```

Or run directly:

```bash
npx slopguard ./src
```

## CLI Usage

```
slopguard <path> [options]

Options:
  --help              Show help message
  --verbose           Per-file detail for files above threshold
  --all               Per-file detail for all files
  --file=NAME         Per-file detail for one specific file
  --json              Output results as JSON
  --mcp               Scan MCP server configurations for risky patterns
  --axis=A,B,C        Limit output to specific scoring axes
  --threshold=A:N     Override exit-code threshold per axis
```

### Examples

```bash
# Scan current directory
slopguard .

# Scan src/ with detailed output
slopguard ./src --verbose

# Only show security axis
slopguard . --axis=B

# Strict CI gate: fail if A > 30 or B > 15
slopguard . --threshold=A:30,B:15

# JSON output for tooling
slopguard . --json
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All axes within thresholds (default: A ≤ 50, B ≤ 25, C ≤ 100) |
| `1` | At least one axis exceeds its threshold |

## Library Usage

```js
const { run, renderJson, renderCli, exitCode, DEFAULT_THRESHOLDS } = require('slopguard');

// Scan a directory
const result = run('./src');
const report = result.report;

// JSON output
console.log(renderJson(report));

// CLI-formatted output
console.log(renderCli(report, {
  verbose: true,
  targetPath: '/abs/path/to/src',
  thresholds: DEFAULT_THRESHOLDS,
}));

// Check exit code
const axes = report.projectSummary.axes;
process.exit(exitCode(axes));               // uses default thresholds
process.exit(exitCode(axes, { A: 30 }));    // custom threshold for Axis A
```

### Result Shape

```js
// run() returns:
{
  report: {
    projectSummary: {
      fileCount: 40,
      totalLines: 6263,
      axes: { A: 8.4, B: 12.9, C: 5.6 },
      verdicts: { A: 'Minimal', B: 'Some issues', C: 'Minimal' },
      correlation: { duplicateSecrets: [], slopClusters: [], urlCrossRef: [], clonePollutionMap: [] },
    },
    perFile: [{ path: 'src/app.js', axes: { A: 10, B: 5, C: 3 }, breakdown: {}, lineCount: 100, roleWeight: 1.0 }],
    secrets: [{ value: 'sk-p****xy', file: 'src/api.js', line: 5, confidence: 'HIGH', signals: 3 }],
    exposure: [{ url: 'http://10.0.0.1/admin', classification: 'internal-exposed', file: 'src/api.js', line: 10 }],
    patternHits: [{ ruleId: 'empty-catch', ruleName: 'Empty catch', category: 'error-handling', severity: 8, file: 'src/app.js', line: 3, fix: 'Handle the error' }],
    slopBreakdown: [{ category: 'error-handling', hitCount: 1, fileCount: 1, topSeverity: 8 }],
    review: [{ value: 'mayb****et', file: 'src/app.js', line: 20, pipelineScore: 0.35, signals: 1 }],
    cleanFiles: [{ file: 'src/clean.js', axes: { A: 0, B: 0, C: 0 } }],
  },
  registry: [],      // internal per-file data
  calibration: {},   // project-level calibration stats
  correlation: {},   // cross-file correlation data
  scoring: {},       // raw scoring output
}
```

## Detection Rules

39 rules across 25 categories:

| ID | Category | Sev | Name |
|----|----------|-----|------|
| `hallucinated-import-require` | slopsquatting | 8 | Possibly hallucinated require |
| `import-hallucinated-module` | slopsquatting | 8 | Possibly hallucinated import |
| `localstorage-in-backend` | context-confusion | 7 | localStorage in backend code |
| `document-in-backend` | context-confusion | 7 | document object in backend code |
| `window-in-backend` | context-confusion | 7 | window object in backend code |
| `process-env-in-frontend` | context-confusion | 5 | Raw process.env in frontend code |
| `unnecessary-abstraction-factory` | over-engineering | 4 | Factory pattern for trivial operation |
| `excessive-ternary-nesting` | over-engineering | 5 | Deeply nested ternary |
| `verbose-null-check` | verbosity | 2 | Verbose null/undefined check |
| `async-without-await` | verbosity | 3 | async function without await |
| `unnecessary-else-after-return` | verbosity | 2 | Unnecessary else after return |
| `redundant-boolean-literal` | verbosity | 2 | Redundant boolean comparison |
| `commented-out-code` | dead-code | 3 | Commented-out code block |
| `todo-fixme-comment` | dead-code | 4 | TODO/FIXME left in code |
| `empty-catch-block` | dead-code | 6 | Empty catch block |
| `console-log-leftover` | debug-pollution | 4 | console.log left in code |
| `debugger-statement` | debug-pollution | 6 | debugger statement left in code |
| `alert-statement` | debug-pollution | 5 | alert() left in code |
| `eval-usage` | security | 9 | eval() or new Function() usage |
| `hardcoded-secret` | security | 10 | Hardcoded secret or API key |
| `innerhtml-usage` | security | 7 | innerHTML assignment |
| `wildcard-dependency-version` | dependency | 6 | Wildcard dependency version |
| `type-theater` | type-theater | 5 | TypeScript any type / ts-ignore |
| `config-exposure` | config-exposure | 6 | Hardcoded fallback in secret env access |
| `error-silencing` | error-handling | 6 | Error swallowed without recovery |
| `async-abuse` | async-abuse | 6 | async callback inside forEach |
| `structure-smell` | structure-smell | 4 | Deeply nested code block |
| `clone-pollution` | clone-pollution | 4 | Near-duplicate function name variants |
| `naming-entropy` | naming-entropy | 2 | Single-letter variable name |
| `magic-values` | magic-values | 3 | Magic number in logic |
| `import-hygiene` | import-hygiene | 3 | Wildcard namespace import |
| `interface-bloat` | interface-bloat | 3 | Oversized interface or type literal |
| `complexity-spike` | complexity-spike | 4 | High conditional branch density |
| `test-theater` | test-theater | 5 | Trivially-passing test assertion |
| `comment-mismatch` | comment-mismatch | 3 | Stub comment inside implemented function |
| `scaffold-residue` | scaffold-residue | 3 | Boilerplate scaffold comment |
| `branch-symmetry` | branch-symmetry | 5 | Identical if/else return values |
| `promise-graveyard` | promise-graveyard | 6 | Floating promise (fire-and-forget) |
| `accessor-bloat` | accessor-bloat | 2 | Trivial getter accessor |

### Severity Scale

- **1–3**: Style/preference (verbose null check, naming, magic numbers)
- **4–6**: Code quality (empty catch, debug logs, structure smell, async abuse)
- **7–8**: Potential bugs or supply chain risk (hallucinated imports, context confusion)
- **9–10**: Critical security (eval, hardcoded secrets)

## Scoring

### Three-Axis Model

Each file is scored independently on three axes:

- **Axis A (AI Slop)**: Compression anomalies (repetitive structure) + slop pattern hits (scaffold residue, clone pollution, verbosity, over-engineering)
- **Axis B (Security)**: Hardcoded secrets (confidence-arbitrated), exposed internal URLs, risky MCP configs, security-category pattern hits
- **Axis C (Quality)**: Error handling, async abuse, dead code, structure smell, and other code quality pattern hits

### Project Aggregation

Per-file axes are aggregated weighted by role:

| Territory | Weight |
|-----------|--------|
| application | 1.0 |
| test | 0.5 |
| vendor | 0.1 |

### Verdicts

| Score | Verdict |
|-------|---------|
| 0 | Clean |
| 1–10 | Minimal |
| 11–25 | Some issues |
| 26–50 | Concerning |
| 51–75 | Heavy |
| 76–100 | Critical |

## Use in CI

### GitHub Actions

```yaml
name: Slop Check
on: [push, pull_request]

jobs:
  slopguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx slopguard .
```

slopguard exits with code 1 if any axis exceeds its default threshold (A > 50, B > 25).

### Custom Thresholds

```bash
# Strict: fail if AI slop > 30 or security > 15
npx slopguard . --threshold=A:30,B:15

# Only check security axis
npx slopguard . --axis=B
```

### JSON in CI

```bash
npx slopguard . --json > report.json
node -e "var r=JSON.parse(require('fs').readFileSync('report.json','utf8')); \
  console.log('A:'+r.projectSummary.axes.A+' B:'+r.projectSummary.axes.B+' C:'+r.projectSummary.axes.C)"
```

## Philosophy

The irony is the point. This tool detects the exact patterns that AI coding assistants produce. If you're using an AI to contribute, the code must pass slopguard's own rules.

The detection core is rooted in information theory (compression, entropy) — not pattern matching alone. Patterns expire. Math does not.

## Requirements

- Node.js 16+
- Zero npm dependencies

## License

MIT
