'use strict';

// Vector engine worker thread entry.
// Receives batches of ambiguous strings, computes vectorScore for each,
// posts results back to the main thread.

var workerThreads;
try {
  workerThreads = require('worker_threads');
} catch (err) {
  // worker_threads not available (Node < 12) — this file won't be loaded as a worker
  workerThreads = null;
}

if (workerThreads && !workerThreads.isMainThread) {
  var vectorEngine = require('./vector.js');
  var parentPort = workerThreads.parentPort;

  parentPort.on('message', function (batch) {
    var results = [];
    for (var i = 0; i < batch.length; i++) {
      results.push({
        index: batch[i].index,
        value: batch[i].value,
        score: vectorEngine.vectorScore(batch[i].value),
      });
    }
    parentPort.postMessage(results);
  });
}

/**
 * Runs vectorScore on a batch of strings using a worker thread.
 * Falls back to synchronous execution if worker_threads unavailable.
 * batch: Array of { index: number, value: string }
 * Returns a Promise resolving to Array of { index, value, score }.
 */
function runBatch(batch) {
  if (!batch || batch.length === 0) {
    return Promise.resolve([]);
  }

  // Fallback: synchronous in main thread
  if (!workerThreads || !workerThreads.Worker) {
    var vectorEngine = require('./vector.js');
    var results = [];
    for (var i = 0; i < batch.length; i++) {
      results.push({
        index: batch[i].index,
        value: batch[i].value,
        score: vectorEngine.vectorScore(batch[i].value),
      });
    }
    return Promise.resolve(results);
  }

  // Worker thread execution
  return new Promise(function (resolve, reject) {
    var worker = new workerThreads.Worker(__filename);
    worker.on('message', function (results) {
      worker.terminate();
      resolve(results);
    });
    worker.on('error', function (err) {
      // On worker error, fall back to sync
      var vectorFallback = require('./vector.js');
      var fallbackResults = [];
      for (var i = 0; i < batch.length; i++) {
        fallbackResults.push({
          index: batch[i].index,
          value: batch[i].value,
          score: vectorFallback.vectorScore(batch[i].value),
        });
      }
      resolve(fallbackResults);
    });
    worker.postMessage(batch);
  });
}

module.exports = { runBatch: runBatch };
