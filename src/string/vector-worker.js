'use strict';

// worker_threads entry point for batch vector scoring
// Receives a batch of ambiguous string values via parentPort.postMessage,
// runs vector.score() on each, and posts the results array back.
// This file is spawned as a Worker by L07-deep.js. It must not be required directly.
// Populated by Phase 6.

var workerThreads = require('worker_threads');

if (!workerThreads.isMainThread) {
  workerThreads.parentPort.on('message', function onBatch(batch) {
    // Stub: return empty results until Phase 6 implements vector.js
    var results = batch.map(function (item) {
      return { value: item.value, score: 0, isSecret: false };
    });
    workerThreads.parentPort.postMessage(results);
  });
}
