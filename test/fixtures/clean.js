// Fixture: clean, well-written code that should trigger zero or minimal rules

'use strict';

var path = require('path');

function resolvePath(base, relative) {
  return path.resolve(base, relative);
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function formatName(first, last) {
  if (!first) return last || '';
  if (!last) return first;
  return first + ' ' + last;
}

function sum(numbers) {
  var total = 0;
  for (var i = 0; i < numbers.length; i++) {
    total += numbers[i];
  }
  return total;
}

module.exports = {
  resolvePath: resolvePath,
  clamp: clamp,
  formatName: formatName,
  sum: sum,
};
