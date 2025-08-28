const express = require('express');
const router = express.Router();
const pool = require('../../db');

// GET /api/notifications - Get notifications for a specific user
router.get('/', async (req, res) => {
  try {
    const { userId, role } = req.query;
    
    let query = `
      SELECT * FROM notifications 
      WHERE recipient_id = $1 OR recipient_role = $2
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    const result = await pool.query(query, [userId, role]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// POST /api/notifications - Create a new notification
router.post('/', async (req, res) => {
  try {
    const { 
      recipientId, 
      recipientRole, 
      recipientEmail, 
      recipientName,
      workOrderNo, 
      message, 
      type = 'work_order_created',
      createdBy 
    } = req.body;

    const result = await pool.query(
      `INSERT INTO notifications (
        recipient_id, recipient_role, recipient_email, recipient_name,
        work_order_no, message, type, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        recipientId, 
        recipientRole, 
        recipientEmail, 
        recipientName,
        workOrderNo, 
        message, 
        type, 
        createdBy
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// PATCH /api/notifications/:id/read - Mark notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE notifications 
       SET read_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
