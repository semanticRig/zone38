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

module.exports = {
  greeting: greeting,
  message: message,
  placeholder: placeholder,
  description: description,
  url: url,
  uuid: uuid,
  filepath: filepath,
};
