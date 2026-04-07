// Fixture: file with high-entropy strings that look like real secrets
// Should be flagged by entropy analysis

'use strict';

// These look like real API keys and tokens
var stripeKey = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc8Rk2tG5xNm9ABcDe';

// Prefix bypass: sk- key with _ID LHS and || fallback — MUST still fire (prefix table)
window.SOME_ID = window.SOME_ID || 'sk-proj-abc123def456ghi789jkl012mno345pqr678stu901';

// Random base64 with public LHS + fallback — MUST still fire (hard ceiling)
window.SOME_CALLBACK_ID = window.SOME_CALLBACK_ID || 'XqB3mNpK9rT2vY7wZ1sA4dF6hJ8lQeUiOcGbMnRk';
var awsSecret = 'wJalrXUtnFEMIK7MDENG5bPxRfiCYEXAMPLEKEY99';
var jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw';
var hexSecret = 'a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9';

module.exports = {
  stripeKey: stripeKey,
  awsSecret: awsSecret,
  jwtToken: jwtToken,
  hexSecret: hexSecret,
};
