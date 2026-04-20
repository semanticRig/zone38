'use strict';

// MCP Configuration Scanner
// Discovers and scans MCP config files for risky server configurations:
//   1. Shell injection — command strings with shell metacharacters + network commands
//   2. Hardcoded secrets — API keys, tokens, and credentials in env blocks
//   3. Insecure HTTP — non-localhost remote servers over plain HTTP
//   4. Wildcard tool access — unrestricted tool grants via "tools": "*"
//
// Returns findings shaped as patternHit objects (category: 'config-exposure')
// so they flow through L13 scoring → L14 report → L15 output without changes.

var fs = require('fs');
var path = require('path');

// Config file locations relative to project root
var CONFIG_PATHS = [
  path.join('.vscode', 'mcp.json'),
  path.join('.cursor', 'mcp.json'),
  path.join('.vscode', 'settings.json'),
];

// Detection regexes
var SHELL_META_RE = /[|;`]|\$\(|&&|\|\|/;
var NETWORK_CMD_RE = /\bcurl\b|\bwget\b|\bfetch\b|\bnc\b|\bncat\b/;
var SHELL_WRAP_RE = /\b(?:bash|sh|zsh|cmd)\b.*\b-c\b/;
var SECRET_PREFIX_RE = /^(?:sk-|sk_|ghp_|gho_|glpat-|xox[bpsa]-|AKIA|npm_|pypi-)/;
var HEX_LONG_RE = /^[0-9a-f]{32,}$/i;
var BASE64_LONG_RE = /^[A-Za-z0-9+/=]{32,}$/;
var LOCALHOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(?:[:\/]|$)/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _isSecretLike(value) {
  if (typeof value !== 'string' || value.length < 16) return false;
  if (SECRET_PREFIX_RE.test(value)) return true;
  if (HEX_LONG_RE.test(value) && value.length >= 32) return true;
  if (BASE64_LONG_RE.test(value) && value.length >= 32) return true;
  return false;
}

function _parseConfigFile(filePath) {
  var content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_err) {
    return null;
  }
  try {
    return { parsed: JSON.parse(content), lineCount: content.split('\n').length, size: content.length };
  } catch (_err) {
    return null;
  }
}

function _extractServers(parsed, fileName) {
  // mcp.json: { "servers": { ... } }
  if (parsed && parsed.servers && typeof parsed.servers === 'object') {
    return parsed.servers;
  }
  // settings.json: { "mcp": { "servers": { ... } } }
  if (fileName === 'settings.json' && parsed && parsed.mcp && parsed.mcp.servers) {
    return parsed.mcp.servers;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-server rule checks
// ---------------------------------------------------------------------------

function _scanServer(serverName, config) {
  var findings = [];
  var command = (config.command || '') + ' ' + (config.args || []).join(' ');
  var url = config.url || '';
  var env = config.env || {};
  var tools = config.tools;

  // Rule 1: Shell injection risk
  if (SHELL_WRAP_RE.test(command) || (SHELL_META_RE.test(command) && NETWORK_CMD_RE.test(command))) {
    findings.push({
      ruleId:   'mcp-shell-injection',
      ruleName: 'MCP Shell Injection Risk',
      category: 'config-exposure',
      severity: 9,
      lineIndex: 0,
      line:     'server "' + serverName + '": ' + command.trim(),
      fix:      'Avoid shell wrappers and piped commands in MCP server configs. Use direct executables.',
    });
  }

  // Rule 2: Hardcoded secrets in env
  var envKeys = Object.keys(env);
  for (var i = 0; i < envKeys.length; i++) {
    if (_isSecretLike(env[envKeys[i]])) {
      findings.push({
        ruleId:   'mcp-hardcoded-secret',
        ruleName: 'MCP Hardcoded Secret',
        category: 'config-exposure',
        severity: 8,
        lineIndex: 0,
        line:     'server "' + serverName + '": env.' + envKeys[i],
        fix:      'Move secrets to environment variables or a secrets manager. Never hardcode in config files.',
      });
    }
  }

  // Rule 3: Insecure HTTP (non-localhost)
  if (url && url.indexOf('http://') === 0 && !LOCALHOST_RE.test(url)) {
    findings.push({
      ruleId:   'mcp-insecure-http',
      ruleName: 'MCP Insecure HTTP',
      category: 'config-exposure',
      severity: 7,
      lineIndex: 0,
      line:     'server "' + serverName + '": ' + url,
      fix:      'Use HTTPS for remote MCP server connections. HTTP exposes traffic to interception.',
    });
  }

  // Rule 4: Wildcard tool access
  if (tools === '*') {
    findings.push({
      ruleId:   'mcp-wildcard-tools',
      ruleName: 'MCP Wildcard Tool Access',
      category: 'config-exposure',
      severity: 6,
      lineIndex: 0,
      line:     'server "' + serverName + '": "tools": "*"',
      fix:      'Explicitly list allowed tools instead of granting wildcard access.',
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Full scan — discover + parse + detect
// ---------------------------------------------------------------------------

function scan(targetPath) {
  var absTarget = path.resolve(targetPath);
  var configFiles = [];

  for (var ci = 0; ci < CONFIG_PATHS.length; ci++) {
    var configRel = CONFIG_PATHS[ci];
    var configAbs = path.join(absTarget, configRel);
    var result = _parseConfigFile(configAbs);
    if (!result) continue;

    var fileName = path.basename(configRel);
    var servers = _extractServers(result.parsed, fileName);
    if (!servers) continue;

    var fileFindings = [];
    var serverNames = Object.keys(servers);
    for (var si = 0; si < serverNames.length; si++) {
      var srvName = serverNames[si];
      var srvConfig = servers[srvName];
      if (!srvConfig || typeof srvConfig !== 'object') continue;
      var srvFindings = _scanServer(srvName, srvConfig);
      for (var fi = 0; fi < srvFindings.length; fi++) {
        fileFindings.push(srvFindings[fi]);
      }
    }

    configFiles.push({
      configPath: configAbs,
      configRelPath: configRel,
      lineCount: result.lineCount,
      size: result.size,
      serverCount: serverNames.length,
      findings: fileFindings,
    });
  }

  return configFiles;
}

module.exports = {
  scan:             scan,
  _scanServer:      _scanServer,
  _isSecretLike:    _isSecretLike,
  _extractServers:  _extractServers,
  CONFIG_PATHS:     CONFIG_PATHS,
};
