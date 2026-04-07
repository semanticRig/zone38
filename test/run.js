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

// --- Rule detection: sloppy fixture ---
section('Rule detection — sloppy.js');

var sloppyResult = scanner.scanFile(path.join(fixturesDir, 'sloppy.js'), fixturesDir);
var sloppyHits = sloppyResult.hits;
var sloppyIds = sloppyHits.map(function (h) { return h.ruleId; });

function hasRule(ids, ruleId) {
  return ids.indexOf(ruleId) !== -1;
}

assert(sloppyHits.length >= 10, 'sloppy.js triggers at least 10 hits (got ' + sloppyHits.length + ')');
assert(hasRule(sloppyIds, 'hallucinated-import-require'), 'detects hallucinated require');
assert(hasRule(sloppyIds, 'todo-fixme-comment'), 'detects TODO/FIXME');
assert(hasRule(sloppyIds, 'hardcoded-secret'), 'detects hardcoded secret');
assert(hasRule(sloppyIds, 'commented-out-code'), 'detects commented-out code');
assert(hasRule(sloppyIds, 'unnecessary-abstraction-factory'), 'detects factory pattern');
assert(hasRule(sloppyIds, 'async-without-await'), 'detects async without await');
assert(hasRule(sloppyIds, 'verbose-null-check'), 'detects verbose null check');
assert(hasRule(sloppyIds, 'console-log-leftover'), 'detects console.log');
assert(hasRule(sloppyIds, 'debugger-statement'), 'detects debugger statement');
assert(hasRule(sloppyIds, 'alert-statement'), 'detects alert()');
assert(hasRule(sloppyIds, 'eval-usage'), 'detects eval()');
assert(hasRule(sloppyIds, 'excessive-ternary-nesting'), 'detects nested ternary');
assert(hasRule(sloppyIds, 'empty-catch-block'), 'detects empty catch block');
assert(hasRule(sloppyIds, 'innerhtml-usage'), 'detects innerHTML');

// --- Rule detection: clean fixture ---
section('Rule detection — clean.js');

var cleanResult = scanner.scanFile(path.join(fixturesDir, 'clean.js'), fixturesDir);
assert(cleanResult.hits.length === 0, 'clean.js triggers zero hits (got ' + cleanResult.hits.length + ')');

// --- Rule detection: context confusion ---
section('Rule detection — server/confused.js');

var confusedResult = scanner.scanFile(path.join(fixturesDir, 'server', 'confused.js'), fixturesDir);
var confusedIds = confusedResult.hits.map(function (h) { return h.ruleId; });

assert(confusedResult.isBackend, 'server/confused.js classified as backend');
assert(hasRule(confusedIds, 'localstorage-in-backend'), 'detects localStorage in backend');
assert(hasRule(confusedIds, 'document-in-backend'), 'detects document in backend');
assert(hasRule(confusedIds, 'window-in-backend'), 'detects window in backend');

// --- Hit object shape ---
section('Hit object shape');

var sampleHit = sloppyHits[0];
assert(typeof sampleHit.ruleId === 'string', 'hit has ruleId');
assert(typeof sampleHit.ruleName === 'string', 'hit has ruleName');
assert(typeof sampleHit.category === 'string', 'hit has category');
assert(typeof sampleHit.severity === 'number', 'hit has severity');
assert(typeof sampleHit.line === 'string', 'hit has line');
assert(typeof sampleHit.lineNumber === 'number', 'hit has lineNumber');
assert(typeof sampleHit.fix === 'string', 'hit has fix');

// --- Entropy module ---
section('Entropy module');

var entropyMod = require('../src/entropy');

// Shannon entropy of a uniform string should be 0
assert(entropyMod.shannonEntropy('aaaaaaaaaa') === 0, 'entropy of uniform string is 0');

// Shannon entropy of diverse string should be high
var diverseEntropy = entropyMod.shannonEntropy('abcdefghijklmnop');
assert(diverseEntropy > 3.5, 'entropy of diverse string > 3.5 (got ' + diverseEntropy.toFixed(2) + ')');

// Charset detection
assert(entropyMod.detectCharset('a3f8b2c1d4e5') === 'hex', 'detects hex charset');
assert(entropyMod.detectCharset('ABCDabcd1234+/==') === 'base64', 'detects base64 charset');

// String extraction
var extracted = entropyMod.extractStrings("var x = 'short'; var y = 'thisIsALongerStringValue123';");
assert(extracted.length === 1, 'extracts only strings >= 16 chars (got ' + extracted.length + ')');

// Safe string detection
assert(entropyMod.isSafeString('https://example.com/api/v1') === true, 'URL is safe');
assert(entropyMod.isSafeString('550e8400-e29b-41d4-a716-446655440000') === true, 'UUID is safe');
assert(entropyMod.isSafeString('Hello and welcome to the app') === true, 'English prose is safe');

// --- Entropy: secrets fixture ---
section('Entropy — secrets.js');

var fs = require('fs');
var secretsContent = fs.readFileSync(path.join(fixturesDir, 'secrets.js'), 'utf8');
var secretFindings = entropyMod.analyzeFileEntropy(secretsContent);

assert(secretFindings.length >= 2, 'secrets.js has at least 2 entropy findings (got ' + secretFindings.length + ')');

// Each finding should have the expected shape
if (secretFindings.length > 0) {
  var sf = secretFindings[0];
  assert(typeof sf.entropy === 'number', 'entropy finding has entropy value');
  assert(typeof sf.charset === 'string', 'entropy finding has charset');
  assert(typeof sf.lineNumber === 'number', 'entropy finding has lineNumber');
  assert(typeof sf.line === 'string', 'entropy finding has line field');
  assert(sf.entropy >= 3.0, 'secret entropy is above threshold (got ' + sf.entropy + ')');
}

// --- Entropy: context-aware discriminant ---
section('Entropy — context-aware discriminant');

// Decision table case 1: OAuth ID with || fallback and _ID LHS — must NOT fire
var oauthLine = "window.EXAMPLE_GITLAB_ID = window.EXAMPLE_GITLAB_ID || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';";
var oauthFindings = entropyMod.analyzeLineEntropy(oauthLine, 1);
assert(oauthFindings.length === 0, 'OAuth hex ID with || fallback does not fire (false positive eliminated)');

// Decision table case 2: sk- prefix with _ID LHS and || fallback — MUST fire (prefix bypass)
var skLine = "window.SOME_ID = window.SOME_ID || 'sk-proj-abc123def456ghi789jkl012mno345pqr678stu901';";
var skFindings = entropyMod.analyzeLineEntropy(skLine, 1);
assert(skFindings.length > 0, 'sk- prefixed key fires despite _ID LHS and || fallback');
assert(skFindings[0].prefixMatch === true, 'sk- key flagged via prefix bypass');

// Decision table case 3: random base64 with public LHS + || fallback — MUST still fire (hard ceiling)
var randLine = "window.SOME_CALLBACK_ID = window.SOME_CALLBACK_ID || 'XqB3mNpK9rT2vY7wZ1sA4dF6hJ8lQeUiOcGbMnRk';";
var randFindings = entropyMod.analyzeLineEntropy(randLine, 1);
assert(randFindings.length > 0, 'random base64 still fires despite public LHS + || (hard ceiling enforced)');

// Decision table case 4: purely random key, no context — fires normally
var plainLine = "var apiSecret = 'XqB3mNpK9rT2vY7wZ1sA4dF6hJ8lQeUiOcGbMnRk';";
var plainFindings = entropyMod.analyzeLineEntropy(plainLine, 1);
assert(plainFindings.length > 0, 'random key with secret LHS fires normally');

// Decision table case 5: known prefix table coverage
var prefixes = ['sk-abc123def456ghi789', 'ghp_abc123def456ghi789jkl', 'AKIAIOSFODNN7EXAMPLE', 'glpat-abcdefghijklmnop'];
for (var pIdx = 0; pIdx < prefixes.length; pIdx++) {
  var pLine = "var x = '" + prefixes[pIdx] + "';";
  var pFindings = entropyMod.analyzeLineEntropy(pLine, 1);
  assert(pFindings.length > 0 && pFindings[0].prefixMatch === true, 'prefix bypass fires for: ' + prefixes[pIdx].split('-')[0] + '...');
}

// For hex, CHARSET_CEILING is null (no ceiling) — context is fully authoritative.
// The adjusted threshold CAN exceed charset_max, which is intentional:
// it means "never flag this hex string in this context" (e.g. OAuth IDs).
var adjustedHex = entropyMod.adjustedThreshold('hex', "window.X_ID = window.X_ID || 'value';");
assert(adjustedHex > entropyMod.CHARSET_MAX.hex, 'adjusted hex threshold exceeds charset max (no ceiling — context is authoritative, got ' + adjustedHex.toFixed(3) + ')');

// For base64, ceiling is enforced: truly random keys (H~5.0+) always fire
var base64Ceiling = entropyMod.CHARSET_CEILING.base64;
var adjustedBase64 = entropyMod.adjustedThreshold('base64', "window.X_ID = window.X_ID || 'value';");
assert(adjustedBase64 <= base64Ceiling, 'adjusted base64 threshold is capped at ceiling (got ' + adjustedBase64.toFixed(3) + ')');

// LHS extraction works
assert(entropyMod.extractLHS("var apiSecret = 'x';") === 'apisecret', 'extracts LHS from var declaration');
assert(entropyMod.extractLHS("window.GITHUB_ID = value;") === 'window.github_id', 'extracts LHS from window assignment');

// --- Entropy: safe strings fixture ---
section('Entropy — safe-strings.js');

var safeContent = fs.readFileSync(path.join(fixturesDir, 'safe-strings.js'), 'utf8');
var safeFindings = entropyMod.analyzeFileEntropy(safeContent);

assert(safeFindings.length === 0, 'safe-strings.js has zero entropy findings (got ' + safeFindings.length + ')');

// --- Entropy integration in scanner ---
section('Entropy integration');

var secretsScan = scanner.scanFile(path.join(fixturesDir, 'secrets.js'), fixturesDir);
assert(Array.isArray(secretsScan.entropyFindings), 'scanFile result includes entropyFindings');
assert(secretsScan.entropyFindings.length >= 2, 'scanFile finds entropy issues in secrets.js');

// --- Compression module ---
section('Compression module');

var compressionMod = require('../src/compression');

// Self-compression ratio should be between 0 and 1 for real code
var humanContent = fs.readFileSync(path.join(fixturesDir, 'clean.js'), 'utf8');
var humanRatio = compressionMod.selfCompressionRatio(humanContent);
assert(humanRatio > 0 && humanRatio < 1, 'self-compression ratio is between 0 and 1 (got ' + humanRatio.toFixed(3) + ')');

// Highly repetitive code should compress more (lower ratio) than irregular code
var repetitive = '';
for (var rep = 0; rep < 50; rep++) {
  repetitive += 'function handler' + rep + '(req, res) {\n';
  repetitive += '  try {\n';
  repetitive += '    const result = await service.process(req.body);\n';
  repetitive += '    res.json({ success: true, data: result });\n';
  repetitive += '  } catch (error) {\n';
  repetitive += '    res.status(500).json({ success: false, error: error.message });\n';
  repetitive += '  }\n';
  repetitive += '}\n\n';
}
var repetitiveRatio = compressionMod.selfCompressionRatio(repetitive);
assert(repetitiveRatio < humanRatio, 'repetitive code compresses more than varied code (' + repetitiveRatio.toFixed(3) + ' < ' + humanRatio.toFixed(3) + ')');

// NCD: a string should have low NCD with itself
var selfNcd = compressionMod.ncd(humanContent, humanContent);
assert(selfNcd < 0.3, 'NCD of content with itself is low (got ' + selfNcd.toFixed(3) + ')');

// NCD: different content should have higher NCD
var sloppyContent = fs.readFileSync(path.join(fixturesDir, 'sloppy.js'), 'utf8');
var diffNcd = compressionMod.ncd(humanContent, sloppyContent);
assert(diffNcd > selfNcd, 'NCD of different files is higher than self-NCD');

// --- Compression analysis with corpora ---
section('Compression analysis');

var corpusDir = path.join(__dirname, '..', 'corpus');
var analysisResult = compressionMod.analyzeCompression(humanContent, corpusDir);
assert(typeof analysisResult.selfRatio === 'number', 'analysis has selfRatio');
assert(typeof analysisResult.compressionScore === 'number', 'analysis has compressionScore');
assert(analysisResult.compressionScore >= 0 && analysisResult.compressionScore <= 100, 'compressionScore is 0-100 (got ' + analysisResult.compressionScore + ')');
assert(analysisResult.ncdHuman !== null, 'analysis has ncdHuman (corpus loaded)');
assert(analysisResult.ncdAI !== null, 'analysis has ncdAI (corpus loaded)');

// --- Compression integration in scanner ---
section('Compression integration');

var cleanScan = scanner.scanFile(path.join(fixturesDir, 'clean.js'), fixturesDir);
assert(cleanScan.compression !== undefined, 'scanFile result includes compression');
assert(typeof cleanScan.compression.selfRatio === 'number', 'compression result has selfRatio');
assert(typeof cleanScan.compression.compressionScore === 'number', 'compression result has compressionScore');

// --- Scoring module ---
section('Scoring module');

var scorerMod = require('../src/scorer');

// Verdict mapping
var v0 = scorerMod.getVerdict(0);
assert(v0.label === 'Clean', 'score 0 = Clean');
var v15 = scorerMod.getVerdict(15);
assert(v15.label === 'Some slop', 'score 15 = Some slop');
var v60 = scorerMod.getVerdict(60);
assert(v60.label === 'Heavy slop', 'score 60 = Heavy slop');
var v90 = scorerMod.getVerdict(90);
assert(v90.label === 'Catastrophic', 'score 90 = Catastrophic');

// Pattern score
assert(scorerMod.patternScore([]) === 0, 'patternScore of empty hits is 0');
var fakeHits = [{ severity: 5 }, { severity: 7 }, { severity: 3 }];
var pScore = scorerMod.patternScore(fakeHits);
assert(pScore > 0 && pScore <= 100, 'patternScore of hits is > 0 (got ' + pScore + ')');

// Entropy score
assert(scorerMod.entropyScore([]) === 0, 'entropyScore of no findings is 0');
assert(scorerMod.entropyScore([{ entropy: 5 }]) > 0, 'entropyScore of 1 finding is > 0');

// File scoring
var sloppyScan = scanner.scanFile(path.join(fixturesDir, 'sloppy.js'), fixturesDir);
var sloppyScored = scorerMod.scoreFile(sloppyScan);
assert(sloppyScored.score > 0, 'sloppy.js score > 0 (got ' + sloppyScored.score + ')');
assert(typeof sloppyScored.verdict.label === 'string', 'scored file has verdict label');
assert(typeof sloppyScored.breakdown.patterns === 'number', 'scored file has pattern breakdown');
assert(typeof sloppyScored.breakdown.compression === 'number', 'scored file has compression breakdown');

var cleanScored = scorerMod.scoreFile(cleanScan);
assert(cleanScored.score < sloppyScored.score, 'clean.js scores lower than sloppy.js (' + cleanScored.score + ' < ' + sloppyScored.score + ')');

// --- Project scoring (scanAll integration) ---
section('Project scoring');

var scanResult = scanner.scanAll(fixturesDir);
assert(scanResult.files !== undefined, 'scanAll returns files array');
assert(scanResult.project !== undefined, 'scanAll returns project score');
assert(typeof scanResult.project.score === 'number', 'project has score');
assert(scanResult.project.score >= 0 && scanResult.project.score <= 100, 'project score is 0-100 (got ' + scanResult.project.score + ')');
assert(typeof scanResult.project.verdict.label === 'string', 'project has verdict label');
assert(scanResult.project.fileCount > 0, 'project fileCount > 0');
assert(typeof scanResult.project.totalHits === 'number', 'project has totalHits');
assert(scanResult.project.fileScores.length === scanResult.project.fileCount, 'fileScores count matches fileCount');

// Self-scan: slopguard on itself should score low
var selfScan = scanner.scanAll(path.join(__dirname, '..'));
assert(selfScan.project.score < 25, 'slopguard self-scan score < 25 (got ' + selfScan.project.score + ')');

// --- MCP config scanner ---
section('MCP config scanner');

var mcpFixtureDir = path.join(fixturesDir, 'mcp-project');
var mcpCleanDir = path.join(fixturesDir, 'mcp-clean');

// Risky MCP config should produce findings
var riskyFindings = scanner.scanMCPConfig(mcpFixtureDir);
assert(riskyFindings.length > 0, 'risky MCP config produces findings (got ' + riskyFindings.length + ')');

// Check for specific risky patterns
var shellFound = riskyFindings.some(function (f) { return f.id === 'mcp-shell-exec'; });
assert(shellFound, 'detects shell exec in MCP config');

var keyFound = riskyFindings.some(function (f) { return f.id === 'mcp-hardcoded-key'; });
assert(keyFound, 'detects hardcoded API key in MCP config');

var httpFound = riskyFindings.some(function (f) { return f.id === 'mcp-insecure-http'; });
assert(httpFound, 'detects insecure HTTP endpoint in MCP config');

var wildcardFound = riskyFindings.some(function (f) { return f.id === 'mcp-wildcard-permissions'; });
assert(wildcardFound, 'detects wildcard permissions in MCP config');

// Each finding has required shape
for (var mIdx = 0; mIdx < riskyFindings.length; mIdx++) {
  var mf = riskyFindings[mIdx];
  assert(typeof mf.id === 'string', 'MCP finding has id');
  assert(typeof mf.name === 'string', 'MCP finding has name');
  assert(typeof mf.severity === 'number', 'MCP finding has severity');
  assert(typeof mf.fix === 'string', 'MCP finding has fix');
  assert(typeof mf.configFile === 'string', 'MCP finding has configFile');
  assert(typeof mf.path === 'string', 'MCP finding has path');
}

// Clean MCP config should produce zero findings
var cleanFindings = scanner.scanMCPConfig(mcpCleanDir);
assert(cleanFindings.length === 0, 'clean MCP config produces zero findings (got ' + cleanFindings.length + ')');

// Non-existent MCP config should produce zero findings
var noMCPFindings = scanner.scanMCPConfig(fixturesDir);
assert(noMCPFindings.length === 0, 'directory without MCP configs produces zero findings');

// scanAll with mcp option should include mcpFindings
var mcpScanResult = scanner.scanAll(mcpFixtureDir, { mcp: true });
assert(mcpScanResult.mcpFindings !== undefined, 'scanAll with mcp returns mcpFindings');
assert(mcpScanResult.mcpFindings.length > 0, 'scanAll with mcp has findings for risky config');
assert(typeof mcpScanResult.project.totalMCPFindings === 'number', 'project score includes totalMCPFindings');

// scanAll without mcp option should have empty mcpFindings
var noMCPScanResult = scanner.scanAll(mcpFixtureDir);
assert(noMCPScanResult.mcpFindings.length === 0, 'scanAll without mcp has no MCP findings');

// --- Summary ---
process.stdout.write('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
