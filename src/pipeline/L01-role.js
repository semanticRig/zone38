'use strict';

// Layer 1 — File Role Classification
// Classifies every file record by role: backend/frontend/isomorphic,
// config/logic/declaration, test/application, .d.ts flag.
// Mutates fileRecord.role in place and returns it.

var path = require('path');

var BACKEND_SIGNALS = [
  'server', 'api', 'route', 'controller', 'middleware',
  'handler', 'model', 'db', 'migration', 'worker', 'cron', 'queue',
];

var FRONTEND_SIGNALS = [
  'component', 'page', 'view', 'layout', 'hook',
  'context', 'store', 'ui', 'widget', 'screen',
];

// Path segments that strongly indicate configuration files.
var CONFIG_SIGNALS = [
  'config', 'setting', 'option', 'env', 'constant', 'constant',
];

// Path segments that indicate logic-heavy files.
var LOGIC_SIGNALS = [
  'service', 'util', 'helper', 'lib', 'core', 'engine', 'processor',
  'transform', 'parser', 'builder', 'factory', 'validator',
];

function containsSegment(relPath, signals) {
  var lower = relPath.toLowerCase().replace(/\\/g, '/');
  for (var i = 0; i < signals.length; i++) {
    if (lower.indexOf('/' + signals[i]) !== -1 ||
        lower.indexOf(signals[i] + '/') !== -1 ||
        lower.indexOf(signals[i] + '.') !== -1) {
      return true;
    }
  }
  return false;
}

function classifyRole(fileRecord) {
  var relPath = fileRecord.relativePath;
  var lower = relPath.toLowerCase().replace(/\\/g, '/');
  var ext = fileRecord.ext;
  var base = path.basename(lower);

  // Declaration file — .d.ts
  var isDeclaration = base.endsWith('.d.ts');

  // Test file — territory already tells us, but re-derive from filename for accuracy
  var isTest = fileRecord.territory === 'test' ||
               base.indexOf('.test.') !== -1 ||
               base.indexOf('.spec.') !== -1 ||
               lower.indexOf('__tests__/') !== -1;

  // Backend / Frontend / Isomorphic
  var isBackend = containsSegment(relPath, BACKEND_SIGNALS);
  var isFrontend = ext === '.jsx' || ext === '.tsx' || containsSegment(relPath, FRONTEND_SIGNALS);

  var contextType;
  if (isBackend && !isFrontend) contextType = 'backend';
  else if (isFrontend && !isBackend) contextType = 'frontend';
  else contextType = 'isomorphic';

  // Config / Logic / Declaration
  var fileType;
  if (isDeclaration) {
    fileType = 'declaration';
  } else if (containsSegment(relPath, CONFIG_SIGNALS)) {
    fileType = 'config';
  } else if (containsSegment(relPath, LOGIC_SIGNALS)) {
    fileType = 'logic';
  } else {
    fileType = 'general';
  }

  var role = {
    contextType: contextType,   // 'backend' | 'frontend' | 'isomorphic'
    fileType: fileType,          // 'config' | 'logic' | 'declaration' | 'general'
    isTest: isTest,
    isDeclaration: isDeclaration,
    // Convenience aliases consumed by rule test functions (ctx shape)
    isBackend: isBackend,
    isFrontend: isFrontend,
  };

  fileRecord.role = role;
  return role;
}

module.exports = {
  classifyRole: classifyRole,
};
