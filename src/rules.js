'use strict';

// Pattern detection rules for slopguard
// Each rule: { id, name, category, severity, description, test(line, ctx), fix }
// The test method is pure — no side effects, returns boolean

var rules = [

  // --- slopsquatting: hallucinated or wrong package imports ---
  {
    id: 'hallucinated-import-require',
    name: 'Possibly hallucinated require',
    category: 'slopsquatting',
    severity: 8,
    description: 'Detects require() calls for packages that are commonly hallucinated by AI models.',
    test: function (line) {
      var match = line.match(/require\s*\(\s*['"]([^./][^'"]*)['"]\s*\)/);
      if (!match) return false;
      var pkg = match[1].split('/')[0];
      // Known hallucinated or commonly confused packages
      var hallucinated = [
        'react-native-utils', 'express-validator-sanitizer', 'lodash-utils',
        'node-fetch-native', 'crypto-js-utils', 'mongoose-paginate-plugin',
        'axios-retry-interceptor', 'jsonwebtoken-decode', 'bcrypt-password',
        'dotenv-safe-expanded', 'chalk-colors', 'moment-timezone-utils',
      ];
      return hallucinated.indexOf(pkg) !== -1;
    },
    fix: 'Verify this package exists on npm. AI models often hallucinate package names.',
  },

  {
    id: 'import-hallucinated-module',
    name: 'Possibly hallucinated import',
    category: 'slopsquatting',
    severity: 8,
    description: 'Detects import statements for packages that are commonly hallucinated by AI models.',
    test: function (line) {
      var match = line.match(/import\s+.*\s+from\s+['"]([^./][^'"]*)['"]/);
      if (!match) return false;
      var pkg = match[1].split('/')[0];
      var hallucinated = [
        'react-native-utils', 'express-validator-sanitizer', 'lodash-utils',
        'node-fetch-native', 'crypto-js-utils', 'mongoose-paginate-plugin',
        'axios-retry-interceptor', 'jsonwebtoken-decode', 'bcrypt-password',
        'dotenv-safe-expanded', 'chalk-colors', 'moment-timezone-utils',
      ];
      return hallucinated.indexOf(pkg) !== -1;
    },
    fix: 'Verify this package exists on npm. AI models often hallucinate package names.',
  },

  // --- context-confusion: wrong API for the environment ---
  {
    id: 'localstorage-in-backend',
    name: 'localStorage in backend code',
    category: 'context-confusion',
    severity: 7,
    description: 'localStorage is a browser API. Using it in backend code is a hallmark of AI context confusion.',
    test: function (line, ctx) {
      if (!ctx.isBackend) return false;
      return /\blocalStorage\b/.test(line);
    },
    fix: 'Use a database, Redis, or file-based storage instead of localStorage in backend code.',
  },

  {
    id: 'document-in-backend',
    name: 'document object in backend code',
    category: 'context-confusion',
    severity: 7,
    description: 'The document object is browser-only. Using it in a server file indicates AI context confusion.',
    test: function (line, ctx) {
      if (!ctx.isBackend) return false;
      return /\bdocument\.(getElementById|querySelector|createElement|body|head)\b/.test(line);
    },
    fix: 'Remove browser DOM access from server-side code.',
  },

  {
    id: 'window-in-backend',
    name: 'window object in backend code',
    category: 'context-confusion',
    severity: 7,
    description: 'The window object only exists in browsers. Server files should never reference it.',
    test: function (line, ctx) {
      if (!ctx.isBackend) return false;
      return /\bwindow\.(location|addEventListener|innerWidth|alert|confirm|prompt)\b/.test(line);
    },
    fix: 'Remove browser window references from server-side code.',
  },

  {
    id: 'process-env-in-frontend',
    name: 'Raw process.env in frontend code',
    category: 'context-confusion',
    severity: 5,
    description: 'Direct process.env access in frontend code may leak server secrets to the client bundle.',
    test: function (line, ctx) {
      if (!ctx.isFrontend) return false;
      // Allow common safe patterns like NEXT_PUBLIC_, REACT_APP_, VITE_
      if (/process\.env\.(NEXT_PUBLIC_|REACT_APP_|VITE_)/.test(line)) return false;
      return /\bprocess\.env\./.test(line);
    },
    fix: 'Use framework-specific env prefixes (NEXT_PUBLIC_, REACT_APP_, VITE_) or inject at build time.',
  },

  // --- over-engineering: unnecessary complexity ---
  {
    id: 'unnecessary-abstraction-factory',
    name: 'Factory pattern for trivial operation',
    category: 'over-engineering',
    severity: 4,
    description: 'AI loves creating factory functions and builder patterns for operations that need a single function.',
    test: function (line) {
      return /function\s+\w*(Factory|Builder|Creator|Provider|Generator)\s*\(/.test(line) ||
             /const\s+\w*(Factory|Builder|Creator|Provider|Generator)\s*=/.test(line) ||
             /class\s+\w*(Factory|Builder|Creator)\b/.test(line);
    },
    fix: 'Consider using a plain function instead of a factory/builder pattern.',
  },

  {
    id: 'excessive-ternary-nesting',
    name: 'Deeply nested ternary',
    category: 'over-engineering',
    severity: 5,
    description: 'Nested ternary operators reduce readability. AI frequently chains them instead of using if/else.',
    test: function (line) {
      // Strip string and regex literals first — ? inside them are not ternary operators.
      // Order matters: strip strings before regex so a /pattern/ inside a string doesn't confuse us.
      var stripped = line
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, '``')
        .replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '//');
      // Count ? that look like ternary operators (not optional chaining ?. or nullish ??)
      var ternaryCount = (stripped.match(/[^?.\s]\s*\?\s*[^?.]/g) || []).length;
      return ternaryCount >= 3;
    },
    fix: 'Replace nested ternaries with if/else or a lookup object.',
  },

  {
    id: 'verbose-null-check',
    name: 'Verbose null/undefined check',
    category: 'verbosity',
    severity: 2,
    description: 'AI often writes explicit null AND undefined checks where a simpler check suffices.',
    test: function (line) {
      return /!==?\s*null\s*&&\s*\S+\s*!==?\s*undefined/.test(line) ||
             /!==?\s*undefined\s*&&\s*\S+\s*!==?\s*null/.test(line);
    },
    fix: 'Use `value != null` (loose equality) to check for both null and undefined.',
  },

  // --- dead-code: unused or unreachable code ---
  {
    id: 'commented-out-code',
    name: 'Commented-out code block',
    category: 'dead-code',
    severity: 3,
    description: 'AI often leaves commented-out code blocks. Dead code should be removed, not commented.',
    test: function (line) {
      var trimmed = line.trim();
      if (!trimmed.startsWith('//')) return false;
      var uncommented = trimmed.slice(2).trim();
      // Looks like code, not a regular comment
      return /^(var |let |const |function |if\s*\(|for\s*\(|while\s*\(|return |import |export |class )/.test(uncommented) ||
             /^[a-zA-Z_$]\w*\s*\(/.test(uncommented) ||
             /^[a-zA-Z_$]\w*\s*=\s*/.test(uncommented);
    },
    fix: 'Remove commented-out code. Use version control to recover old code if needed.',
  },

  {
    id: 'todo-fixme-comment',
    name: 'TODO/FIXME left in code',
    category: 'dead-code',
    severity: 4,
    description: 'AI-generated code frequently includes TODOs that were never addressed.',
    test: function (line) {
      return /\/\/\s*(TODO|FIXME|HACK|XXX|TEMP)\b/i.test(line);
    },
    fix: 'Either implement the TODO or remove it. Shipped code should not contain unresolved TODOs.',
  },

  {
    id: 'empty-catch-block',
    name: 'Empty catch block',
    category: 'dead-code',
    severity: 6,
    description: 'Empty catch blocks silently swallow errors. AI generates these frequently.',
    test: function (line, ctx) {
      var trimmed = line.trim();
      if (!/catch\s*\(/.test(trimmed)) return false;
      // Check if next non-empty line is just a closing brace
      for (var i = ctx.lineIndex + 1; i < ctx.lines.length; i++) {
        var nextTrimmed = ctx.lines[i].trim();
        if (nextTrimmed === '') continue;
        return nextTrimmed === '}';
      }
      return false;
    },
    fix: 'Log the error or handle it explicitly. Never silently swallow exceptions.',
  },

  // --- debug-pollution: leftover debugging artifacts ---
  {
    id: 'console-log-leftover',
    name: 'console.log left in code',
    category: 'debug-pollution',
    severity: 4,
    description: 'console.log statements left in production code. Very common AI artifact.',
    test: function (line) {
      var trimmed = line.trim();
      // Skip comments about console.log (like in rule descriptions)
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
      // Skip string literals containing console.log (like in test assertions)
      if (/['"`].*console\.log.*['"`]/.test(line)) return false;
      return /\bconsole\.log\s*\(/.test(line);
    },
    fix: 'Remove console.log or replace with a proper logging library.',
  },

  {
    id: 'debugger-statement',
    name: 'debugger statement left in code',
    category: 'debug-pollution',
    severity: 6,
    description: 'A debugger statement left in production code will pause execution in browsers.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      return /^\s*debugger\s*;?\s*$/.test(line);
    },
    fix: 'Remove the debugger statement.',
  },

  {
    id: 'alert-statement',
    name: 'alert() left in code',
    category: 'debug-pollution',
    severity: 5,
    description: 'alert() calls left in production code. Common AI debugging artifact.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      if (/['"`].*\balert\b.*['"`]/.test(line)) return false;
      return /\balert\s*\(/.test(line);
    },
    fix: 'Remove alert() calls. Use proper UI notifications or logging.',
  },

  // --- security: dangerous patterns ---
  {
    id: 'eval-usage',
    name: 'eval() or new Function() usage',
    category: 'security',
    severity: 9,
    description: 'eval() and new Function() execute arbitrary code. Major security risk.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      if (/['"`].*\beval\b.*['"`]/.test(line)) return false;
      return /\beval\s*\(/.test(line) || /new\s+Function\s*\(/.test(line);
    },
    fix: 'Never use eval() or new Function(). Parse data with JSON.parse() or use a safe alternative.',
  },

  {
    id: 'hardcoded-secret',
    name: 'Hardcoded secret or API key',
    category: 'security',
    severity: 10,
    description: 'Hardcoded secrets in source code. AI frequently embeds placeholder keys that look real.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      // Match common secret patterns assigned to variables
      return /(api[_-]?key|secret|password|token|auth|credential)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{16,}['"]/i.test(line);
    },
    fix: 'Move secrets to environment variables. Never commit keys to source code.',
  },

  {
    id: 'innerhtml-usage',
    name: 'innerHTML assignment',
    category: 'security',
    severity: 7,
    description: 'Setting innerHTML with dynamic content can lead to XSS attacks.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      return /\.innerHTML\s*=/.test(line) || /\.outerHTML\s*=/.test(line);
    },
    fix: 'Use textContent for text, or sanitize HTML before inserting. Prefer DOM APIs.',
  },

  // --- dependency: risky dependency patterns ---
  {
    id: 'wildcard-dependency-version',
    name: 'Wildcard dependency version',
    category: 'dependency',
    severity: 6,
    description: 'Using * or latest as a dependency version is a supply-chain risk.',
    test: function (line) {
      return /['"]\s*:\s*['"]\s*(\*|latest)\s*['"]/.test(line);
    },
    fix: 'Pin dependency versions to exact or range (e.g., ^1.2.3).',
  },

  // --- verbosity: unnecessarily wordy patterns ---
  {
    id: 'async-without-await',
    name: 'async function without await',
    category: 'verbosity',
    severity: 3,
    description: 'An async function that never awaits anything. AI adds async to everything by default.',
    test: function (line, ctx) {
      if (!/\basync\s+(function|\()/.test(line)) return false;
      // Look ahead for await in the function body (simple heuristic: next 20 lines)
      var braceDepth = 0;
      var foundBrace = false;
      for (var i = ctx.lineIndex; i < Math.min(ctx.lineIndex + 30, ctx.lines.length); i++) {
        var checkLine = ctx.lines[i];
        for (var c = 0; c < checkLine.length; c++) {
          if (checkLine[c] === '{') { braceDepth++; foundBrace = true; }
          if (checkLine[c] === '}') braceDepth--;
        }
        if (i > ctx.lineIndex && /\bawait\b/.test(checkLine)) return false;
        if (foundBrace && braceDepth <= 0) break;
      }
      return true;
    },
    fix: 'Remove async keyword if the function never uses await.',
  },

  {
    id: 'unnecessary-else-after-return',
    name: 'Unnecessary else after return',
    category: 'verbosity',
    severity: 2,
    description: 'An else block after a return statement is redundant. AI generates this pattern frequently.',
    test: function (line, ctx) {
      if (!/^\s*\}\s*else\s*\{/.test(line)) return false;
      // Check if previous non-empty line has a return
      for (var i = ctx.lineIndex - 1; i >= 0; i--) {
        var prev = ctx.lines[i].trim();
        if (prev === '') continue;
        return /^\s*return\b/.test(ctx.lines[i]);
      }
      return false;
    },
    fix: 'Remove the else block. The code after the if-return will only run when the condition is false.',
  },

  {
    id: 'redundant-boolean-literal',
    name: 'Redundant boolean comparison',
    category: 'verbosity',
    severity: 2,
    description: 'Comparing a boolean to true/false is redundant. AI generates this pattern routinely.',
    test: function (line) {
      return /===?\s*true\b/.test(line) || /===?\s*false\b/.test(line) ||
             /\btrue\s*===?/.test(line) || /\bfalse\s*===?/.test(line);
    },
    fix: 'Use the boolean directly: `if (value)` instead of comparing to a boolean literal.',
  },

  // ==========================================================================
  // Tier 1 — AI structural patterns
  // ==========================================================================

  {
    id: 'type-theater',
    name: 'TypeScript any type / ts-ignore',
    category: 'type-theater',
    severity: 5,
    description: 'Use of `any` type or @ts-ignore disables the type system. AI uses this to avoid reasoning about types.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      return /:\s*any\b/.test(line) || /\bas\s+any\b/.test(line) ||
             /\/\/\s*@ts-ignore/.test(line) || /\/\/\s*@ts-nocheck/.test(line);
    },
    fix: 'Replace `any` with a concrete type. Use `unknown` if the type is genuinely unknown, then narrow it.',
  },

  {
    id: 'config-exposure',
    name: 'Hardcoded fallback in secret env access',
    category: 'config-exposure',
    severity: 6,
    description: 'process.env.SECRET_X || "hardcoded" exposes a plaintext fallback secret in source code. AI writes this for convenience.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      return /process\.env\.\w*(SECRET|KEY|TOKEN|PASSWORD|AUTH|CREDENTIAL|API)\w*\s*(\|\||&&|\?\?)/.test(line);
    },
    fix: 'Never provide hardcoded fallbacks for secrets. Throw an error if the env var is absent.',
  },

  {
    id: 'error-silencing',
    name: 'Error swallowed without recovery',
    category: 'error-handling',
    severity: 6,
    description: 'catch block that only logs and does not re-throw or recover. Errors disappear silently.',
    test: function (line, ctx) {
      if (!/\bcatch\s*\(/.test(line)) return false;
      // Walk forward through the catch body; if we only find logs/comments before
      // the closing brace, the error is being swallowed.
      for (var i = ctx.lineIndex + 1; i < Math.min(ctx.lineIndex + 12, ctx.lines.length); i++) {
        var t = ctx.lines[i].trim();
        if (t === '' || t === '{') continue;
        if (t === '}' || t === '};' || t === '} catch' || t === '} finally') return true;
        if (/^console\.(error|warn|log|info|debug)\s*\(/.test(t)) continue;
        if (t.startsWith('//') || t.startsWith('*')) continue;
        return false; // real handling found
      }
      return false;
    },
    fix: 'Re-throw, recover, or document explicitly why swallowing the error is intentional here.',
  },

  {
    id: 'async-abuse',
    name: 'async callback inside forEach',
    category: 'async-abuse',
    severity: 6,
    description: 'forEach does not await async callbacks — promises are silently dropped. AI generates this instead of for...of.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      return /\.forEach\s*\(\s*async\s*[\w(]/.test(line) ||
             /\.forEach\s*\(\s*async\s*\(/.test(line);
    },
    fix: 'Replace .forEach(async ...) with for...of + await, or use Promise.all() with .map().',
  },

  {
    id: 'structure-smell',
    name: 'Deeply nested code block',
    category: 'structure-smell',
    severity: 4,
    description: 'Logic nested 5+ levels deep (≥20 spaces). AI rarely refactors, producing deeply nested conditionals.',
    test: function (line) {
      var spaces = 0;
      for (var i = 0; i < line.length; i++) {
        if (line[i] === ' ') spaces++;
        else if (line[i] === '\t') spaces += 4;
        else break;
      }
      var trimmed = line.trim();
      if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed === '};' ||
          trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      if (spaces < 20) return false;
      // Data nesting exclusions: array elements, method calls on this/self,
      // string/number literals, closing brackets, chained property access,
      // continuation lines, constructors, and object-literal entries
      // are structural data — not logic nesting.
      if (/^(this\.|self\.|sb\.)/.test(trimmed)) return false;
      if (/^['"`\d(\[,\])]/.test(trimmed)) return false;
      if (/^\w+\.\w+\(/.test(trimmed) && !/^(if|else|for|while|switch|do|try)\b/.test(trimmed)) return false;
      if (/^(var|let|const)\s/.test(trimmed)) return false;
      // Continuation lines: start with identifier + operator/comma/close, e.g. "w * 0.5, h * 0.3, ..."
      if (/^\w+\s*[*+/,)\]]/.test(trimmed) && !/^(if|else|for|while|switch|do|try)\b/.test(trimmed)) return false;
      // Constructor calls: new Foo(...) is data construction
      if (/^new\s/.test(trimmed)) return false;
      // Object-literal entries: {key: ..., lines starting with closing }
      if (/^\{[\w'"]+\s*:/.test(trimmed)) return false;
      if (/^\}/.test(trimmed)) return false;
      // Property assignments: foo.bar = ..., foo.bar.baz = ... (not control flow)
      if (/^\w+(?:\.\w+)+\s*=/.test(trimmed) && !/^(if|else|for|while|switch|do|try)\b/.test(trimmed)) return false;
      return true;
    },
    fix: 'Extract deeply nested blocks into named helper functions. Aim for ≤3 levels of nesting.',
  },

  {
    id: 'clone-pollution',
    name: 'Near-duplicate function name variants',
    category: 'clone-pollution',
    severity: 4,
    description: 'Multiple functions with the same semantic stem but different verb prefixes (get/fetch/load/read). AI generates redundant variations instead of one canonical function.',
    test: function (line, ctx) {
      var VERBS = ['get', 'fetch', 'load', 'read', 'retrieve', 'obtain'];
      var match = line.match(/\bfunction\s+([a-zA-Z_$]\w+)\s*\(/) ||
                  line.match(/\b(?:const|let|var)\s+([a-zA-Z_$]\w+)\s*=\s*(?:async\s+)?function/);
      if (!match) return false;
      var name = match[1].toLowerCase();
      var verbFound = '';
      for (var v = 0; v < VERBS.length; v++) {
        if (name.indexOf(VERBS[v]) === 0 && name.length > VERBS[v].length + 2) {
          verbFound = VERBS[v];
          break;
        }
      }
      if (!verbFound) return false;
      var stem = name.slice(verbFound.length);
      if (stem.length < 3) return false;
      // Search the whole file for same stem with a different verb — cap at 300 lines for perf
      var limit = Math.min(ctx.lines.length, 300);
      for (var i = 0; i < limit; i++) {
        if (i === ctx.lineIndex) continue;
        var other = ctx.lines[i].match(/\bfunction\s+([a-zA-Z_$]\w+)\s*\(/) ||
                    ctx.lines[i].match(/\b(?:const|let|var)\s+([a-zA-Z_$]\w+)\s*=\s*(?:async\s+)?function/);
        if (!other) continue;
        var otherName = other[1].toLowerCase();
        for (var ov = 0; ov < VERBS.length; ov++) {
          if (ov === VERBS.indexOf(verbFound)) continue;
          if (otherName.indexOf(VERBS[ov]) === 0 && otherName.slice(VERBS[ov].length) === stem) {
            return true;
          }
        }
      }
      return false;
    },
    fix: 'Consolidate into one canonical function with a clear name. AI generates verb-variant duplicates when confused.',
  },

  // ==========================================================================
  // Tier 2 — Code quality signals
  // ==========================================================================

  {
    id: 'naming-entropy',
    name: 'Single-letter variable name',
    category: 'naming-entropy',
    severity: 2,
    description: 'Single-letter variable name in non-loop context. AI sometimes produces this when it runs out of names.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      if (/^\s*for\s*\(/.test(line)) return false;
      var match = line.match(/\b(?:var|let|const)\s+([a-zA-Z])\s*=/);
      if (!match) return false;
      // Standard loop / error / event single-char vars — skip them
      return 'ijkne'.indexOf(match[1].toLowerCase()) === -1;
    },
    fix: 'Use a descriptive name that communicates intent (e.g. `user` instead of `u`).',
  },

  {
    id: 'magic-values',
    name: 'Magic number in logic',
    category: 'magic-values',
    severity: 3,
    description: 'A bare numeric literal ≥1000 embedded in a condition or calculation. AI hardcodes values instead of defining constants.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      // Skip const/UPPER_SNAKE definitions — those are acceptable constant declarations
      if (/^\s*(?:const|var|let)\s+[A-Z_]+\s*=/.test(line)) return false;
      // Skip idiomatic position args in string/array methods — 0, 1, offsets are semantic, not magic
      if (/\b(?:indexOf|lastIndexOf|slice|substring|substr)\s*\(/.test(line)) return false;
      // Number used in a comparison or arithmetic context
      return /[><=!+\-*/%]\s*\d{4,}\b/.test(line) || /\b\d{4,}\s*[><=!+\-*/%]/.test(line);
    },
    fix: 'Extract the number into a named constant that explains what it represents.',
  },

  {
    id: 'import-hygiene',
    name: 'Wildcard namespace import',
    category: 'import-hygiene',
    severity: 3,
    description: '`import * as X` loads the entire module. AI uses this instead of importing only what is needed.',
    test: function (line) {
      return /\bimport\s+\*\s+as\s+\w+/.test(line);
    },
    fix: 'Import only the specific exports you need: `import { specific } from "module"`.',
  },

  {
    id: 'interface-bloat',
    name: 'Oversized interface or type literal',
    category: 'interface-bloat',
    severity: 3,
    description: 'Type or interface with ≥7 properties on one line. AI generates broad contracts without thinking about cohesion.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      // Inline object type with many type-annotated properties
      if ((line.match(/\w+\s*[?]?\s*:/g) || []).length >= 7) return true;
      // Interface definition with many semicolon-separated entries
      if (/\b(?:interface|type)\s+\w+/.test(line) && (line.match(/;/g) || []).length >= 7) return true;
      return false;
    },
    fix: 'Split large interfaces following the Interface Segregation Principle.',
  },

  {
    id: 'complexity-spike',
    name: 'High conditional branch density',
    category: 'complexity-spike',
    severity: 4,
    description: '8+ if statements in a 30-line window. AI rarely extracts helpers, producing complex nested conditionals.',
    test: function (line, ctx) {
      if (!/\bif\s*\(/.test(line)) return false;
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      var start = Math.max(0, ctx.lineIndex - 15);
      var end   = Math.min(ctx.lines.length - 1, ctx.lineIndex + 15);
      var count = 0;
      for (var i = start; i <= end; i++) {
        if (/\bif\s*\(/.test(ctx.lines[i]) && !ctx.lines[i].trim().startsWith('//')) count++;
      }
      return count >= 8;
    },
    fix: 'Extract conditional blocks into named helper functions. Consider a lookup table or strategy pattern.',
  },

  // ==========================================================================
  // Tier 3 — Texture signals
  // ==========================================================================

  {
    id: 'test-theater',
    name: 'Trivially-passing test assertion',
    category: 'test-theater',
    severity: 5,
    description: 'Assertion that always passes regardless of the code under test. Provides false confidence in test coverage.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      return /\bexpect\s*\(\s*true\s*\)\s*\./.test(line) ||
             /\bexpect\s*\(\s*1\s*===\s*1\s*\)/.test(line) ||
             /\bexpect\s*\(\s*1\s*\)\s*\.toBe\s*\(\s*1\s*\)/.test(line) ||
             /\bassert\s*\(\s*true\s*\)/.test(line) ||
             /\bassert\s*\(\s*1\s*===\s*1\s*\)/.test(line) ||
             /\bassert\.ok\s*\(\s*true\s*\)/.test(line) ||
             /\.toBe\s*\(\s*true\s*\)\s*;/.test(line) && /expect\s*\(\s*true\s*\)/.test(line);
    },
    fix: 'Assert against real return values from the code under test, not literal truths.',
  },

  {
    id: 'comment-mismatch',
    name: 'Stub comment inside implemented function',
    category: 'comment-mismatch',
    severity: 3,
    description: 'A "TODO: implement" comment inside a body that already has real logic. Scaffolding was never removed.',
    test: function (line, ctx) {
      if (!/\/\/\s*(TODO|FIXME):?\s*(implement|complete|add|write|fill|finish)/i.test(line)) return false;
      // Only flag if there is real surrounding code (not just braces and blank lines)
      var realCode = 0;
      var start = Math.max(0, ctx.lineIndex - 10);
      var end   = Math.min(ctx.lines.length - 1, ctx.lineIndex + 10);
      for (var i = start; i <= end; i++) {
        if (i === ctx.lineIndex) continue;
        var t = ctx.lines[i].trim();
        if (t.length > 5 && !t.startsWith('//') && !t.startsWith('*') &&
            t !== '{' && t !== '}' && t !== '};') {
          realCode++;
        }
      }
      return realCode >= 5;
    },
    fix: 'Either implement what the comment describes or remove the stub comment.',
  },

  {
    id: 'scaffold-residue',
    name: 'Boilerplate scaffold comment',
    category: 'scaffold-residue',
    severity: 3,
    description: 'Placeholder comment left from a code generator or AI scaffold ("// add your code here").',
    test: function (line) {
      return /\/\/\s*(add|put|write|place|insert)\s+your\s+(code|logic|implementation)/i.test(line) ||
             /\/\/\s*(your\s+logic|your\s+code|implementation\s+here|code\s+here)/i.test(line) ||
             /\/\/\s*implementation\s+pending/i.test(line) ||
             /\/\/\s*\[\s*implementation\s*\]/i.test(line) ||
             /\/\/\s*fill\s+in\s+(this|the)\s+(logic|implementation|rest)/i.test(line);
    },
    fix: 'Remove scaffold placeholders. Implement the logic or delete the comment.',
  },

  {
    id: 'branch-symmetry',
    name: 'Identical if/else return values',
    category: 'branch-symmetry',
    severity: 5,
    description: 'Both branches return the same value — the condition achieves nothing. AI copy-pastes without thinking.',
    test: function (line, ctx) {
      if (!/^\s*\}\s*else\s*(\{|$)/.test(line)) return false;
      // Find the last return before the else
      var prevReturn = '';
      for (var i = ctx.lineIndex - 1; i >= Math.max(0, ctx.lineIndex - 6); i--) {
        var t = ctx.lines[i].trim();
        if (t === '') continue;
        if (/^return\b/.test(t)) { prevReturn = t; break; }
        if (t !== '{' && t !== '}') break;
      }
      if (!prevReturn) return false;
      // Find the first return inside the else block
      for (var j = ctx.lineIndex + 1; j < Math.min(ctx.lines.length, ctx.lineIndex + 6); j++) {
        var t2 = ctx.lines[j].trim();
        if (t2 === '' || t2 === '{') continue;
        return t2 === prevReturn;
      }
      return false;
    },
    fix: 'Remove the if/else — both branches produce the same result. Return unconditionally.',
  },

  // ==========================================================================
  // Tier 4 — Residue signals
  // ==========================================================================

  {
    id: 'promise-graveyard',
    name: 'Floating promise (fire-and-forget async call)',
    category: 'promise-graveyard',
    severity: 6,
    description: 'An async call made without await, .then(), or assignment. The returned promise is abandoned and errors are swallowed.',
    test: function (line) {
      var trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      // Skip lines that assign, await, or chain the result
      if (/^\s*(var|let|const|return|await|throw|if|while|for)\b/.test(line)) return false;
      if (/\.(then|catch|finally)\s*\(/.test(line)) return false;
      if (/=\s*(?:await\s+)?[a-zA-Z]/.test(line)) return false;
      // Standalone call to common async operations
      return /^\s*(?:fetch|axios|request)\s*\(/.test(line) ||
             /^\s*(?:fetch|axios)\.[a-z]+\s*\(/.test(line) ||
             /^\s*(?:db|pool|conn|redis|mongo|pg|mysql)\.[a-z]+\s*\(/.test(line);
    },
    fix: 'Always await async calls or chain .catch() to handle errors. Unhandled rejections crash Node.js.',
  },

  {
    id: 'accessor-bloat',
    name: 'Trivial getter accessor',
    category: 'accessor-bloat',
    severity: 2,
    description: 'A getter that only returns a private backing field adds no value over a plain property.',
    test: function (line, ctx) {
      var trimmed = line.trim();
      var match = trimmed.match(/^get\s+(\w+)\s*\(\s*\)\s*\{?\s*$/);
      if (!match) return false;
      var prop = match[1];
      // Check if the very next non-empty line is `return this._prop`, `return this.prop_`, or `return this.#prop`
      for (var i = ctx.lineIndex + 1; i < Math.min(ctx.lines.length, ctx.lineIndex + 5); i++) {
        var t = ctx.lines[i].trim();
        if (t === '' || t === '{') continue;
        return new RegExp('^return\\s+this[._#]_?' + prop + '_?\\s*;?$', 'i').test(t);
      }
      return false;
    },
    fix: 'Replace a trivial getter with a plain public property unless you need future encapsulation.',
  },
];

module.exports = rules;
