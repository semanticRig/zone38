/**

* SlopGuard Comprehensive Test File
* Covers: entropy, secrets, review, entanglement, URLs, quality, slop
  */

// ---------------- CLEAN BASELINE ----------------
function add(a, b) {
return a + b;
}

// ---------------- LENGTH EDGE CASES ----------------
// len < 6 → should NEVER be confirmed
const short1 = "abc";        // len=3
const short2 = "12345";      // len=5

// len = 6 → multiplier = 0 → cannot be CONFIRMED
const edge6 = "a1B2c3";

// len = 9 → partial decay
const edge9 = "a1B2c3D4E";

// len >= 12 → full pipeline allowed
const edge12 = "a1B2c3D4E5F6";

// ---------------- HIGH ENTROPY (SHOULD TRIGGER) ----------------
const apiKey = "sk_live_51H8sdf78sdf78sdf78sdf78sdf78sdf78";
const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD";

// ---------------- MEDIUM / REVIEW CANDIDATES ----------------
const maybeSecret = "abc123xyz789";
const mixedString = "A1b2C3d4E5f6G7";

// ---------------- ENTANGLEMENT CASES (SHOULD NOT CONFIRM) ----------------
const cleaned = input.replace(/[.*+?^${}()|[]\]/g, "\$&");
const regexTest = /[A-Za-z0-9+/=]{20,}/g;

// ---------------- URL EXPOSURE (L09 MUST FIRE) ----------------
const url1 = "https://api.example.com/data?apiKey=ABC123SECRET";
const url2 = "https://docs.google.com/?key=XYZ987TOKEN";

// ---------------- QUALITY ISSUES ----------------
console.log("debugging..."); // debug pollution

// TODO: remove this later
function unusedFunction() {
return "dead code";
}

// ---------------- AI SLOP-LIKE STRUCTURE ----------------
function processData(data) {
function innerProcess(item) {
function deepLayer(x) {
return x ? x.value || x.data || x.result : null;
}
return deepLayer(item);
}

return data.map(d => innerProcess(d)).filter(Boolean);
}

// ---------------- COMMENT MISMATCH ----------------
// This function multiplies numbers
function subtract(a, b) {
return a - b;
}

// ---------------- STRING BLOB (ENTROPY SPIKE TEST) ----------------
const blob = "Q29uZ3JhdHVsYXRpb25zISBUaGlzIGlzIGEgdGVzdCBzdHJpbmcgd2l0aCBoaWdoIGVudHJvcHk=";

// ---------------- SYMBOL DENSITY (ENTANGLEMENT TRIGGER) ----------------
const tricky = fnCall(param1, param2, "abc$%^&*()_+|}{:?><,./;'[]\=-`~");

// ---------------- FINAL EXPORT ----------------
module.exports = {
add,
processData
};

