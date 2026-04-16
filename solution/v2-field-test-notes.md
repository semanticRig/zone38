# v2 Field Test Notes — webapp playground

**Date**: 2026-04-17
**Target**: `/home/cloakedcpu/humity/tmp-slopguard/webapp` (435 JS files, draw.io webapp)
**Branch**: `fix/v2-field-test-bugs`

---

## BUG #1: Single-file path silently returns empty results (CRITICAL)

**Repro**: `slopguard /path/to/file.js --verbose`
**Expected**: Scan that one file and report results
**Actual**: Shows 0 files scanned, 0 lines, all axes 0/100 — no error message

**Root cause**: `L00-ingestion.js` → `walkProject()` calls `fs.readdirSync(absRoot)` which throws `ENOTDIR` when `absRoot` is a file, not a directory. The `catch` block silently returns an empty array.

**Fix**: In `L00-ingestion.js`, detect when the target is a file (not a dir) and create a single-entry registry for it instead of walking. Check `fs.statSync(absRoot).isFile()` before the walk.

**Affected**: `src/pipeline/L00-ingestion.js` → `walkProject()` and `buildRegistry()`

---

## BUG #2: Massive false-positive secrets from style/config strings (HIGH)

**Repro**: `slopguard /path/to/sidebar/ --json` → 2,934 "secrets" from 66 files
**Expected**: Near-zero secrets (this is a UI diagram library, no real secrets)
**Actual**: Semicolon-delimited CSS-like style strings flagged as HIGH/MEDIUM secrets

**Examples of false positives**:
- `'chime;fillColor=#03B5BB;gradientColor=none;'` → HIGH confidence secret
- `'auto_scaling_group;strokeColor=#f69721;fillColor=none;gradientColor=none;'` → HIGH
- `'dashed=0;html=1;shape=mxgraph.aws2...'` → MEDIUM
- `'rounded=1;whiteSpace=wrap;html=1;arcSize=50;'` → HIGH

**Root cause**: The string analysis pipeline (L04→L07→L08) treats high-entropy strings as potential secrets. Semicolon-delimited key=value style strings have enough character diversity and length to trigger the entropy/compression heuristics but are obviously not secrets.

**Fix options** (pick one or combine):
1. **L05-preflight**: Add a filter that recognizes `key=value;key=value;` patterns (semicolon-delimited k=v pairs) and deprioritizes them. If >50% of the string is `word=value;` pairs, classify as `config-style` and skip deep analysis.
2. **L07-deep or L08-arbitration**: Downgrade confidence when the string matches a CSS/style property pattern (contains known CSS properties like `fillColor`, `strokeColor`, `gradientColor`, `dashed`, `rounded`, `html`, `whiteSpace`).
3. **L04-harvest**: During entity extraction, tag strings containing `;`-separated `key=value` pairs with a `style-literal` type so downstream layers can handle them differently.

**Recommended**: Option 1 (L05-preflight filter) — cheapest and catches the pattern early before expensive analysis.

---

## BUG #3: structure-smell over-fires on data-definition nesting (LOW)

**Repro**: `slopguard /path/to/sidebar/ --verbose` → hundreds of `[structure-smell] Deeply nested code block` hits
**Root cause**: Rule fires at ≥20 spaces indent. Draw.io sidebar files use deeply indented array literals inside function bodies:
```js
this.addPaletteFunctions('name', 'label', false,
[
    this.createVertexTemplateEntry(s + 'shape;...',  // ← 20+ spaces
        60, 72, '', 'Name', ...),
]);
```
This is **data nesting** (array of method call results), not **logic nesting** (if/else/for chains). The rule description says "logic nested 5+ levels deep" but the implementation only counts indentation.

**Fix**: In `src/rules.js` → `structure-smell` rule, additionally check that the line starts with a control-flow keyword (`if`, `else`, `for`, `while`, `switch`, `case`, `try`, `catch`) or contains `{`/`}` before flagging. Pure data lines (function calls, array elements, object properties) at deep indent are not logic nesting.

---

## BUG #4: magic-values flags 0 in idiomatic patterns (MINOR)

**Repro**: `href.lastIndexOf('/', 0) !== 0` flagged as "Magic number in logic"
**Root cause**: The `0` in `lastIndexOf(x, 0)` is an idiomatic "startsWith" pattern in pre-ES6 code. Also flags regex flag strings like `'i'`.

**Fix**: Whitelist `0` and `1` in common method call positions (`indexOf`, `lastIndexOf`, `slice`, `substring`). These are semantic positions, not magic numbers.

---

## Test Summary

| Target | Files | Lines | A | B | C | Issues Found |
|--------|-------|-------|-----|------|------|-------------|
| `sidebar/` (dir) | 66 | 46,435 | 25.3 | **39.3** | 29.0 | Bug #2 (B inflated by 2934 FP secrets) |
| `mxgraph/src/shape/` (dir) | 22 | 6,705 | 7.3 | 4.8 | 4.7 | Clean scan, reasonable |
| `connect/` (dir) | 1 | 747 | 7.0 | 12.1 | 5.1 | Bug #4 minor |
| `mxImageShape.js` (file) | 0 | 0 | 0 | 0 | 0 | Bug #1 (file path broken) |
| `Sidebar-Cabinet.js` (file) | 0 | 0 | 0 | 0 | 0 | Bug #1 (file path broken) |

## Priority Order

1. **BUG #1** — Single-file scan broken (blocks basic UX)
2. **BUG #2** — Style-string false positives (inflates Axis B on real codebases)
3. **BUG #3** — Nesting rule over-fires on data (noise, not dangerous)
4. **BUG #4** — Magic-values 0/1 whitelist (minor polish)
