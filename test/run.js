'use strict';

// slopguard test runner — zero dependencies

var path = require('path');
var passed = 0;
var failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    process.stdout.write('  \x1b[32m✓\x1b[0m ' + label + '\n');
  } else {
    failed++;
    process.stderr.write('  \x1b[31m✗\x1b[0m ' + label + '\n');
  }
}

function section(name) {
  process.stdout.write('\n  \x1b[1m' + name + '\x1b[0m\n');
}

// --- Module loading ---
section('Module loading');

try {
  require('../src/index.js');
  assert(true, 'src/index.js loads without error');
} catch (err) {
  assert(false, 'src/index.js loads without error: ' + err.message);
}

var scanner;
try {
  scanner = require('../src/scanner.js');
  assert(true, 'src/scanner.js loads without error');
} catch (err) {
  assert(false, 'src/scanner.js loads without error: ' + err.message);
}

// --- Context classification ---
section('Context classification');

assert(scanner.isBackendFile('server/routes.js') === true, 'server/routes.js is backend');
assert(scanner.isBackendFile('api/users.js') === true, 'api/users.js is backend');
assert(scanner.isBackendFile('src/middleware/auth.js') === true, 'middleware/auth.js is backend');
assert(scanner.isBackendFile('src/controller/home.js') === true, 'controller/home.js is backend');
assert(scanner.isBackendFile('src/utils.js') === false, 'utils.js is not backend');

assert(scanner.isFrontendFile('component/App.jsx') === true, 'component/App.jsx is frontend');
assert(scanner.isFrontendFile('src/pages/Home.tsx') === true, 'pages/Home.tsx is frontend (tsx)');
assert(scanner.isFrontendFile('src/hook/useAuth.js') === true, 'hook/useAuth.js is frontend');
assert(scanner.isFrontendFile('src/store/cart.js') === true, 'store/cart.js is frontend');
assert(scanner.isFrontendFile('src/utils.js') === false, 'utils.js is not frontend');

// --- File discovery ---
section('File discovery');

var fixturesDir = path.join(__dirname, 'fixtures');
var files = scanner.discoverFiles(fixturesDir);

assert(files.length >= 3, 'discovers at least 3 fixture files (found ' + files.length + ')');

var backendFiles = files.filter(function (f) { return f.isBackend; });
var frontendFiles = files.filter(function (f) { return f.isFrontend; });

assert(backendFiles.length >= 1, 'at least 1 backend file detected');
assert(frontendFiles.length >= 1, 'at least 1 frontend file detected');

// Verify file object shape
var firstFile = files[0];
assert(typeof firstFile.filePath === 'string', 'file object has filePath');
assert(typeof firstFile.fileName === 'string', 'file object has fileName');
assert(typeof firstFile.relativePath === 'string', 'file object has relativePath');
assert(typeof firstFile.isBackend === 'boolean', 'file object has isBackend');
assert(typeof firstFile.isFrontend === 'boolean', 'file object has isFrontend');

// Verify skip behavior: walkDir should not enter node_modules
var projectFiles = scanner.discoverFiles(path.join(__dirname, '..'));
var nodeModuleFiles = projectFiles.filter(function (f) {
  return f.filePath.indexOf('node_modules') !== -1;
});
assert(nodeModuleFiles.length === 0, 'walkDir skips node_modules');

// --- Summary ---
process.stdout.write('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
