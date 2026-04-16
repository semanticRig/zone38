'use strict';

// Fast-pipeline aggregator + ambiguity router.
// Runs the 3-signal pipeline (char-frequency, bigram, compression).
// Decision logic:
//   - All 3 available signals agree (all < 0.4 OR all > 0.6) → decided
//   - Any signal is in the twilight zone (0.4–0.6), or signals disagree → ambiguous
// Output: { score: 0-100, decided: boolean, ambiguous: boolean, signals: {} }
// score = weighted mean of available signals × 100

var charFreq   = require('./char-frequency.js');
var bigram     = require('./bigram.js');
var compression = require('./compression.js');

var TWILIGHT_LO = 0.40;
var TWILIGHT_HI = 0.60;

function aggregate(value) {
  var cfResult   = charFreq.analyse(value);
  var bgResult   = bigram.analyse(value);
  var compResult = compression.analyse(value);

  var signals = {
    charFrequency: cfResult.signal,
    bigram:        bgResult.signal,
    compression:   compResult ? compResult.signal : null,
  };

  // Collect only non-null signals for decision
  var available = [signals.charFrequency, signals.bigram];
  if (signals.compression !== null) available.push(signals.compression);

  // Weighted mean (equal weights for now — compression gets a slight boost at weight 1.2)
  var weightSum = 0;
  var signalSum = 0;
  var weights = [1.0, 1.0];
  if (signals.compression !== null) weights.push(1.2);
  for (var i = 0; i < available.length; i++) {
    signalSum += available[i] * weights[i];
    weightSum += weights[i];
  }
  var meanSignal = weightSum === 0 ? 0.5 : signalSum / weightSum;
  var score = Math.round(Math.max(0, Math.min(1, meanSignal)) * 100);

  // Ambiguity detection
  var anyTwilight = false;
  for (var j = 0; j < available.length; j++) {
    if (available[j] >= TWILIGHT_LO && available[j] <= TWILIGHT_HI) {
      anyTwilight = true;
      break;
    }
  }

  // Agreement check: do all signals point the same direction?
  var allLow  = available.every(function (s) { return s < TWILIGHT_LO; });
  var allHigh = available.every(function (s) { return s > TWILIGHT_HI; });
  var agreed  = allLow || allHigh;

  var decided   = agreed && !anyTwilight;
  var ambiguous = !decided;

  return {
    score:     score,
    decided:   decided,
    ambiguous: ambiguous,
    signals:   signals,
  };
}

module.exports = { aggregate: aggregate };
