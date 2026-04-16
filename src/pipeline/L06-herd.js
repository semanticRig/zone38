'use strict';

// Layer 6 — Herd vs Wolf Discrimination
//
// Problem: data arrays of similar-looking values (hex hashes, UUIDs, enum labels)
// have high entropy but are NOT secrets. Analysing each individually would produce
// false positives. This layer groups candidates by syntactic proximity and checks
// whether the group is "all the same kind of thing" (a herd) or contains an outlier
// (a wolf in the herd).
//
// Algorithm:
//   1. Cluster candidates that share the same identifierName, or whose line indices
//      are within WINDOW_SIZE lines of each other, into "herds".
//   2. For each herd of >= MIN_HERD_SIZE values:
//      a. Compute mean and variance of Shannon entropies.
//      b. Low variance (< VARIANCE_THRESHOLD): check Inter-Herd Divergence (IHD).
//         IHD = max entropy in group - min entropy. If IHD > IHD_THRESHOLD,
//         a wolf exists — escalate all. Otherwise discard the herd (false alarm).
//      c. High variance: wolf exists in a noisy herd — escalate all.
//   3. Isolated candidates (not in a herd) are always escalated to Layer 7.
//
// Output: flat array of candidates to escalate (with herdId attached for Layer 7 context).

var charFreq = require('../string/char-frequency.js');

var WINDOW_SIZE       = 5;   // lines within which candidates are considered neighbours
var MIN_HERD_SIZE     = 3;   // minimum group size to run herd analysis
var VARIANCE_THRESHOLD = 0.4; // below = herd is homogeneous (check IHD before discarding)
var IHD_THRESHOLD     = 1.5;  // entropy spread: if > this, a wolf is present in the herd

function _entropy(value) {
  return charFreq._entropy(value);
}

function _mean(arr) {
  var sum = 0;
  for (var i = 0; i < arr.length; i++) sum += arr[i];
  return arr.length === 0 ? 0 : sum / arr.length;
}

function _variance(arr, mean) {
  var sumSq = 0;
  for (var i = 0; i < arr.length; i++) sumSq += Math.pow(arr[i] - mean, 2);
  return arr.length === 0 ? 0 : sumSq / arr.length;
}

// Build clusters: candidates within WINDOW_SIZE lines of each other OR sharing
// the same non-null identifierName form a cluster.
function _cluster(candidates) {
  var clusters = [];
  var assigned = new Array(candidates.length).fill(false);

  for (var i = 0; i < candidates.length; i++) {
    if (assigned[i]) continue;

    var cluster = [candidates[i]];
    assigned[i] = true;

    for (var j = i + 1; j < candidates.length; j++) {
      if (assigned[j]) continue;
      var sameIdent = candidates[i].identifierName &&
                      candidates[i].identifierName === candidates[j].identifierName;
      var proximate = Math.abs(candidates[j].lineIndex - candidates[i].lineIndex) <= WINDOW_SIZE;
      if (sameIdent || proximate) {
        cluster.push(candidates[j]);
        assigned[j] = true;
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function discriminate(candidates) {
  if (!candidates || candidates.length === 0) return [];

  var clusters = _cluster(candidates);
  var escalated = [];
  var herdId = 0;

  for (var c = 0; c < clusters.length; c++) {
    var cluster = clusters[c];

    if (cluster.length < MIN_HERD_SIZE) {
      // Too small to run herd analysis — always escalate
      for (var k = 0; k < cluster.length; k++) {
        escalated.push(cluster[k]);
      }
      continue;
    }

    // Compute entropies for the cluster
    var entropies = cluster.map(function (cand) { return _entropy(cand.value); });
    var mean = _mean(entropies);
    var variance = _variance(entropies, mean);
    var ihd = Math.max.apply(null, entropies) - Math.min.apply(null, entropies);

    if (variance < VARIANCE_THRESHOLD) {
      // Homogeneous herd — check IHD before deciding to escalate
      if (ihd > IHD_THRESHOLD) {
        // A wolf is hiding inside a uniform-looking herd — escalate all
        herdId++;
        for (var hi = 0; hi < cluster.length; hi++) {
          var item = cluster[hi];
          item.herdId = herdId;
          item.herdSize = cluster.length;
          item.herdIHD = ihd;
          escalated.push(item);
        }
      }
      // else: truly uniform herd (data array) — discard, not a secret
    } else {
      // High variance: heterogeneous herd — escalate all
      herdId++;
      for (var vi = 0; vi < cluster.length; vi++) {
        var vitem = cluster[vi];
        vitem.herdId = herdId;
        vitem.herdSize = cluster.length;
        vitem.herdIHD = ihd;
        escalated.push(vitem);
      }
    }
  }

  return escalated;
}

module.exports = {
  discriminate: discriminate,
  // Exported for tests
  _cluster:  _cluster,
  _variance: _variance,
  _mean:     _mean,
};
