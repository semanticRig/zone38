# slopguard current state

## What this tool does

slopguard scans JavaScript and TypeScript projects and gives each file and the whole project a slop score from 0 to 100.

It looks for three main things in code files today:

- known bad patterns
- secret-like strings
- repetitive structure that looks more machine-generated than human-written

It can also scan MCP config files when that mode is turned on.

## How the scan works right now

1. Find scannable files by walking the target folder.
2. Classify each file as backend or frontend using path-name hints.
3. Run line-by-line rules on each file.
4. Run the secret detector on string values.
5. Run compression analysis on the full file.
6. Combine those results into one file score.
7. Average file scores into a project score.
8. Optionally add MCP config findings into the project result.

## Math and logic in use

### 1. Pattern rules

This is the simplest layer.

The tool checks each line against a set of rules for things like:

- hallucinated package imports
- browser APIs inside backend files
- verbose or over-engineered code
- dead code and TODOs
- debug leftovers
- dangerous security patterns

Each rule has a severity. The pattern score is based on the total severity of all hits in that file.

### 2. Compression analysis

This layer tries to measure how repetitive a file is.

It uses two ideas:

- self-compression ratio: compare compressed size to raw size
- NCD: compare the file against a human corpus and an AI corpus

Simple meaning:

- very repetitive files compress more easily
- if a file is closer to the AI corpus than the human corpus, the AI-like score goes up

Current implementation detail:

- self-compression ratio is the main signal
- NCD is added when both corpus files are available
- the final compression score blends those two pieces

### 3. Secret detection

The secret detector is no longer just a flat entropy threshold. It is now a small pipeline.

It works like this:

1. Extract long string literals from a line.
2. Immediately flag strings with well-known secret prefixes.
3. Break compound strings into smaller values when possible.
4. Ignore values that are obviously not secrets, like UUIDs, URLs, data URIs, file paths, and normal prose.
5. Score the remaining values with several signals.
6. If the fast signals disagree, use a heavier vector score.

The signals used are:

- Shannon entropy: how unpredictable the characters are
- character profile distance: whether the mix of uppercase, lowercase, digits, and symbols looks more like code or more like a secret
- bigram entropy ratio: whether character transitions look structured or random
- compression signal: whether the string resists compression

If those fast signals clearly agree, the tool decides there.

If they do not agree, the tool uses a 6-part vector score based on:

- normalized entropy
- compressibility
- distance from English-like text
- distance from code-like text
- closeness to a secret-like character profile
- how often character types alternate

### 4. Aggregation and scoring

Each file score uses these weights:

- compression: 40%
- pattern rules: 35%
- entropy or secret findings: 15%
- MCP findings: 10%

The project score is then built from file scores.

Important current detail:

- project weighting uses a rough size estimate, not true line count
- MCP findings are blended at project level

## File map

### CLI and public API

- bin/slopguard.js: command line entry, flags, pretty output, JSON output, exit code
- src/index.js: public exports

### Scanning and scoring

- src/scanner.js: file discovery, backend and frontend classification, rule scan, entropy scan, compression scan, optional MCP scan, full project scan
- src/scorer.js: file score, project score, verdict labels, scoring weights
- src/rules.js: pattern rule definitions

### Compression logic

- src/compression.js: gzip size, self-compression ratio, NCD, corpus loading, string compression signal

### Secret detection pipeline

- src/entropy.js: overall secret-detection flow and line or file analysis
- src/decomposer.js: splits compound strings into smaller candidate values
- src/char-frequency.js: character bucket profile and entropy signal
- src/bigram.js: transition randomness signal
- src/aggregator.js: decides when the fast signals agree or when the case is ambiguous
- src/vector.js: 6-dimension fallback score for ambiguous strings
- src/vector-worker.js: worker-thread helper for vector batches, present in repo but not currently wired into the main entropy path

## Corpora and tests

- corpus/: compressed reference corpora used by the compression layer
- test/run.js: zero-dependency test runner for the current logic
- test/fixtures/: clean, sloppy, secrets, safe strings, backend confusion, frontend, and MCP examples

## Current behavior notes

- The real implementation is more advanced in secret detection than the early README description.
- The main detection stack today is rules plus compression plus the hybrid secret pipeline.
- MCP scanning is optional and only checks a small set of risky config patterns.
- The worker-thread vector helper exists, but the current scan path calls the vector score directly.