// Fixture: backend file with context-confusion bugs
// Located under server/ to trigger isBackend classification

var express = require('express');

function handleRequest(req, res) {
  // AI context confusion: using browser APIs in server code
  var token = localStorage.getItem('auth_token');
  var appDiv = document.getElementById('app');
  window.location.href = '/dashboard';

  res.json({ token: token });
}

module.exports = handleRequest;
