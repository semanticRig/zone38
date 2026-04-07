// Fixture: a backend-context file for testing context classification
// Located under server/ path to trigger isBackend detection

var express = require('express');
var router = express.Router();

router.get('/api/users', function (req, res) {
  res.json({ users: [] });
});

module.exports = router;
