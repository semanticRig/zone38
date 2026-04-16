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

// --- Entropy module (hybrid pipeline) ---
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

// Pipeline signal: known safe string should have low score
var safePipeline = entropyMod.pipelineAnalyze('this is a completely normal english sentence used for testing only');
assert(safePipeline.score < 50, 'pipeline: normal text scores low (' + safePipeline.score.toFixed(1) + ')');

// Pipeline signal: random secret should have high score
var secretPipeline = entropyMod.pipelineAnalyze('Xk7mR9qL2wF5nT3vBj8Yp4sAc6dGh1');
assert(secretPipeline.score > 50, 'pipeline: random secret scores high (' + secretPipeline.score.toFixed(1) + ')');

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

// --- Entropy: pipeline discriminant ---
section('Entropy — pipeline discriminant');

// sk- prefix with _ID LHS and || fallback — MUST fire (prefix bypass)
var skLine = "window.SOME_ID = window.SOME_ID || 'sk-proj-abc123def456ghi789jkl012mno345pqr678stu901';";
var skFindings = entropyMod.analyzeLineEntropy(skLine, 1);
assert(skFindings.length > 0, 'sk- prefixed key fires despite _ID LHS and || fallback');
assert(skFindings[0].prefixMatch === true, 'sk- key flagged via prefix bypass');

// Random base64 with public LHS + || fallback — pipeline should flag
var randLine = "window.SOME_CALLBACK_ID = window.SOME_CALLBACK_ID || 'XqB3mNpK9rT2vY7wZ1sA4dF6hJ8lQeUiOcGbMnRk';";
var randFindings = entropyMod.analyzeLineEntropy(randLine, 1);
assert(randFindings.length > 0, 'random base64 fires via pipeline signals');

// Purely random key, no context — fires normally
var plainLine = "var apiSecret = 'XqB3mNpK9rT2vY7wZ1sA4dF6hJ8lQeUiOcGbMnRk';";
var plainFindings = entropyMod.analyzeLineEntropy(plainLine, 1);
assert(plainFindings.length > 0, 'random key fires normally');

// Known prefix table coverage
var prefixes = ['sk-abc123def456ghi789', 'ghp_abc123def456ghi789jkl', 'AKIAIOSFODNN7EXAMPLE', 'glpat-abcdefghijklmnop'];
for (var pIdx = 0; pIdx < prefixes.length; pIdx++) {
  var pLine = "var x = '" + prefixes[pIdx] + "';";
  var pFindings = entropyMod.analyzeLineEntropy(pLine, 1);
  assert(pFindings.length > 0 && pFindings[0].prefixMatch === true, 'prefix bypass fires for: ' + prefixes[pIdx].split('-')[0] + '...');
}

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

// --- Decomposer ---
section('Decomposer');

var decomposer = require('../src/decomposer.js');

// Strategy 1: Semicolon-delimited key=value (mxGraph style)
var mxResult = decomposer.decompose('sketch=0;rounded=1;arcSize=50;fillColor=#3aa7ff;strokeColor=#dddddd');
assert(mxResult.decomposed === true, 'mxGraph style string is decomposed');
assert(mxResult.values.indexOf('#3aa7ff') !== -1, 'mxGraph decomposed values contain #3aa7ff');
assert(mxResult.values.indexOf('0') !== -1, 'mxGraph decomposed values contain 0');

// Strategy 1: Compound string with embedded secret
var compoundResult = decomposer.decompose('user=admin;password=Xk7mR9qL2;host=db.prod.internal');
assert(compoundResult.decomposed === true, 'compound key=value string is decomposed');
assert(compoundResult.values.indexOf('Xk7mR9qL2') !== -1, 'embedded password is extracted as value');
assert(compoundResult.values.indexOf('admin') !== -1, 'admin is extracted as value');

// Strategy 2: Comma-delimited key:value
var commaResult = decomposer.decompose('name:Alice,role:admin,level:5');
assert(commaResult.decomposed === true, 'comma-delimited key:value is decomposed');
assert(commaResult.values.length === 3, 'comma strategy extracts 3 values');

// Strategy 4: URL with query params
var urlResult = decomposer.decompose('https://api.example.com/v1?user=bob&token=abc123&format=json');
assert(urlResult.decomposed === true, 'URL with query params is decomposed');
assert(urlResult.values.indexOf('abc123') !== -1, 'URL param value abc123 extracted');

// Strategy 5: JSON fragment
var jsonResult = decomposer.decompose('{"name": "Alice", "role": "admin"}');
assert(jsonResult.decomposed === true, 'JSON fragment is decomposed');
assert(jsonResult.values.indexOf('Alice') !== -1, 'JSON value Alice extracted');
assert(jsonResult.values.indexOf('admin') !== -1, 'JSON value admin extracted');

// No strategy: plain string passes through
var plainResult = decomposer.decompose('sk_live_abc123def456ghi789jkl012mno345');
assert(plainResult.decomposed === false, 'plain API key is NOT decomposed');
assert(plainResult.values.length === 1, 'plain string has 1 value (itself)');
assert(plainResult.values[0] === 'sk_live_abc123def456ghi789jkl012mno345', 'plain string value matches original');

// Empty values dropped
var emptyValResult = decomposer.decompose('a=;b=;c=;d=hello');
assert(emptyValResult.decomposed === true, 'string with empty values is decomposed');
assert(emptyValResult.values.indexOf('') === -1, 'empty values are dropped');

// Edge: null/empty input
var nullResult = decomposer.decompose('');
assert(nullResult.decomposed === false, 'empty string returns decomposed: false');
assert(nullResult.values.length === 0, 'empty string returns empty values');

// --- Character Frequency ---
section('Character frequency signal');

var charFreq = require('../src/char-frequency.js');

// API key: near-uniform distribution → high signal
var apiKeySignal = charFreq.charFrequencySignal('sk_live_abc123def456ghi789jkl012mno345');
assert(apiKeySignal.signal > 0.4, 'API key has high char frequency signal (' + apiKeySignal.signal.toFixed(3) + ')');
assert(apiKeySignal.charEntropy > 3.0, 'API key has high Shannon entropy (' + apiKeySignal.charEntropy.toFixed(3) + ')');

// Code-like string: mostly lowercase → low signal
var codeSignal = charFreq.charFrequencySignal('this is a normal variable name for testing');
assert(codeSignal.signal < 0.5, 'code-like string has low char frequency signal (' + codeSignal.signal.toFixed(3) + ')');

// Color hex: mostly hex chars → should not be extreme
var hexSignal = charFreq.charFrequencySignal('#3aa7ff');
assert(typeof hexSignal.signal === 'number', 'hex color returns a numeric signal');

// Empty/short edge cases
var emptySignal = charFreq.charFrequencySignal('');
assert(emptySignal.signal === 0.5, 'empty string returns neutral signal 0.5');
assert(emptySignal.charEntropy === 0, 'empty string has 0 entropy');

var singleSignal = charFreq.charFrequencySignal('a');
assert(singleSignal.signal === 0.5, 'single char returns neutral signal 0.5');
assert(singleSignal.charEntropy === 0, 'single char has 0 entropy');

// Shannon entropy: known value
var entropyVal = charFreq.shannonEntropy('aabb');
assert(entropyVal === 1, 'Shannon entropy of aabb is 1.0');

// --- Bigram Entropy ---
section('Bigram entropy signal');

var bigram = require('../src/bigram.js');

// Random-looking secret: high bigram signal
var secretCharResult = charFreq.charFrequencySignal('Xk7mR9qL2wF5nT3vBj8');
var secretBigram = bigram.bigramSignal('Xk7mR9qL2wF5nT3vBj8', secretCharResult.charEntropy);
assert(secretBigram > 0.5, 'random secret has high bigram signal (' + secretBigram.toFixed(3) + ')');

// Structured string: lower bigram signal
var structCharResult = charFreq.charFrequencySignal('aaabbbcccdddeeefffggg');
var structBigram = bigram.bigramSignal('aaabbbcccdddeeefffggg', structCharResult.charEntropy);
assert(structBigram < 0.5, 'structured string has low bigram signal (' + structBigram.toFixed(3) + ')');

// Short string: neutral
var shortBigram = bigram.bigramSignal('abc', 1.5);
assert(shortBigram === 0.5, 'short string returns neutral bigram signal 0.5');

// Zero entropy: neutral
var zeroBigram = bigram.bigramSignal('aaaa', 0);
assert(zeroBigram === 0.5, 'zero entropy string returns neutral bigram signal 0.5');

// --- Compression signal (string-level) ---
section('Compression signal (string-level)');

var compression = require('../src/compression.js');

// Short string: returns null
var shortCompSig = compression.compressionSignal('short');
assert(shortCompSig === null, 'string <= 50 chars returns null');

var fiftyChar = compression.compressionSignal('abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmn');
assert(fiftyChar === null, 'exactly 50 chars returns null');

// Long random string: high signal (resists compression)
var randomStr = 'Xk7mR9qL2wF5nT3vBj8Yp4sAc6dGh1Xk7mR9qL2wF5nT3vBj8Yp4sAc6dGh1wQ9zE2rU4tI6';
var randomSig = compression.compressionSignal(randomStr + randomStr.substring(0, 10));
assert(randomSig !== null, 'long random string returns non-null signal');
assert(randomSig > 0.5, 'random string has high compression signal (' + randomSig.toFixed(3) + ')');

// Long repetitive string: low signal (compresses well)
var repetitive = '';
for (var ri = 0; ri < 10; ri++) repetitive += 'function getData() { return data; } ';
var repSig = compression.compressionSignal(repetitive);
assert(repSig !== null, 'long repetitive string returns non-null signal');
assert(repSig < 0.5, 'repetitive string has low compression signal (' + repSig.toFixed(3) + ')');

// Empty/null: returns null
assert(compression.compressionSignal('') === null, 'empty string returns null');
assert(compression.compressionSignal(null) === null, 'null returns null');

// --- Aggregator ---
section('Aggregator');

var aggregator = require('../src/aggregator.js');

// All signals agree safe (below 0.25)
var safeDec = aggregator.aggregate(0.1, 0.2, 0.15);
assert(safeDec.decided === true, 'all-safe signals: decided=true');
assert(safeDec.ambiguous === false, 'all-safe signals: ambiguous=false');
assert(safeDec.score < 10, 'all-safe signals: score < 10 (got ' + safeDec.score.toFixed(1) + ')');

// All signals agree secret (above 0.75)
var secretDec = aggregator.aggregate(0.85, 0.90, 0.80);
assert(secretDec.decided === true, 'all-secret signals: decided=true');
assert(secretDec.ambiguous === false, 'all-secret signals: ambiguous=false');
assert(secretDec.score >= 80, 'all-secret signals: score >= 80 (got ' + secretDec.score.toFixed(1) + ')');

// Signals disagree (spread > 0.35)
var disagreeDec = aggregator.aggregate(0.2, 0.8, 0.5);
assert(disagreeDec.decided === false, 'disagreeing signals: decided=false');
assert(disagreeDec.ambiguous === true, 'disagreeing signals: ambiguous=true');

// Twilight zone: all signals 0.4-0.6, none extreme
var twilightDec = aggregator.aggregate(0.45, 0.55, 0.50);
assert(twilightDec.decided === false, 'twilight signals: decided=false');
assert(twilightDec.ambiguous === true, 'twilight signals: ambiguous=true');

// Default: mild lean safe (avg < 0.40)
var leanSafeDec = aggregator.aggregate(0.2, 0.3, 0.25);
assert(leanSafeDec.decided === true, 'lean-safe signals: decided=true');
assert(leanSafeDec.score < 40, 'lean-safe signals: score < 40 (got ' + leanSafeDec.score.toFixed(1) + ')');

// Default: mild lean secret (avg > 0.60)
var leanSecretDec = aggregator.aggregate(0.65, 0.70, 0.60);
assert(leanSecretDec.decided === true, 'lean-secret signals: decided=true');
assert(leanSecretDec.score > 60, 'lean-secret signals: score > 60 (got ' + leanSecretDec.score.toFixed(1) + ')');

// Two signals only (compressionSignal null)
var twoSigDec = aggregator.aggregate(0.1, 0.15, null);
assert(twoSigDec.decided === true, 'two safe signals (null compression): decided=true');
assert(twoSigDec.score < 10, 'two safe signals (null compression): low score');

// --- Vector engine ---
section('Vector engine (6-dim)');

var vector = require('../src/vector.js');

// Real API key → score >= 0.5 (secret)
var apiKeyScore = vector.vectorScore('sk_live_abc123def456ghi789jkl012mno345');
assert(apiKeyScore >= 0.5, 'API key vectorScore >= 0.5 (got ' + apiKeyScore.toFixed(3) + ')');

// Random secret → score >= 0.5
var randomSecretScore = vector.vectorScore('Xk7mR9qL2wF5nT3vBj8Yp4sAc6dGh1');
assert(randomSecretScore >= 0.5, 'random secret vectorScore >= 0.5 (got ' + randomSecretScore.toFixed(3) + ')');

// English-like string → score < 0.5 (not secret)
var englishScore = vector.vectorScore('this is a normal english sentence for testing purposes');
assert(englishScore < 0.5, 'English text vectorScore < 0.5 (got ' + englishScore.toFixed(3) + ')');

// Code-like string → score < 0.5
var codeScore = vector.vectorScore('function getdata() { return this.data || defaultvalue; }');
assert(codeScore < 0.5, 'code string vectorScore < 0.5 (got ' + codeScore.toFixed(3) + ')');

// Dimension smoke tests
assert(vector.dimEntropy('aaaa') === 0, 'dimEntropy of uniform string is 0');
assert(vector.dimEntropy('abcd') > 0.5, 'dimEntropy of diverse short string > 0.5');
assert(vector.dimAlternation('aaaa') === 0, 'dimAlternation of same-type chars is 0');
assert(vector.dimAlternation('aA1!') === 1, 'dimAlternation of all-different types is 1');
assert(vector.dimCompressibility('abc') >= 0, 'dimCompressibility handles short strings');

// Empty string edge case
assert(vector.vectorScore('') === 0, 'empty string vectorScore is 0');

// --- L00 Ingestion ---
section('L00 — Project ingestion');

var L00 = require('../src/pipeline/L00-ingestion.js');

var registry = L00.buildRegistry(path.join(__dirname, 'fixtures'));
assert(Array.isArray(registry), 'buildRegistry returns an array');
assert(registry.length >= 3, 'registry has at least 3 fixture files (got ' + registry.length + ')');

// Shape check
var r0 = registry[0];
assert(typeof r0.path === 'string', 'record has path');
assert(typeof r0.relativePath === 'string', 'record has relativePath');
assert(typeof r0.ext === 'string', 'record has ext');
assert(typeof r0.size === 'number', 'record has size');
assert(typeof r0.depth === 'number', 'record has depth');
assert(typeof r0.territory === 'string', 'record has territory');
assert(r0.role === null, 'role is null before L01 runs');

// Territory classification
assert(L00.classifyTerritory('src/server/routes.js') === 'application', 'server/routes.js → application');
assert(L00.classifyTerritory('test/fixtures/clean.js') === 'test', 'test/fixtures/clean.js → test');
assert(L00.classifyTerritory('dist/bundle.js') === 'dist', 'dist/bundle.js → dist');
assert(L00.classifyTerritory('vendor/lodash.js') === 'vendor', 'vendor/lodash.js → vendor');
assert(L00.classifyTerritory('src/config/settings.js') === 'config', 'config/settings.js → config');
assert(L00.classifyTerritory('src/utils.js') === 'application', 'utils.js → application');

// Should skip node_modules
var projectReg = L00.buildRegistry(path.join(__dirname, '..'));
var nodeModFiles = projectReg.filter(function (r) { return r.path.indexOf('node_modules') !== -1; });
assert(nodeModFiles.length === 0, 'buildRegistry skips node_modules');

// test fixtures themselves should appear as territory=test or application depending on path
var serverRecords = registry.filter(function (r) { return r.relativePath.indexOf('server') !== -1; });
assert(serverRecords.length >= 1, 'server/ fixture files appear in registry');

// --- L01 Role classification ---
section('L01 — File role classification');

var L01 = require('../src/pipeline/L01-role.js');

// Backend
var backendRecord = { relativePath: 'src/api/users.js', ext: '.js', territory: 'application' };
var backendRole = L01.classifyRole(backendRecord);
assert(backendRole.isBackend === true, 'api/users.js classified as backend');
assert(backendRole.isFrontend === false, 'api/users.js not classified as frontend');
assert(backendRole.contextType === 'backend', 'api/users.js contextType = backend');

// Frontend JSX
var frontendRecord = { relativePath: 'src/component/App.jsx', ext: '.jsx', territory: 'application' };
var frontendRole = L01.classifyRole(frontendRecord);
assert(frontendRole.isFrontend === true, 'component/App.jsx classified as frontend');
assert(frontendRole.isBackend === false, 'component/App.jsx not classified as backend');
assert(frontendRole.contextType === 'frontend', 'component/App.jsx contextType = frontend');

// Declaration file
var dtsRecord = { relativePath: 'types/index.d.ts', ext: '.ts', territory: 'application' };
var dtsRole = L01.classifyRole(dtsRecord);
assert(dtsRole.isDeclaration === true, 'index.d.ts isDeclaration = true');
assert(dtsRole.fileType === 'declaration', 'index.d.ts fileType = declaration');

// Test file
var testRecord = { relativePath: 'test/fixtures/clean.js', ext: '.js', territory: 'test' };
var testRole = L01.classifyRole(testRecord);
assert(testRole.isTest === true, 'test fixture isTest = true');

// role is set on the record in place
assert(testRecord.role !== null, 'classifyRole mutates fileRecord.role in place');
assert(testRecord.role.isTest === true, 'mutated role.isTest = true');

// Isomorphic (neither backend nor frontend signals)
var isoRecord = { relativePath: 'src/utils.js', ext: '.js', territory: 'application' };
var isoRole = L01.classifyRole(isoRecord);
assert(isoRole.contextType === 'isomorphic', 'utils.js contextType = isomorphic');

// L01 applied to full registry
var fullReg = L00.buildRegistry(path.join(__dirname, 'fixtures'));
fullReg.forEach(function (rec) { L01.classifyRole(rec); });
var allHaveRole = fullReg.every(function (rec) { return rec.role !== null; });
assert(allHaveRole, 'all registry records have role after L01 applied to registry');

// --- L02 Surface Characterisation ---
section('L02 — Surface characterisation');

var L02 = require('../src/pipeline/L02-surface.js');

// Minified fixture: single long line → minified: true
var minifiedContent = fs.readFileSync(path.join(fixturesDir, 'minified.js'), 'utf8');
var minifiedSurface = L02.characteriseFile(minifiedContent);
assert(minifiedSurface.minified === true, 'minified.js → minified: true');

// Repetitive fixture: many near-identical blocks → repetitionFraction > 0.4
var repetitiveContent = fs.readFileSync(path.join(fixturesDir, 'repetitive.js'), 'utf8');
var repSurface = L02.characteriseFile(repetitiveContent);
assert(repSurface.repetitionFraction > 0.4, 'repetitive.js → repetitionFraction > 0.4 (got ' + repSurface.repetitionFraction.toFixed(3) + ')');
assert(repSurface.minified === false, 'repetitive.js → minified: false');

// Clean fixture: normal human JS → both flags false
var cleanContent = fs.readFileSync(path.join(fixturesDir, 'clean.js'), 'utf8');
var cleanSurface = L02.characteriseFile(cleanContent);
assert(cleanSurface.minified === false, 'clean.js → minified: false');
assert(cleanSurface.repetitionFraction < 0.4, 'clean.js → repetitionFraction < 0.4 (got ' + cleanSurface.repetitionFraction.toFixed(3) + ')');

// Surface shape
assert(typeof cleanSurface.routingDensity === 'number', 'surface has routingDensity');
assert(typeof cleanSurface.avgLineLength === 'number', 'surface has avgLineLength');
assert(Array.isArray(cleanSurface.lineDistribution), 'surface has lineDistribution array');
assert(cleanSurface.lineDistribution.length === 4, 'lineDistribution has 4 buckets');
assert(typeof cleanSurface.whitespaceRatio === 'number', 'surface has whitespaceRatio');

// routingDensity is between 0 and 1
assert(cleanSurface.routingDensity >= 0 && cleanSurface.routingDensity <= 1, 'routingDensity in [0,1] (got ' + cleanSurface.routingDensity.toFixed(3) + ')');

// whitespaceRatio is between 0 and 1
assert(cleanSurface.whitespaceRatio > 0 && cleanSurface.whitespaceRatio < 1, 'whitespaceRatio in (0,1) (got ' + cleanSurface.whitespaceRatio.toFixed(3) + ')');

// lineDistribution sums to ~1
var distSum = cleanSurface.lineDistribution.reduce(function (a, b) { return a + b; }, 0);
assert(Math.abs(distSum - 1) < 0.01, 'lineDistribution sums to 1 (got ' + distSum.toFixed(3) + ')');

// Empty content → safe zero values
var emptySurface = L02.characteriseFile('');
assert(emptySurface.minified === false, 'empty content → minified: false');
assert(emptySurface.repetitionFraction === 0, 'empty content → repetitionFraction: 0');

// characteriseRecord mutates fileRecord.surface in place
var fakeRecord = { relativePath: 'test.js', surface: null };
L02.characteriseRecord(fakeRecord, cleanContent);
assert(fakeRecord.surface !== null, 'characteriseRecord sets fileRecord.surface');
assert(typeof fakeRecord.surface.routingDensity === 'number', 'characteriseRecord result has routingDensity');

// --- L03 Compression Texture Analysis ---
section('L03 — Compression texture analysis');

var L03 = require('../src/pipeline/L03-compression.js');

// selfCompressionRatio: between 0 and 1 for real code
var l03Human = fs.readFileSync(path.join(fixturesDir, 'clean.js'), 'utf8');
var l03HumanRatio = L03.selfCompressionRatio(l03Human);
assert(l03HumanRatio > 0 && l03HumanRatio < 1, 'L03 self-ratio for human code in (0,1) (got ' + l03HumanRatio.toFixed(3) + ')');

// Repetitive AI fixture compresses more (lower ratio) than varied human code
var l03RepContent = fs.readFileSync(path.join(fixturesDir, 'repetitive.js'), 'utf8');
var l03RepRatio = L03.selfCompressionRatio(l03RepContent);
assert(l03RepRatio < l03HumanRatio, 'repetitive.js self-ratio < clean.js self-ratio (' + l03RepRatio.toFixed(3) + ' < ' + l03HumanRatio.toFixed(3) + ')');

// NCD: content with itself should be low
var l03SelfNcd = L03.ncd(l03Human, l03Human);
assert(l03SelfNcd < 0.3, 'NCD(content, itself) < 0.3 (got ' + l03SelfNcd.toFixed(3) + ')');

// NCD: different content should be higher than self-NCD
var l03Sloppy = fs.readFileSync(path.join(fixturesDir, 'sloppy.js'), 'utf8');
var l03DiffNcd = L03.ncd(l03Human, l03Sloppy);
assert(l03DiffNcd > l03SelfNcd, 'NCD of different files > self-NCD');

// segmentedCompression: returns array of segment objects
var l03Segments = L03.segmentedCompression(l03RepContent, 10);
assert(Array.isArray(l03Segments), 'segmentedCompression returns array');
assert(l03Segments.length > 1, 'segmented result has more than 1 window (got ' + l03Segments.length + ')');
assert(typeof l03Segments[0].startLine === 'number', 'segment has startLine');
assert(typeof l03Segments[0].endLine === 'number', 'segment has endLine');
assert(typeof l03Segments[0].ratio === 'number', 'segment has ratio');

// Short file: returns single segment
var l03Short = 'var x = 1;\nvar y = 2;\n';
var l03ShortSeg = L03.segmentedCompression(l03Short, 30);
assert(l03ShortSeg.length === 1, 'short file → single segment');

// analyseFile: populates fileRecord.compression
var l03Record = { relativePath: 'clean.js', compression: null };
var l03Result = L03.analyseFile(l03Record, l03Human);
assert(l03Record.compression !== null, 'analyseFile mutates fileRecord.compression');
assert(typeof l03Result.selfRatio === 'number', 'result has selfRatio');
assert(typeof l03Result.compressionScore === 'number', 'result has compressionScore');
assert(l03Result.compressionScore >= 0 && l03Result.compressionScore <= 100, 'compressionScore in [0,100]');
assert(Array.isArray(l03Result.segmentScores), 'result has segmentScores array');
assert(l03Result.projectOutlierScore === 0, 'projectOutlierScore is 0 placeholder until L12');

// analyseFile with null fileRecord (standalone call)
var l03Standalone = L03.analyseFile(null, l03Human);
assert(typeof l03Standalone.selfRatio === 'number', 'standalone analyseFile returns result');

// Repetitive fixture should score higher than clean fixture
var l03RepResult = L03.analyseFile(null, l03RepContent);
assert(l03RepResult.compressionScore >= l03Result.compressionScore, 'repetitive.js compression score >= clean.js (' + l03RepResult.compressionScore + ' >= ' + l03Result.compressionScore + ')');

// --- L04 Entity Harvesting ---
section('L04 Entity Harvesting');

var L04 = require('../src/pipeline/L04-harvest.js');

// String extraction: basic single and double quoted
var l04Line1 = "var DB_HOST = 'db.prod.internal';";
var l04Strings1 = L04._extractStringsFromLine(l04Line1, 0);
assert(l04Strings1.length >= 1, 'extractStringsFromLine finds single-quoted string');
assert(l04Strings1[0].value === 'db.prod.internal', 'extracted value matches');
assert(l04Strings1[0].identifierName === 'DB_HOST', 'extracted identifierName matches');
assert(l04Strings1[0].lineIndex === 0, 'lineIndex is 0');
assert(l04Strings1[0].type === 'string', 'type is string');

// String extraction: double-quoted
var l04Line2 = 'var region = "us-east-1";';
var l04Strings2 = L04._extractStringsFromLine(l04Line2, 5);
assert(l04Strings2.length >= 1, 'extractStringsFromLine finds double-quoted string');
assert(l04Strings2[0].lineIndex === 5, 'lineIndex is 5');

// URL extraction: extracts https URL
var l04LineUrl = 'var endpoint = "https://api.example.com/v2/data";';
var l04Urls = L04._extractUrlsFromLine(l04LineUrl, 2);
assert(l04Urls.length >= 1, 'extractUrlsFromLine finds URL');
assert(l04Urls[0].type === 'url', 'URL candidate has type url');
assert(l04Urls[0].value.indexOf('https://') === 0, 'URL value starts with https://');

// URL extraction: skips comment-only lines
var l04LineComment = '// see https://docs.example.com for details';
var l04CommentUrls = L04._extractUrlsFromLine(l04LineComment, 0);
assert(l04CommentUrls.length === 0, 'URL extraction skips comment lines');

// Short strings below MIN_LEN are dropped
var l04ShortLine = "var x = 'ab';";
var l04Short = L04._extractStringsFromLine(l04ShortLine, 0);
assert(l04Short.length === 0, 'strings < 4 chars are discarded');

// Gravity Welder: non-adjacent items are not fused
var l04Cands = [
  { value: 'hello', line: 'hello', col: 0, lineIndex: 0, identifierName: null, callSiteContext: null, type: 'string', priority: 'normal' },
  { value: 'world', line: 'world', col: 0, lineIndex: 5, identifierName: null, callSiteContext: null, type: 'string', priority: 'normal' },
];
var l04Welded = L04._gravityWeld(l04Cands);
assert(l04Welded.length === 2, 'gravity weld: non-adjacent candidates not fused (lineDelta > 1)');

// harvestEntities: fixture produces candidates and mutates record
var l04FixtureContent = require('fs').readFileSync(path.join(fixturesDir, 'harvest-config.js'), 'utf8');
var l04Record = { candidates: null };
var l04Candidates = L04.harvestEntities(l04FixtureContent, l04Record);
assert(Array.isArray(l04Candidates), 'harvestEntities returns array');
assert(l04Candidates.length > 0, 'fixture produces at least one candidate (got ' + l04Candidates.length + ')');
assert(l04Record.candidates === l04Candidates, 'harvestEntities mutates fileRecord.candidates');

// harvestEntities with null record (standalone call)
var l04Standalone = L04.harvestEntities(l04FixtureContent, null);
assert(Array.isArray(l04Standalone), 'harvestEntities standalone returns array');

// --- L05 Pre-Flight Gate ---
section('L05 Pre-Flight Gate');

var L05 = require('../src/pipeline/L05-preflight.js');

// lineRoutingDensity: high symbol density line
var l05Dense = '};(){[]}<>';
assert(L05._lineRoutingDensity(l05Dense) > 0.35, 'dense symbol line has routing density > 0.35');

// lineRoutingDensity: plain text line
var l05Plain = 'var host = "db.prod.internal";';
assert(L05._lineRoutingDensity(l05Plain) < 0.35, 'plain text line has routing density < 0.35');

// classTransitionCount: token with many transitions
var l05Transitions = L05._classTransitionCount('ghp_ABCDEF123');
assert(l05Transitions >= 3, 'token with mixed chars has >= 3 transitions');

// classTransitionCount: uniform lowercase
var l05Uniform = L05._classTransitionCount('abcdefgh');
assert(l05Uniform === 0, 'uniform lowercase has 0 transitions');

// hash: same string same hash
assert(L05._hash('hello') === L05._hash('hello'), 'hash is deterministic');
assert(L05._hash('hello') !== L05._hash('world'), 'different strings have different hashes');

// preflight: discards duplicate values
var l05DupCands = [
  { value: 'secret-value-abc', line: 'var x = "secret-value-abc"', col: 0, lineIndex: 0, type: 'string', priority: 'normal' },
  { value: 'secret-value-abc', line: 'var y = "secret-value-abc"', col: 0, lineIndex: 1, type: 'string', priority: 'normal' },
];
var l05Deduped = L05.preflight(l05DupCands, null);
assert(l05Deduped.length === 1, 'preflight deduplicates identical values');

// preflight: discards logic-graph lines
var l05StructuralCands = [
  { value: 'something-long', line: '};(){[]}<>;(){', col: 0, lineIndex: 0, type: 'string', priority: 'normal' },
];
var l05Filtered = L05.preflight(l05StructuralCands, null);
assert(l05Filtered.length === 0, 'preflight discards candidates from high-density structural lines');

// preflight: keeps normal candidates
var l05NormalCands = [
  { value: 'db.prod.internal', line: 'var DB_HOST = "db.prod.internal"', col: 0, lineIndex: 0, type: 'string', priority: 'normal' },
];
var l05Kept = L05.preflight(l05NormalCands, null);
assert(l05Kept.length === 1, 'preflight keeps normal candidates');

// preflight: marks blobs
var l05BlobValue = 'x'.repeat(2001);
var l05BlobCands = [
  { value: l05BlobValue, line: 'var x = "' + l05BlobValue.slice(0, 5) + '"', col: 0, lineIndex: 0, type: 'string', priority: 'normal' },
];
var l05BlobResult = L05.preflight(l05BlobCands, null);
assert(l05BlobResult.length === 1 && l05BlobResult[0].priority === 'blob', 'preflight classifies oversized values as blob');

// --- Vector worker ---
section('Vector worker (batch)');

var vectorWorker = require('../src/vector-worker.js');

// Synchronous fallback batch (always works regardless of Node version)
var workerBatch = [
  { index: 0, value: 'sk_live_abc123def456ghi789jkl012mno345' },
  { index: 1, value: 'this is normal english text for testing purposes' },
];

vectorWorker.runBatch(workerBatch).then(function (results) {
  assert(results.length === 2, 'worker batch returns 2 results');
  assert(results[0].score >= 0.5, 'worker: API key score >= 0.5 (got ' + results[0].score.toFixed(3) + ')');
  assert(results[1].score < 0.5, 'worker: English text score < 0.5 (got ' + results[1].score.toFixed(3) + ')');

  // Empty batch
  return vectorWorker.runBatch([]);
}).then(function (emptyResults) {
  assert(emptyResults.length === 0, 'worker: empty batch returns empty array');

  // --- Summary ---
  process.stdout.write('\n' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed > 0 ? 1 : 0);
}).catch(function (err) {
  process.stderr.write('Worker test error: ' + err.message + '\n');
  process.exit(1);
});
