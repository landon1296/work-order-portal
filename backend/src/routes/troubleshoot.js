const express = require('express');
const router = express.Router();
const pool = require('../../db');

// GET all troubleshoot records
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM troubleshoot ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching troubleshoot records:', error);
    res.status(500).json({ error: 'Failed to fetch troubleshoot records' });
  }
});

// GET single troubleshoot record by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM troubleshoot WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Troubleshoot record not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching troubleshoot record:', error);
    res.status(500).json({ error: 'Failed to fetch troubleshoot record' });
  }
});

// POST new troubleshoot record
router.post('/', async (req, res) => {
  try {
    const {
      workOrderNo,
      companyName,
      date,
      contactName,
      contactPhone,
      contactEmail,
      make,
      model,
      serialNumber,
      workDescription,
      notes,
      technicianAssigned,
      assignDate
    } = req.body;

    const result = await pool.query(
      `INSERT INTO troubleshoot (
        work_order_no, company_name, date, contact_name, contact_phone,
        contact_email, make, model, serial_number, work_description,
        notes, technician_assigned, assign_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        workOrderNo,
        companyName,
        date,
        contactName,
        contactPhone,
        contactEmail,
        make,
        model,
        serialNumber,
        workDescription,
        notes,
        technicianAssigned,
        assignDate,
        'Active' // Default status for new records
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating troubleshoot record:', error);
    res.status(500).json({ error: 'Failed to create troubleshoot record' });
  }
});

// PUT update troubleshoot record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      workOrderNo,
      companyName,
      date,
      contactName,
      contactPhone,
      contactEmail,
      make,
      model,
      serialNumber,
      workDescription,
      notes,
      technicianAssigned,
      assignDate,
      status
    } = req.body;

    const result = await pool.query(
      `UPDATE troubleshoot SET 
        work_order_no = $1, company_name = $2, date = $3, contact_name = $4, 
        contact_phone = $5, contact_email = $6, make = $7, model = $8, 
        serial_number = $9, work_description = $10, notes = $11, 
        technician_assigned = $12, assign_date = $13, status = $14
      WHERE id = $15 RETURNING *`,
      [
        workOrderNo,
        companyName,
        date,
        contactName,
        contactPhone,
        contactEmail,
        make,
        model,
        serialNumber,
        workDescription,
        notes,
        technicianAssigned,
        assignDate,
        status,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Troubleshoot record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating troubleshoot record:', error);
    res.status(500).json({ error: 'Failed to update troubleshoot record' });
  }
});

// PATCH update troubleshoot status (for closing orders)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      `UPDATE troubleshoot SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Troubleshoot record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating troubleshoot status:', error);
    res.status(500).json({ error: 'Failed to update troubleshoot status' });
  }
});

// DELETE troubleshoot record
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM troubleshoot WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Troubleshoot record not found' });
    }
    
    res.json({ message: 'Troubleshoot record deleted successfully' });
  } catch (error) {
    console.error('Error deleting troubleshoot record:', error);
    res.status(500).json({ error: 'Failed to delete troubleshoot record' });
  }
});

module.exports = router;
