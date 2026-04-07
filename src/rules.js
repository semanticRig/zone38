'use strict';

// Pattern detection rules for slopguard
// Each rule: { id, name, category, severity, description, test(line, ctx), fix }
// test() is a pure function: returns true if the line is sloppy

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
      // Count ? characters that look like ternary operators (not optional chaining)
      var ternaryCount = (line.match(/[^?.\s]\s*\?\s*[^?.]/g) || []).length;
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
    fix: 'Use the boolean directly: `if (value)` instead of `if (value === true)`.',
  },
];

module.exports = rules;
