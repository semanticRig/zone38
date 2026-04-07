// Fixture: file with low-entropy strings that should NOT be flagged
// Entropy analysis should produce zero findings here

'use strict';

var greeting = 'Hello and welcome to the application dashboard';
var message = 'Please enter your username and password to continue';
var placeholder = 'This is a placeholder string for testing purposes only';
var description = 'The quick brown fox jumps over the lazy dog again';
var url = 'https://api.example.com/v1/users/profile';
var uuid = '550e8400-e29b-41d4-a716-446655440000';
var filepath = './src/components/UserProfile.tsx';

// Context-aware: OAuth client ID with || fallback — should NOT fire
// (public keyword in LHS + fallback pattern raises threshold above H for hex)
window.EXAMPLE_GITLAB_ID = window.EXAMPLE_GITLAB_ID || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
window.EXAMPLE_DROPBOX_ID = window.EXAMPLE_DROPBOX_ID || 'xm4pt7khbr2qnlw';
window.APP_CLIENT_ID = window.APP_CLIENT_ID || 'Iv1.98d62f0431e40543';

module.exports = {
  greeting: greeting,
  message: message,
  placeholder: placeholder,
  description: description,
  url: url,
  uuid: uuid,
  filepath: filepath,
};
