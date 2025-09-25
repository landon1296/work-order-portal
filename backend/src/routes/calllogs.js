const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { auth } = require('../middleware/auth');

// Get all call logs
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT *, TO_CHAR(date, \'YYYY-MM-DD\') as date_string FROM call_logs ORDER BY date DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching call logs:', error);
    res.status(500).json({ error: 'Failed to fetch call logs' });
  }
});

// Get call logs for a specific date range
router.get('/date-range', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const result = await pool.query(
      'SELECT *, TO_CHAR(date, \'YYYY-MM-DD\') as date_string FROM call_logs WHERE date >= $1 AND date <= $2 ORDER BY date ASC',
      [startDate, endDate]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching call logs by date range:', error);
    res.status(500).json({ error: 'Failed to fetch call logs' });
  }
});

// Get call logs for a specific date
router.get('/date/:date', auth, async (req, res) => {
  try {
    const { date } = req.params;
    
    const result = await pool.query(
      'SELECT *, TO_CHAR(date, \'YYYY-MM-DD\') as date_string FROM call_logs WHERE date = $1 ORDER BY created_at ASC',
      [date]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching call logs for date:', error);
    res.status(500).json({ error: 'Failed to fetch call logs for date' });
  }
});

// Create a new call log
router.post('/', auth, async (req, res) => {
  try {
    const { 
      date, 
      company_name, 
      contact_name, 
      email, 
      phone_number, 
      notes,
      schedule_frequency,
      schedule_interval,
      schedule_end_date,
      schedule_custom_days,
      call_completed,
      completed_dates,
      converted_dates,
      lead_potential
    } = req.body;
    
    if (!date || !company_name || !contact_name) {
      return res.status(400).json({ error: 'Date, company name, and contact name are required' });
    }

    // Create original_date_key from the date
    const originalDateKey = new Date(date).toISOString().split('T')[0];

    const result = await pool.query(
      `INSERT INTO call_logs (
        date, company_name, contact_name, email, phone_number, notes, 
        created_by, updated_by, schedule_frequency, schedule_interval, 
        schedule_end_date, schedule_custom_days, call_completed, 
        completed_dates, original_date_key, lead_potential, converted_dates
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *, TO_CHAR(date, 'YYYY-MM-DD') as date_string`,
      [
        date,
        company_name,
        contact_name,
        email || null,
        phone_number || null,
        notes || null,
        req.user.username || req.user.name || 'Unknown',
        req.user.username || req.user.name || 'Unknown',
        schedule_frequency || null,
        schedule_interval || null,
        schedule_end_date || null,
        schedule_custom_days || null,
        call_completed || false,
        completed_dates || [],
        originalDateKey,
        typeof lead_potential === 'number' ? lead_potential : 0,
        Array.isArray(converted_dates) ? converted_dates : []
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating call log:', error);
    res.status(500).json({ error: 'Failed to create call log' });
  }
});

// Update a call log
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      date, 
      company_name, 
      contact_name, 
      email, 
      phone_number, 
      notes,
      schedule_frequency,
      schedule_interval,
      schedule_end_date,
      schedule_custom_days,
      call_completed,
      completed_dates,
      converted_dates,
      lead_potential
    } = req.body;
    
    if (!date || !company_name || !contact_name) {
      return res.status(400).json({ error: 'Date, company name, and contact name are required' });
    }

    const result = await pool.query(
      `UPDATE call_logs 
       SET date = $1, company_name = $2, contact_name = $3, email = $4, 
           phone_number = $5, notes = $6, updated_by = $7, updated_at = CURRENT_TIMESTAMP,
           schedule_frequency = $8, schedule_interval = $9, schedule_end_date = $10, 
           schedule_custom_days = $11, call_completed = $12, completed_dates = $13,
           lead_potential = $14, converted_dates = $15
       WHERE id = $16
       RETURNING *, TO_CHAR(date, 'YYYY-MM-DD') as date_string`,
      [
        date,
        company_name,
        contact_name,
        email || null,
        phone_number || null,
        notes || null,
        req.user.username || req.user.name || 'Unknown',
        schedule_frequency || null,
        schedule_interval || null,
        schedule_end_date || null,
        schedule_custom_days || null,
        call_completed || false,
        completed_dates || [],
        typeof lead_potential === 'number' ? lead_potential : 0,
        converted_dates || [],
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating call log:', error);
    res.status(500).json({ error: 'Failed to update call log' });
  }
});

// Delete a call log
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM call_logs WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    res.json({ message: 'Call log deleted successfully' });
  } catch (error) {
    console.error('Error deleting call log:', error);
    res.status(500).json({ error: 'Failed to delete call log' });
  }
});

// Mark a specific date as completed for a call log
router.post('/:id/complete-date', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // Get the current call log
    const currentResult = await pool.query(
      'SELECT * FROM call_logs WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    const callLog = currentResult.rows[0];
    const currentCompletedDates = callLog.completed_dates || [];
    
    // Add the date to completed dates if not already there
    if (!currentCompletedDates.includes(date)) {
      const updatedCompletedDates = [...currentCompletedDates, date];
      
      const result = await pool.query(
        'UPDATE call_logs SET completed_dates = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *, TO_CHAR(date, \'YYYY-MM-DD\') as date_string',
        [updatedCompletedDates, id]
      );

      res.json(result.rows[0]);
    } else {
      // Date already completed
      res.json(callLog);
    }
  } catch (error) {
    console.error('Error marking date as completed:', error);
    res.status(500).json({ error: 'Failed to mark date as completed' });
  }
});

// Unmark a specific date as completed for a call log
router.post('/:id/uncomplete-date', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // Get the current call log
    const currentResult = await pool.query(
      'SELECT * FROM call_logs WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    const callLog = currentResult.rows[0];
    const currentCompletedDates = callLog.completed_dates || [];
    
    // Remove the date from completed dates
    const updatedCompletedDates = currentCompletedDates.filter(d => d !== date);
    
    const result = await pool.query(
      'UPDATE call_logs SET completed_dates = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *, TO_CHAR(date, \'YYYY-MM-DD\') as date_string',
      [updatedCompletedDates, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error unmarking date as completed:', error);
    res.status(500).json({ error: 'Failed to unmark date as completed' });
  }
});

// Mark/unmark a specific date as converted
router.post('/:id/convert-date', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, converted } = req.body; // converted: boolean
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const currentResult = await pool.query('SELECT * FROM call_logs WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) return res.status(404).json({ error: 'Call log not found' });
    const callLog = currentResult.rows[0];
    const currentConvertedDates = callLog.converted_dates || [];

    let updatedConvertedDates = currentConvertedDates;
    if (converted) {
      if (!currentConvertedDates.includes(date)) {
        updatedConvertedDates = [...currentConvertedDates, date];
      }
    } else {
      updatedConvertedDates = currentConvertedDates.filter(d => d !== date);
    }

    const result = await pool.query(
      'UPDATE call_logs SET converted_dates = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *, TO_CHAR(date, \'YYYY-MM-DD\') as date_string',
      [updatedConvertedDates, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating converted date:', error);
    res.status(500).json({ error: 'Failed to update converted date' });
  }
});

module.exports = router;
