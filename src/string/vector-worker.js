'use strict';

// worker_threads entry point for batch vector scoring.
// Spawned by L07-deep.js; must NOT be required directly in the main thread.
//
// Protocol:
//   Parent sends: Array<{ index: number, value: string }>
//   Worker posts: Array<{ index: number, value: string, score: number, isSecret: boolean }>
//
// Also exports runBatch() for synchronous fallback use in tests and environments
// where worker_threads are unavailable or unneeded.

var workerThreads = require('worker_threads');
var vector = require('./vector.js');

// Synchronous fallback — used when called via require() from the main thread.
function runBatch(batch) {
  return new Promise(function (resolve) {
    var results = batch.map(function (item) {
      var result = vector.score(item.value);
      return {
        index:    item.index,
        value:    item.value,
        score:    result.score,
        isSecret: result.isSecret,
      };
    });
    resolve(results);
  });
}

// Worker thread message handler
if (!workerThreads.isMainThread) {
  workerThreads.parentPort.on('message', function onBatch(batch) {
    var results = batch.map(function (item) {
      var result = vector.score(item.value);
      return {
        index:    item.index,
        value:    item.value,
        score:    result.score,
        isSecret: result.isSecret,
      };
    });
    workerThreads.parentPort.postMessage(results);
  });
}

module.exports = { runBatch: runBatch };
