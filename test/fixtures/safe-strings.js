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
window.DRAWIO_GITLAB_ID = window.DRAWIO_GITLAB_ID || '2b14debc5feeb18ba65358d863ec870e4cc9294b28c3c941cb3014eb4af9a9b4';
window.DRAWIO_DROPBOX_ID = window.DRAWIO_DROPBOX_ID || 'jg02tc0onwmhlgm';
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
