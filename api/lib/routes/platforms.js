const express = require('express');
const { sql } = require('../db');

const router = express.Router();

// GET /api/platforms
router.get('/', async (req, res) => {
  try {
    const platforms = await sql`SELECT * FROM platforms ORDER BY name`;
    res.json({ success: true, data: platforms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
