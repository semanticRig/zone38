'use strict';

// Layer 15 — Output Formatting
// Renders the report from Layer 14 to either CLI (ANSI colour) or JSON.
// Handles --verbose (contributing signals per finding), --json, --axis filter,
// --threshold override, exit code logic, and roast messages.
// Populated by Phase 13.

module.exports = {
  renderCli: function renderCli(_report, _opts) { return ''; },
  renderJson: function renderJson(_report) { return '{}'; },
  exitCode: function exitCode(_axes, _thresholds) { return 0; },
};
