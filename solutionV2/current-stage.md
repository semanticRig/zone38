# slopguard v2 - Current Stage

## Current Stage Summary

slopguard v2 is in a functional integration stage.

What is already true today:
- The v2 sequential pipeline is wired as the default execution path in the CLI.
- The orchestrator runs Layer 0 through Layer 14 in order and produces a structured report object.
- Layer 15 renders that report as CLI output or JSON output.
- Exit code decisions are based on per-axis thresholds (A, B, C).
- A legacy v1 path still exists behind the --v1 flag for backward compatibility.

In short: v2 is not just planned, it is actively executable end-to-end from scan start to report output.

## What We Built In v2 Core

The v2 core is a deep pipeline where each layer has one responsibility and passes enriched data to the next layer.

Implemented major parts:
- Layered pipeline modules: L00 through L15 in src/pipeline.
- Orchestrator: src/pipeline/runner.js to execute the chain and return report, registry, calibration, correlation, and scoring.
- Three-axis scoring model:
  - Axis A: AI slop risk
  - Axis B: security exposure risk
  - Axis C: code quality risk
- Report assembly that separates:
  - confirmed findings
  - uncertain review items
  - URL exposure signals
  - pattern-hit breakdown
  - clean files and project summary
- Output renderer with:
  - human-readable CLI mode
  - JSON mode
  - threshold parsing and exit code logic

## How App Logic Flows (Start -> Output)

## 1) CLI starts execution
Entry point: bin/slopguard.js

- Parses arguments like:
  - target path
  - --json, --verbose, --axis, --threshold
  - --v1 for legacy behavior
- If --v1 is not provided, it follows v2 flow.

## 2) Orchestrator runs the v2 chain
Orchestrator: src/pipeline/runner.js

High-level sequence:
1. L00 build registry of files from target path.
2. For each file, run per-file layers (L01-L10):
   - classify role
   - characterize file surface
   - analyze compression texture
   - harvest entities
   - preflight filter candidates
   - herd discrimination
   - deep analysis
   - arbitration
   - URL analysis
   - pattern rules
3. Run project-level layers:
   - L11 correlation across files
   - L12 project calibration
   - L13 axis scoring
   - L14 report assembly
4. Return structured artifacts to caller.

Returned structure from runner:
- report
- registry
- calibration
- correlation
- scoring

## 3) Report is rendered
Renderer: src/pipeline/L15-output.js

The report is transformed into either:
- CLI text output (sectioned, colorized, filtered by options), or
- JSON output for automation/CI.

Key rendering sections:
- Axis table (A/B/C)
- Pattern hits
- Secrets
- Exposure
- Review bucket (uncertain findings)
- Correlation summary

## 4) Exit code is computed
Still in Layer 15 output logic:
- Thresholds are parsed from --threshold argument.
- Default threshold policy is applied when no overrides are passed.
- Process exits with code 0 or 1 based on axis threshold checks.

This enables CI gating using per-axis risk controls instead of one blended score.

## Practical Data Journey

A single file goes through this journey:
1. Discovered in registry.
2. Classified for context (role/territory).
3. Measured for surface and compression texture.
4. Strings/URLs/entities extracted.
5. Low-value candidates filtered out.
6. Remaining candidates analyzed deeply.
7. Findings assigned confidence and split into confirmed vs review.
8. Pattern rules and URL topology add extra signals.
9. Per-file A/B/C scores are computed.
10. File contributes to project-level calibrated scoring and final report sections.

## Current Architecture State (Important)

- CLI default path is v2.
- v1 is still available with --v1.
- Public API in src/index.js still exposes mainly v1 scanner/scorer surface.

This means runtime is already v2-first in CLI usage, while library exports are still partially legacy-focused.

## Why This Stage Matters

This stage gives us a complete, testable v2 execution spine:
- input path -> layered analysis -> calibrated scoring -> structured report -> formatted output -> CI exit code

So the foundation is in place for tuning accuracy and improving docs/tests without redesigning core flow.
