# slopguard

> Detects AI slop in your codebase before your tech lead does.

Zero dependencies. Offline-only. Information theory meets pattern matching.

```bash
npx slopguard .
```

## What It Does

slopguard scans JavaScript/TypeScript codebases for patterns commonly produced by AI coding assistants — hallucinated imports, hardcoded secrets, debug leftovers, over-engineering, context confusion, and more. It gives every file a **Slop Score** (0–100) and a project-level aggregate.

The detection core combines four independent layers:

| Layer | Weight | Method |
|-------|--------|--------|
| **Compression analysis** | 40% | NCD + self-compression ratio via zlib. AI code compresses more due to structural repetitiveness. |
| **Pattern rules** | 35% | 22 regex-based rules across 8 categories. High confidence per hit. |
| **Shannon entropy** | 15% | Character-level entropy on string literals. Catches hardcoded secrets without keyword matching. |
| **MCP config audit** | 10% | Optional scan of VS Code / Cursor MCP server configs for risky patterns. |

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
  --help       Show help message
  --verbose    Show detailed per-file hit breakdown with fix suggestions
  --json       Output results as JSON
  --mcp        Scan MCP server configurations for risky patterns
```

### Examples

```bash
# Scan current directory
slopguard .

# Scan src/ with detailed output
slopguard ./src --verbose

# CI gate — exits with code 1 if score > 50
slopguard . --json

# Include MCP config audit
slopguard . --mcp --verbose
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Slop score ≤ 50 (pass) |
| `1` | Slop score > 50 (fail) |

## Library Usage

```js
const { scanAll, scanFile, scoreFile } = require('slopguard');

// Scan an entire directory
const result = scanAll('./src', { mcp: true });
console.log(result.project.score);    // 0-100
console.log(result.project.verdict);  // { label: 'Some slop', emoji: '⚠️' }
console.log(result.files.length);     // number of files scanned
console.log(result.mcpFindings);      // MCP config findings (if --mcp)

// Scan a single file
const fileResult = scanFile('./src/app.js', './src');
const scored = scoreFile(fileResult);
console.log(scored.score);            // 0-100
console.log(scored.breakdown);        // { compression, patterns, entropy, mcp }
```

### Result Shape

```js
// scanAll() returns:
{
  files: [{
    filePath: '/abs/path/to/file.js',
    relativePath: 'file.js',
    isBackend: false,
    isFrontend: true,
    hits: [{
      ruleId: 'innerhtml-usage',
      ruleName: 'innerHTML assignment',
      category: 'security',
      severity: 7,
      lineNumber: 42,
      line: 'el.innerHTML = data;',
      fix: 'Use textContent for text, or sanitize HTML before inserting.'
    }],
    entropyFindings: [{
      value: 'sk-proj-abc123...',
      entropy: 4.82,
      charset: 'base64',
      threshold: 4.5,
      lineNumber: 10
    }],
    compression: {
      selfRatio: 0.45,
      ncdHuman: 0.72,
      ncdAI: 0.31,
      compressionScore: 35
    }
  }],
  project: {
    score: 19,
    verdict: { label: 'Some slop', emoji: '⚠️' },
    fileCount: 4,
    totalHits: 5,
    totalEntropyFindings: 1,
    totalMCPFindings: 0,
    fileScores: [/* per-file scores */]
  },
  mcpFindings: []
}
```

## Detection Rules

22 rules across 8 categories:

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

### Severity Scale

- **1–3**: Style/preference (verbose null check, redundant boolean)
- **4–6**: Code quality (empty catch, debug logs, TODOs)
- **7–8**: Potential bugs or supply chain risk (hallucinated imports, context confusion)
- **9–10**: Critical security (eval, hardcoded secrets)

## Scoring

### Per-File Score

Weighted combination of four signals, normalized to 0–100:

```
score = compression × 0.40 + patterns × 0.35 + entropy × 0.15 + mcp × 0.10
```

### Project Score

Aggregate across all files, weighted by file size. MCP findings are blended in at their designated weight.

### Verdicts

| Score | Verdict | Emoji |
|-------|---------|-------|
| 0 | Clean | ✅ |
| 1–10 | Minimal | ✅ |
| 11–25 | Some slop | ⚠️ |
| 26–50 | Sloppy | ⚠️ |
| 51–75 | Heavy slop | ❌ |
| 76–100 | Catastrophic | 💩 |

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
      - run: npx slopguard . --mcp
```

slopguard exits with code 1 if the project score exceeds 50, failing the CI step.

### Custom Threshold

For stricter gates, check the JSON output:

```bash
SCORE=$(npx slopguard . --json | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).score))")
if [ "$SCORE" -gt 25 ]; then echo "Too sloppy: $SCORE"; exit 1; fi
```

## How It Works

### Compression Analysis (40%)

AI-generated code is structurally repetitive — verbose JSDoc blocks, redundant null checks, formulaic CRUD patterns. This repetitiveness means AI code **compresses better** (lower ratio) than idiosyncratic human code.

slopguard uses two metrics:
- **Self-compression ratio**: `gzip(file).length / file.length` — lower = more repetitive
- **NCD (Normalized Compression Distance)**: measures structural similarity against reference corpora of known human-written and AI-generated JavaScript

This layer is **model-agnostic and time-independent**. It detects the statistical texture of autoregressive generation, not specific model outputs.

### Shannon Entropy (15%)

Every string literal longer than 16 characters gets its Shannon entropy calculated. The charset (hex, base64, alphanumeric, mixed) determines the threshold. High-entropy strings in code contexts are probable secrets — no keyword matching needed.

Template literals with interpolation and prose-like strings are filtered out to reduce false positives.

### Pattern Rules (35%)

Regex-based detection of 22 known AI slop signatures. Context-aware: backend rules don't fire on frontend files and vice versa. Each rule includes a severity rating and a fix suggestion.

### MCP Config Scanner (10%)

Optional (`--mcp` flag). Scans `.vscode/settings.json`, `.vscode/mcp.json`, and `.cursor/mcp.json` for risky MCP server configurations: shell command execution, hardcoded API keys, insecure HTTP endpoints, and overly broad tool permissions.

## Philosophy

The irony is the point. This tool detects the exact patterns that AI coding assistants produce. If you're using an AI to contribute, the code must pass slopguard's own rules.

The detection core is rooted in information theory (compression, entropy) — not pattern matching alone. Patterns expire. Math does not.

## Requirements

- Node.js 16+
- Zero npm dependencies

## License

MIT
