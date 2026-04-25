<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/semanticRig/zone38/main/assets/logo-dark.svg">
  <img src="https://raw.githubusercontent.com/semanticRig/zone38/main/assets/logo-light.svg" alt="zone38" width="460">
</picture>

<h3>Below 0.038, nothing is innocent.</h3>

<p>
  <img src="https://img.shields.io/badge/version-0.0.1-0a0a0a?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/license-BSL--1.1-c0392b?style=flat-square" alt="license">
  <img src="https://img.shields.io/badge/dependencies-zero-2ecc71?style=flat-square" alt="zero dependencies">
  <img src="https://img.shields.io/badge/offline-100%25-2ecc71?style=flat-square" alt="offline">
  <img src="https://img.shields.io/badge/node-%3E%3D16-lightgrey?style=flat-square" alt="node">
</p>

</div>

---

## What It Is

zone38 scans JavaScript and TypeScript codebases for two categories of problem: secrets that should not be in source code, and structural patterns that indicate AI-generated or low-quality code. It scores every file and the project as a whole across three independent axes. No network connection. No external service. Nothing leaves the machine.

---

## Why the Name

The **Index of Coincidence** (IC) is a classical cryptanalysis metric — the probability that two randomly drawn characters from a string are identical.

Natural human language produces IC ≈ **0.065**. Vowels, spaces, and common letters repeat with predictable frequency.

A true cryptographic secret — an API key, a token, a private key fragment — approaches IC ≈ **0.038**, the value of a perfectly uniform random distribution.

The boundary below IC = 0.038 is where zone38 operates. Any string that crosses into that zone is not human language. It is mathematically foreign to natural text. The tool is named after that threshold.

---

## The Problem

Regex-based secret scanners generate massive false-positive rates because they match naming patterns, not mathematical structure. Rename a variable and the scanner goes blind.

LLM coding assistants introduce structural bloat that linters cannot detect. The syntax is valid, the types check out, but the code is mechanically verbose and architecturally hollow in ways no static rule can articulate.

Existing deep-analysis tools either require cloud connectivity — meaning your source code leaves the machine — or depend on pattern databases that rot within months as model outputs evolve.

zone38 solves all three.

---

## Quick Start

```bash
npx zone38 .
```

```bash
npm install -g zone38
```

---

## CLI

```
zone38 <path> [options]

Detail
  -v, --verbose           Per-file breakdown for flagged files
  -a, --all               Per-file breakdown for every file
  -f, --file=NAME         Breakdown for one specific file

Filter
  -s, --show=SECTION      Show only one section (hits|secrets|review|exposure|breakdown)
  -A, --axis=A,B,C        Limit scan to specific axes  (e.g. -A B  or  -A A,B)

Navigation
  -o, --open              Interactive hit navigator

Output
  -j, --json              Machine-readable JSON (CI / tooling)

Advanced
  -m, --mcp               Scan .vscode/mcp.json and .cursor/mcp.json
  -S, --since=REF         Scan only files changed since a git ref
  -t, --threshold=A:N     Override exit-code threshold per axis  (e.g. -t A:40,B:20)
      --explain=LINE      Deep signal breakdown for a line  (single-file mode only)

  --help                  Show help
```

```bash
# Scan a directory with full detail
zone38 ./src --verbose

# PR gate — changed files only
zone38 . --since=origin/main --json

# Security axis only, interactive
zone38 ./src -A B --show=secrets --open

# Understand why line 84 was flagged
zone38 ./src/auth.js --explain=84
```

---

## How Detection Works

zone38 uses three mathematically independent signals. For a secret finding, all three must agree before anything is reported. This multi-gate design is why the false-positive rate is far lower than any single-signal or regex-based approach.

**Signal 1 — Shannon Entropy**

$$H(X) = -\sum_{i} p(x_i) \log_2 p(x_i)$$

Measures how uniformly characters are distributed. A leaked credential has near-maximum entropy. A translation key does not. This signal is time-independent: it measures the mathematical structure of the data itself, not its format or naming convention.

**Signal 2 — Index of Coincidence**

$$IC = \frac{\sum_i n_i(n_i - 1)}{N(N-1)}$$

Measures letter-frequency physics. Random cryptographic material approaches IC ≈ 0.038. Natural language approaches IC ≈ 0.065. Time-independent.

**Signal 3 — Normalized Compression Distance**

$$NCD(x, y) = \frac{C(xy) - \min(C(x), C(y))}{\max(C(x), C(y))}$$

Measures how structurally alien a string is relative to the code surrounding it. A real credential embedded in a UI component shares almost no structural DNA with that file. An i18n key does. Time-independent: compression distance is a property of the data, not the language or framework.

A compressed inline SVG has high entropy but normal IC and low NCD alienation — discarded. A UUID has moderate entropy but predictable IC — discarded. Only strings that fail all three thresholds simultaneously are confirmed.

---

## Three-Axis Scoring

Every scan produces three independent scores (0–100).

| Axis | What It Measures |
|------|-----------------|
| **A — Slop** | AI-pattern density: verbosity, dead code, structural over-engineering |
| **B — Security** | Secrets and risky patterns: leaked credentials, injection vectors |
| **C — Quality** | Code health: debug logs, empty catch blocks, unresolved TODOs |

| Score | Verdict |
|-------|---------|
| 0–10 | Clean |
| 11–25 | Minimal issues |
| 26–50 | Review recommended |
| 51–75 | Do not ship |
| 76–100 | Critical |

Exit code `0` when all axes are within thresholds. Exit code `1` when any axis exceeds threshold.

---

## CI/CD Integration

### GitHub Actions

```yaml
name: zone38
on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: npx zone38 . --since=origin/main --json
```

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit
npx zone38 . --since=HEAD --json || exit 1
```

### Custom Threshold

```bash
SCORE=$(npx zone38 . --json | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).projectSummary.axes.B))")
if [ "$SCORE" -gt 25 ]; then
  echo "Security axis too high: $SCORE"
  exit 1
fi
```

---

## Library Usage

```js
const { run, renderJson, exitCode } = require('zone38');

const result = run('./src');

console.log(result.report.projectSummary.axes);
// { A: 12, B: 4, C: 18 }

console.log(result.report.projectSummary.verdicts);
// { A: 'Minimal issues', B: 'Clean', C: 'Review recommended' }

console.log(result.report.perFile.length);
// 24

// Render JSON string (same as --json flag)
console.log(renderJson(result.report));

// Check exit code against default thresholds
process.exit(exitCode(result.report.projectSummary.axes));
```

---

## Why Offline-First

Source code is sensitive. zone38 makes no network requests, stores no telemetry, and has no external dependencies. It works in air-gapped environments where cloud tooling is prohibited. The analysis is deterministic: same input, same output, every time.

---

## Requirements

- Node.js 16 or later
- macOS, Linux, or Windows
- Zero npm dependencies

---

## Roadmap

- `--fix` mode: auto-remediate console.log, flagged TODOs, redundant patterns
- VS Code extension with inline severity annotations
- SARIF output for GitHub code scanning integration
- Python and Ruby support

---

## Contributing

```bash
git clone https://github.com/semanticRig/zone38
cd zone38
npm test
```

Add test fixtures for any new rule — a clean example and a sloppy one. Open a pull request. zone38 will scan its own diff.

The detection core is intentionally model-agnostic and time-independent. Contributions that rely on specific model fingerprints or token formats will not be accepted — those signals expire.

---

## License

BSL 1.1 — free for all internal, personal, and CI/CD use. Commercial resale as a competing hosted security SaaS is prohibited. Full text in `LICENSE`.

---

<div align="center">
<sub>If you use an AI assistant to contribute to zone38, the code must pass zone38's own rules.</sub>
</div>
