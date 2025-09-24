const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { auth } = require('../middleware/auth');

// Get all notes for a call log
router.get('/call-log/:callLogId', auth, async (req, res) => {
  try {
    const { callLogId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM call_log_notes WHERE call_log_id = $1 ORDER BY created_at ASC',
      [callLogId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching call log notes:', error);
    res.status(500).json({ error: 'Failed to fetch call log notes' });
  }
});

// Add a new note to a call log
router.post('/', auth, async (req, res) => {
  try {
    const { call_log_id, note } = req.body;
    
    if (!call_log_id || !note) {
      return res.status(400).json({ error: 'Call log ID and note are required' });
    }

    const result = await pool.query(
      'INSERT INTO call_log_notes (call_log_id, note, created_by) VALUES ($1, $2, $3) RETURNING *',
      [call_log_id, note, req.user.username || req.user.name || 'Unknown']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating call log note:', error);
    res.status(500).json({ error: 'Failed to create call log note' });
  }
});

// Update a note
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    
    if (!note) {
      return res.status(400).json({ error: 'Note is required' });
    }

    const result = await pool.query(
      'UPDATE call_log_notes SET note = $1 WHERE id = $2 RETURNING *',
      [note, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating call log note:', error);
    res.status(500).json({ error: 'Failed to update call log note' });
  }
});

// Delete a note
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM call_log_notes WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting call log note:', error);
    res.status(500).json({ error: 'Failed to delete call log note' });
  }
});

module.exports = router;
