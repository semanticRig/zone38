// Fixture: ambiguous file — not clearly backend or frontend
// Should classify as neither backend nor frontend

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

module.exports = { add: add, multiply: multiply };
