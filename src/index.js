'use strict';

// Public API entry point for zone38

var runner = require('./pipeline/runner');
var L15 = require('./pipeline/L15-output');

module.exports = {
  run: runner.run,
  renderJson: L15.renderJson,
  renderCli: L15.renderCli,
  renderBanner: L15.renderBanner,
  exitCode: L15.exitCode,
  DEFAULT_THRESHOLDS: L15.DEFAULT_THRESHOLDS,
};
