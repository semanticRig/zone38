<div align="center">

  <!-- LOGO: replace this comment with your inline SVG -->

  <h1>zone38</h1>
  <p><em>Below 0.038, nothing is innocent.</em></p>

  <img src="https://img.shields.io/badge/version-0.0.1-blue" alt="version">
  <img src="https://img.shields.io/badge/license-BSL--1.1-red" alt="license">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="zero dependencies">
  <img src="https://img.shields.io/badge/offline-100%25-success" alt="offline">

</div>

---

## Why zone38?

The name is not arbitrary. It is a direct reference to one of the core detection thresholds built into the tool.

The **Index of Coincidence (IC)** is a classical cryptanalysis metric that measures the probability of two randomly drawn characters from a string being identical. When applied to a string of text:

- Natural human language (English) produces IC ≈ **0.065** — because vowels, spaces, and common letters repeat with predictable frequency.
- A true cryptographic secret — an API key, a token, a private key fragment — approaches IC ≈ **0.038**, the value of a perfectly uniform random distribution.

The boundary below IC = 0.038 is where zone38 operates. Any string that crosses into that zone is not human language. It is mathematically foreign to natural text. It is a secret.

The tool is named after that threshold.

---

## The Problem

Regex-based secret scanners generate massive false-positive rates because they match naming patterns, not mathematical structure — rename your variable and the scanner goes blind. LLM coding assistants introduce structural bloat that linters cannot detect: the syntax is valid, the types check out, but the code is mechanically verbose, redundantly commented, and architecturally hollow in ways no static rule can articulate. Existing tools that go beyond simple regex either require cloud connectivity — meaning your source code leaves the machine — or depend on brittle pattern databases that rot within months as model outputs and token formats evolve. zone38 solves all three.

---

## How Detection Works

zone38 combines three mathematically independent signals to confirm a finding. All three must agree. No regex is involved in the security axis.

**Signal 1 — Shannon Entropy**

$$H(X) = -\sum_{i} p(x_i) \log_2 p(x_i)$$

Measures how uniformly characters are distributed across a string. A leaked API key has near-maximum entropy — every character is approximately equally likely. A translation key like `auth.login.error` has low entropy because predictable characters dominate. Time-independent: it measures the mathematical structure of the data itself, not its format or naming convention.

**Signal 2 — Index of Coincidence**

$$IC = \frac{\sum_i n_i(n_i - 1)}{N(N-1)}$$

Measures the probability that two randomly drawn characters from a string are identical. Random cryptographic material approaches IC ≈ 0.038 — the zone38 threshold. Natural language approaches IC ≈ 0.065. Time-independent: it measures letter-frequency physics, not token formats.

**Signal 3 — Normalized Compression Distance**

$$NCD(x, y) = \frac{C(xy) - \min(C(x), C(y))}{\max(C(x), C(y))}$$

Measures how algorithmically alien string *x* is relative to its surrounding code context *y*. A real credential embedded in a UI component shares almost no structural DNA with the surrounding source code — its NCD score is high. An i18n key or HTML snippet shares the structural language of the file — its NCD score is low. Time-independent: compression distance is a property of the data, not the programming language, framework version, or AI model that generated it.

---

## Why Single-Signal Tools Fail

All three signals must agree before a finding is emitted. A compressed inline SVG has high entropy but low IC and low NCD-alienation — it is explicitly discarded. A random UUID has moderate entropy but a predictable IC and low context alienation — discarded. Only strings that are simultaneously entropic, IoC-random (below the 0.038 zone38 threshold), and structurally foreign to their context are confirmed. This multi-signal gate is why zone38 produces far fewer false positives than any regex-based or single-entropy scanner.

---

## Three-Axis Scoring

| Axis | What It Measures | 0–10 | 26–50 | 76–100 |
|------|-----------------|------|-------|--------|
| **A — Slop** | AI-pattern density: verbosity, dead code, structural over-engineering | Clean | Review recommended | Do not ship |
| **B — Security** | Secrets and risky API exposure: leaked credentials, eval, injection vectors | Minimal risk | Real issues present | Critical |
| **C — Quality** | Code health signals: debug logs, empty catch blocks, magic values | Healthy | Noticeable issues | Critical |

Exit code `0` when all axes are within thresholds. Exit code `1` when any axis exceeds threshold — the CI gate trips.

---

## Quick Start

```bash
# Scan the current directory
npx zone38 .
```

```bash
# Interactive triage — security hits only
npx zone38 ./src -v -s secrets -o
```

```bash
# PR gate — only files changed vs main
npx zone38 . --since=origin/main -j
```

---

## CI/CD Integration

```yaml
name: zone38 scan
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Scan changed files
        run: npx zone38 . --since=origin/main -j
```

---

## Why Offline-First

- No source code leaves the developer's machine. No API calls, no telemetry.
- Works in air-gapped enterprise environments where cloud tools are prohibited.
- No API key, rate limit, or external service that can silently break a pipeline.

---

## License

Licensed under BSL 1.1 — free for all internal and CI/CD use; prohibited only for reselling as a competing hosted security SaaS. Full text in `LICENSE`.
