'use strict';

var RESET = '\x1b[0m';
var BOLD = '\x1b[1m';
var DIM = '\x1b[2m';
var CYAN = '\x1b[36m';

var DEFAULT_WIDTH = 78;
var MIN_WIDTH = 15;
var MAX_WIDTH = 110;
var LABEL_WIDTH = 13;
var BAR_WIDTH = 24;
var GUTTER = '  ';

var ANSI_RE = /\x1b\[[0-9;]*m/g;

var DEFAULT_PHASES = [
  { key: 'init', label: 'INITIALIZE' },
  { key: 'discover', label: 'DISCOVER' },
  { key: 'scan', label: 'SCAN' },
];

var PACKAGE_VERSION = '0.0.0';
try {
  PACKAGE_VERSION = require('../package.json').version || PACKAGE_VERSION;
} catch (_err) {}

function stripAnsi(str) {
  return String(str || '').replace(ANSI_RE, '');
}

function visibleLength(str) {
  return stripAnsi(str).length;
}

function clampFrameWidth(columns, targetWidth) {
  var target = targetWidth || DEFAULT_WIDTH;
  var terminalWidth = Number(columns) || 80;
  var terminalLimit = terminalWidth - 4;
  var width = Math.min(target, terminalLimit);
  if (width < MIN_WIDTH) width = MIN_WIDTH;
  if (width > MAX_WIDTH) width = MAX_WIDTH;
  return width;
}

function truncateAnsiEnd(str, maxWidth) {
  str = String(str || '');
  if (maxWidth <= 0) return '';
  if (visibleLength(str) <= maxWidth) return str;

  var suffixWidth = maxWidth >= 3 ? 3 : maxWidth;
  var contentWidth = maxWidth - suffixWidth;
  var suffix = '.'.repeat(suffixWidth);
  var out = '';
  var visible = 0;
  var sawAnsi = false;

  for (var i = 0; i < str.length && visible < contentWidth;) {
    if (str[i] === '\x1b') {
      var match = str.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (match) {
        out += match[0];
        sawAnsi = true;
        i += match[0].length;
        continue;
      }
    }
    out += str[i];
    visible++;
    i++;
  }

  out += suffix;
  if (sawAnsi) out += RESET;
  return out;
}

function truncateMiddle(str, maxWidth) {
  str = stripAnsi(str || '');
  if (maxWidth <= 0) return '';
  if (str.length <= maxWidth) return str;
  if (maxWidth <= 3) return '.'.repeat(maxWidth);
  var left = Math.ceil((maxWidth - 3) / 2);
  var right = Math.floor((maxWidth - 3) / 2);
  return str.slice(0, left) + '...' + str.slice(str.length - right);
}

function padAnsiRight(str, width) {
  str = truncateAnsiEnd(str, width);
  var len = visibleLength(str);
  while (len < width) {
    str += ' ';
    len++;
  }
  return str;
}

function formatElapsed(ms) {
  if (!isFinite(ms) || ms < 0) ms = 0;
  var totalTenths = Math.floor(ms / 100);
  var tenths = totalTenths % 10;
  var totalSeconds = Math.floor(totalTenths / 10);
  var seconds = totalSeconds % 60;
  var minutes = Math.floor(totalSeconds / 60);
  var minuteText = minutes < 10 ? '0' + minutes : String(minutes);
  var secondText = seconds < 10 ? '0' + seconds : String(seconds);
  return minuteText + ':' + secondText + '.' + tenths;
}

function formatRate(rate) {
  if (!isFinite(rate) || rate < 0) rate = 0;
  return rate.toFixed(2) + ' f/s';
}

function formatNumber(num) {
  num = Math.max(0, Math.floor(Number(num) || 0));
  var str = String(num);
  var out = '';
  while (str.length > 3) {
    out = ',' + str.slice(-3) + out;
    str = str.slice(0, -3);
  }
  return str + out;
}

function formatCount(num, singular, plural) {
  var normalized = Math.max(0, Math.floor(Number(num) || 0));
  return formatNumber(normalized) + ' ' + (normalized === 1 ? singular : plural);
}

function normalizePhases(phases) {
  if (!Array.isArray(phases) || phases.length === 0) return DEFAULT_PHASES.slice();
  return phases.map(function (phase) {
    if (typeof phase === 'string') {
      return { key: phase, label: phase.toUpperCase() };
    }
    return {
      key: phase.key || phase.type || String(phase.label || 'phase').toLowerCase(),
      label: String(phase.label || phase.key || phase.type || 'PHASE').toUpperCase(),
    };
  });
}

function phaseIndex(phases, activeType) {
  for (var i = 0; i < phases.length; i++) {
    if (phases[i].key === activeType) return i;
  }
  return 0;
}

function renderPhaseValue(state, phases) {
  var activeIndex = phaseIndex(phases, state.phase);
  var parts = [];
  for (var i = 0; i < phases.length; i++) {
    var label = phases[i].label;
    if (i === activeIndex) {
      parts.push(CYAN + '[' + label + ']' + RESET);
    } else {
      parts.push(DIM + label + RESET);
    }
  }
  parts.push(DIM + '[' + (activeIndex + 1) + '/' + phases.length + ']' + RESET);
  return parts.join('  ');
}

function renderProgressBar(current, total) {
  if (!total || total <= 0) return '';
  var ratio = current / total;
  if (ratio < 0) ratio = 0;
  if (ratio > 1) ratio = 1;
  var filled = Math.round(ratio * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

function renderFileValue(state, nowMs) {
  var total = Number(state.total) || 0;
  if (total <= 0) return DIM + 'collecting targets' + RESET;
  var current = Number(state.current) || 0;
  if (current < 0) current = 0;
  if (current > total) current = total;
  var elapsedSeconds = Math.max((nowMs - state.startTime) / 1000, 0.001);
  var percent = (current / total * 100).toFixed(1) + '%';
  var cadence = current / elapsedSeconds;
  return renderProgressBar(current, total) + '  ' +
    current + '/' + total + '  ' + percent + '  ' +
    DIM + 'cadence ' + RESET + formatRate(cadence);
}

function renderElapsedValue(state, nowMs, width) {
  var elapsed = formatElapsed(nowMs - state.startTime);
  var base = elapsed + '  ' + DIM + 'target ' + RESET;
  var targetWidth = width - visibleLength(base);
  var target = state.file || state.targetPath || state.note || '';
  if (targetWidth <= 0) return truncateAnsiEnd(base, width);
  return base + truncateMiddle(target, targetWidth);
}

function makeFrameRow(label, value, frameWidth) {
  var innerWidth = frameWidth - 2;
  if (innerWidth <= 0) return GUTTER + DIM + '││' + RESET;
  var labelWidth = Math.min(LABEL_WIDTH, innerWidth);
  var labelText = padAnsiRight(label, labelWidth);
  var valueWidth = innerWidth - labelWidth;
  var body = DIM + labelText + RESET;
  if (valueWidth > 0) body += padAnsiRight(value, valueWidth);
  body = padAnsiRight(body, innerWidth);
  return GUTTER + DIM + '│' + RESET + body + DIM + '│' + RESET;
}

function renderFrame(state, opts) {
  opts = opts || {};
  var phases = normalizePhases(opts.phases);
  var frameWidth = clampFrameWidth(opts.columns, opts.widthTarget);
  var innerWidth = frameWidth - 2;
  var nowMs = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();
  var valueWidth = Math.max(innerWidth - Math.min(LABEL_WIDTH, innerWidth), 0);
  var lines = [];

  lines.push(GUTTER + BOLD + 'zone38' + RESET + '  v' + (opts.version || PACKAGE_VERSION) + '  ANALYSIS PIPELINE');
  lines.push(GUTTER + DIM + '┌' + '─'.repeat(Math.max(frameWidth - 2, 0)) + '┐' + RESET);
  lines.push(makeFrameRow('phase matrix', renderPhaseValue(state, phases), frameWidth));
  lines.push(makeFrameRow('file vector', renderFileValue(state, nowMs), frameWidth));
  lines.push(makeFrameRow('elapsed', renderElapsedValue(state, nowMs, valueWidth), frameWidth));
  lines.push(GUTTER + DIM + '└' + '─'.repeat(Math.max(frameWidth - 2, 0)) + '┘' + RESET);
  return lines.join('\n') + '\n';
}

function renderCompletionSummary(summary) {
  if (summary.summary) return String(summary.summary);
  var confirmed = summary.confirmed;
  if (confirmed === undefined) confirmed = summary.secretCount;
  var review = summary.review;
  if (review === undefined) review = summary.reviewCount;
  var exposure = summary.exposure;
  if (exposure === undefined) exposure = summary.exposureCount;
  var hits = summary.hits;
  if (hits === undefined) hits = summary.hitCount;
  if (hits === undefined) hits = summary.patternHitCount;

  confirmed = Number(confirmed) || 0;
  review = Number(review) || 0;
  exposure = Number(exposure) || 0;
  hits = Number(hits) || 0;

  if (confirmed === 0 && review === 0 && exposure === 0 && hits === 0) {
    return '0 confirmed  0 review  clean';
  }
  var parts = [confirmed + ' confirmed', review + ' review'];
  if (exposure > 0) parts.push(exposure + ' exposure');
  if (hits > 0) parts.push(hits + ' hits');
  return parts.join('  ');
}

function renderCompletionCard(summary, opts) {
  summary = summary || {};
  opts = opts || {};
  var frameWidth = clampFrameWidth(opts.columns, opts.widthTarget);
  var elapsedMs = typeof summary.elapsedMs === 'number' ? summary.elapsedMs : 0;
  var fileCount = summary.fileCount;
  if (fileCount === undefined) fileCount = summary.files;
  fileCount = Number(fileCount) || 0;
  var lineCount = summary.lineCount;
  if (lineCount === undefined) lineCount = summary.totalLines;
  lineCount = Number(lineCount) || 0;
  var rate = summary.rate;
  if (rate === undefined) {
    var seconds = elapsedMs > 0 ? elapsedMs / 1000 : 0;
    rate = seconds > 0 ? fileCount / seconds : 0;
  }

  var first = BOLD + 'COMPLETE' + RESET + '  ' +
    formatCount(fileCount, 'file', 'files') + '  ' + formatCount(lineCount, 'line', 'lines') + '  ' +
    DIM + 'total ' + RESET + formatElapsed(elapsedMs) + '  ' +
    DIM + 'cadence ' + RESET + formatRate(rate);
  var second = renderCompletionSummary(summary);
  var lines = [];
  lines.push(GUTTER + DIM + '┌' + '─'.repeat(Math.max(frameWidth - 2, 0)) + '┐' + RESET);
  lines.push(makeFrameRow('completion', first, frameWidth));
  lines.push(makeFrameRow('summary', second, frameWidth));
  lines.push(GUTTER + DIM + '└' + '─'.repeat(Math.max(frameWidth - 2, 0)) + '┘' + RESET);
  return lines.join('\n') + '\n';
}

function lineCount(str) {
  var count = 0;
  for (var i = 0; i < str.length; i++) {
    if (str[i] === '\n') count++;
  }
  return count;
}

function noopProgressUi() {
  return {
    event: function () {},
    complete: function () {},
    stop: function () {},
  };
}

function createProgressUi(opts) {
  opts = opts || {};
  var stdout = opts.stdout || process.stdout;
  if (opts.enabled === false || opts.json === true || !stdout || stdout.isTTY !== true) {
    return noopProgressUi();
  }

  var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
  var state = {
    phase: 'init',
    total: 0,
    current: 0,
    file: '',
    targetPath: '',
    note: '',
    startTime: now(),
  };
  var lastLineCount = 0;
  var rendered = false;
  var stopped = false;

  function columns() {
    return opts.columns || stdout.columns || process.stdout.columns || 80;
  }

  function clear() {
    if (!rendered || lastLineCount <= 0) return;
    stdout.write('\x1b[' + lastLineCount + 'A\x1b[J');
    rendered = false;
    lastLineCount = 0;
  }

  function draw() {
    if (stopped) return;
    clear();
    var out = renderFrame(state, {
      phases: opts.phases,
      columns: columns(),
      version: opts.version,
      widthTarget: opts.widthTarget,
      nowMs: now(),
    });
    stdout.write(out);
    lastLineCount = lineCount(out);
    rendered = true;
  }

  return {
    event: function (event) {
      event = event || {};
      if (event.type) state.phase = event.type;
      if (event.total !== undefined) state.total = event.total;
      if (event.current !== undefined) state.current = event.current;
      if (event.file !== undefined) state.file = event.file;
      if (event.targetPath !== undefined) state.targetPath = event.targetPath;
      if (event.note !== undefined) state.note = event.note;
      draw();
    },
    complete: function (summary) {
      summary = summary || {};
      clear();
      summary.elapsedMs = typeof summary.elapsedMs === 'number' ? summary.elapsedMs : now() - state.startTime;
      stdout.write(renderCompletionCard(summary, {
        columns: columns(),
        widthTarget: opts.widthTarget,
      }));
      stopped = true;
    },
    stop: function () {
      clear();
      stopped = true;
    },
  };
}

module.exports = {
  createProgressUi: createProgressUi,
  noopProgressUi: noopProgressUi,
  renderFrame: renderFrame,
  renderCompletionCard: renderCompletionCard,
  stripAnsi: stripAnsi,
  visibleLength: visibleLength,
  truncateAnsiEnd: truncateAnsiEnd,
  truncateMiddle: truncateMiddle,
  clampFrameWidth: clampFrameWidth,
  formatElapsed: formatElapsed,
};