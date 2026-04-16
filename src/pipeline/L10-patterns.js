'use strict';

// Layer 10 — Pattern Rule Engine
// Applies all rule categories to per-file content.
// Takes (content, fileRecord) where fileRecord has the v2 shape
// (with .role and .surface from L01/L02, or raw path/role fields from v1 scanner).
// Returns array of pattern hit objects: { ruleId, line, lineIndex, severity, category, fix }

var path = require('path');
var rules = require('../rules');

// Build a ctx object from a fileRecord for consumption by rule test() functions.
// Handles both the v2 pipeline fileRecord shape and the v1 scanner shape.
function _buildCtx(fileRecord, lines) {
  var role = fileRecord.role || {};
  var contextType = role.contextType || '';
  var isBackend  = contextType === 'backend'  || fileRecord.isBackend  || false;
  var isFrontend = contextType === 'frontend' || fileRecord.isFrontend || false;

  return {
    filePath:   fileRecord.path || fileRecord.filePath || '',
    fileName:   fileRecord.fileName || path.basename(fileRecord.path || fileRecord.filePath || ''),
    lines:      lines,
    lineIndex:  0,          // updated per-line in applyRules
    isBackend:  isBackend,
    isFrontend: isFrontend,
    role:       role,
    surface:    fileRecord.surface || {},
  };
}

// applyRules(content, fileRecord) → array of hit objects
//
// content     — raw file text (string)
// fileRecord  — object with at minimum { path } or { filePath }; may also have
//               { role, surface } from upstream pipeline layers
function applyRules(content, fileRecord) {
  if (typeof content !== 'string' || !content) return [];

  var lines = content.split('\n');
  var ctx = _buildCtx(fileRecord || {}, lines);
  var hits = [];

  for (var i = 0; i < lines.length; i++) {
    ctx.lineIndex = i;
    var line = lines[i];
    for (var r = 0; r < rules.length; r++) {
      var rule = rules[r];
      try {
        if (rule.test(line, ctx)) {
          hits.push({
            ruleId:    rule.id,
            ruleName:  rule.name,
            category:  rule.category,
            severity:  rule.severity,
            line:      line,
            lineIndex: i,
            fix:       rule.fix,
          });
        }
      } catch (_e) {
        // Rule threw — never crash the pipeline because of a bad rule
      }
    }
  }

  return hits;
}

module.exports = {
  applyRules: applyRules,
  _buildCtx:  _buildCtx,
};

