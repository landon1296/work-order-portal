// backend/src/routes/alerts.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');


// POST /api/alerts -- Add a new alert (now in DB)
router.post('/', async (req, res) => {
  const { workOrderNo, partNumber } = req.body;
  if (!workOrderNo || !partNumber) return res.status(400).json({ error: 'Missing info' });
  try {
    const result = await pool.query(
      `INSERT INTO alerts (work_order_no, part_number) VALUES ($1, $2) RETURNING *`,
      [workOrderNo, partNumber]
    );
    res.json({ success: true, alert: result.rows[0] });
  } catch (err) {
    console.error('Failed to save alert:', err);
    res.status(500).json({ error: 'Failed to save alert.' });
  }
});


// GET /api/alerts -- List all alerts (now in DB)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, work_order_no AS "workOrderNo", part_number AS "partNumber", created_at AS "time" FROM alerts ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch alerts:', err);
    res.status(500).json({ error: 'Failed to fetch alerts.' });
  }
});


// DELETE /api/alerts/:id -- Clear an alert by ID (now in DB)
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query(
      `DELETE FROM alerts WHERE id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete alert:', err);
    res.status(500).json({ error: 'Failed to delete alert.' });
  }
});


module.exports = router;
