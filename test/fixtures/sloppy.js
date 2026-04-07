// Fixture: intentionally sloppy file that should trigger many rules
// Used by test runner to verify rule detection

var chalky = require('chalk-colors');
var utils = require('lodash-utils');

// TODO: finish implementing this later
// FIXME: this is broken

var apiKey = 'sk-proj-abc123def456ghi789jkl012mno345pqr678';
var secret = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

// var oldCode = require('./deprecated');
// function legacyHandler(req, res) {
//   res.send('old');
// }

function UserFactory(name) {
  return { name: name };
}

const DataProviderFactory = function() {
  return {};
};

async function fetchData() {
  return [1, 2, 3];
}

function processItem(item) {
  if (item !== null && item !== undefined) {
    return item;
  } else {
    return null;
  }
}

function checkStatus(isActive) {
  if (isActive === true) {
    return 'active';
  }
  if (isActive === false) {
    return 'inactive';
  }
}

console.log('debugging test');
console.log('another debug line');

debugger;

alert('something went wrong');

eval('var x = 1 + 2');
var fn = new Function('a', 'b', 'return a + b');

var result = x > 0 ? x > 10 ? x > 100 ? 'huge' : 'big' : 'medium' : 'small';

try {
  JSON.parse('bad json');
} catch (e) {
}

document.getElementById('app').innerHTML = '<div>' + userInput + '</div>';
