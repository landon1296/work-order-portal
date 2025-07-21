const express = require('express');
const router = express.Router();
const pool = require('../../db');

// GET /api/parts/memory
router.get('/memory', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT part_number, description
      FROM (
        SELECT part_number, description,
               ROW_NUMBER() OVER (PARTITION BY part_number ORDER BY id DESC) as rn
        FROM line_items
      ) t
      WHERE rn = 1 AND part_number IS NOT NULL AND part_number <> ''
    `);

    const memory = result.rows.map(r => ({
      partNumber: r.part_number,
      description: r.description,
    }));

    res.json(memory);
  } catch (err) {
    console.error('Failed to fetch parts memory:', err);
    res.status(500).json({ error: 'Failed to fetch parts memory.' });
  }
});
// GET /api/parts/memory-live
router.get('/memory-live', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT part_number, description
      FROM line_items
      WHERE TRIM(part_number) <> ''
      ORDER BY part_number ASC
    `);

    const memory = result.rows.map(r => ({
      partNumber: r.part_number,
      description: r.description,
    }));

    res.json(memory);
  } catch (err) {
    console.error('Error fetching live part memory:', err);
    res.status(500).json({ error: 'Failed to fetch part memory' });
  }
});

module.exports = router;
