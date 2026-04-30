const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/platforms
router.get('/', (req, res) => {
  const platforms = db.prepare('SELECT * FROM platforms ORDER BY name').all();
  res.json({ success: true, data: platforms });
});

module.exports = router;
