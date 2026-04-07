// Fixture: file with high-entropy strings that look like real secrets
// Should be flagged by entropy analysis

'use strict';

// These look like real API keys and tokens
var stripeKey = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc8Rk2tG5xNm9ABcDe';
var awsSecret = 'wJalrXUtnFEMIK7MDENG5bPxRfiCYEXAMPLEKEY99';
var jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw';
var hexSecret = 'a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9';

module.exports = {
  stripeKey: stripeKey,
  awsSecret: awsSecret,
  jwtToken: jwtToken,
  hexSecret: hexSecret,
};
