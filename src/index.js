'use strict';

// Public API entry point for slopguard

var scanner = require('./scanner');
var entropy = require('./entropy');
var compression = require('./compression');
var scorer = require('./scorer');

module.exports = {
  discoverFiles: scanner.discoverFiles,
  scanFile: scanner.scanFile,
  scanAll: scanner.scanAll,
  isBackendFile: scanner.isBackendFile,
  isFrontendFile: scanner.isFrontendFile,
  shannonEntropy: entropy.shannonEntropy,
  analyzeFileEntropy: entropy.analyzeFileEntropy,
  analyzeCompression: compression.analyzeCompression,
  ncd: compression.ncd,
  selfCompressionRatio: compression.selfCompressionRatio,
  scoreFile: scorer.scoreFile,
  scoreProject: scorer.scoreProject,
  getVerdict: scorer.getVerdict,
};
