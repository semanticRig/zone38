'use strict';

// Public API entry point for slopguard

var scanner = require('./scanner');

module.exports = {
  discoverFiles: scanner.discoverFiles,
  scanFile: scanner.scanFile,
  scanAll: scanner.scanAll,
  isBackendFile: scanner.isBackendFile,
  isFrontendFile: scanner.isFrontendFile,
};
