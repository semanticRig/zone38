'use strict';

// Public API entry point for slopguard

var scanner = require('./scanner');
var entropy = require('./entropy');

module.exports = {
  discoverFiles: scanner.discoverFiles,
  scanFile: scanner.scanFile,
  scanAll: scanner.scanAll,
  isBackendFile: scanner.isBackendFile,
  isFrontendFile: scanner.isFrontendFile,
  shannonEntropy: entropy.shannonEntropy,
  analyzeFileEntropy: entropy.analyzeFileEntropy,
};
