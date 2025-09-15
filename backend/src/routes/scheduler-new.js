const express = require('express');
const pool = require('../../db');
const router = express.Router();

// POST /api/scheduler - Create a new pickup schedule
router.post('/', async (req, res) => {
  try {
    console.log('Received request body:', req.body);
    
    const {
      companyName,
      address,
      city,
      state,
      zipcode,
      contactName,
      phoneNumber,
      email,
      make,
      model,
      serialNumber,
      shop,
      pickupDate,
      notes
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'companyName', 'contactName', 'phoneNumber', 'make', 'shop', 'pickupDate'
    ];

    for (const field of requiredFields) {
      if (!req.body[field] || req.body[field].trim() === '') {
        console.log(`Validation failed for field: ${field}, value:`, req.body[field]);
        return res.status(400).json({ 
          error: `Missing required field: ${field}`,
          received: req.body[field]
        });
      }
    }

    // Insert into scheduler table - handle optional address fields
    const result = await pool.query(`
      INSERT INTO scheduler (
        company_name, address, city, state, zipcode, contact_name, phone_number, email, make, model, serial_number, shop, pickup_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      companyName,    // company_name NOT NULL
      address && address.trim() !== '' ? address : null,        // address NULL
      city && city.trim() !== '' ? city : null,                // city NULL
      state && state.trim() !== '' ? state : null,             // state NULL
      zipcode && zipcode.trim() !== '' ? zipcode : null,       // zipcode NULL
      contactName,   // contact_name NOT NULL
      phoneNumber,   // phone_number NOT NULL
      email && email.trim() !== '' ? email : null,             // email NULL
      make,          // make NOT NULL
      model && model.trim() !== '' ? model : null,             // model NULL
      serialNumber && serialNumber.trim() !== '' ? serialNumber : null, // serial_number NULL
      shop,          // shop NOT NULL
      pickupDate,    // pickup_date NOT NULL
      notes && notes.trim() !== '' ? notes : null              // notes NULL
    ]);

    res.status(201).json({
      message: 'Pickup scheduled successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating pickup schedule:', error);
    console.error('Request body:', req.body);
    res.status(500).json({ 
      error: 'Failed to create pickup schedule',
      details: error.message 
    });
  }
});

// GET /api/scheduler - Get all scheduled pickups
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM scheduler 
      ORDER BY pickup_date ASC, created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scheduled pickups:', error);
    res.status(500).json({
      error: 'Failed to fetch scheduled pickups',
      details: error.message
    });
  }
});

// PUT /api/scheduler/:id - Update a scheduled pickup
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Updating pickup ID:', id, 'with data:', req.body);
    
    const {
      companyName,
      address,
      city,
      state,
      zipcode,
      contactName,
      phoneNumber,
      email,
      make,
      model,
      serialNumber,
      shop,
      pickupDate,
      notes
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'companyName', 'contactName', 'phoneNumber', 'make', 'shop', 'pickupDate'
    ];

    for (const field of requiredFields) {
      if (!req.body[field] || req.body[field].trim() === '') {
        console.log(`Validation failed for field: ${field}, value:`, req.body[field]);
        return res.status(400).json({ 
          error: `Missing required field: ${field}`,
          received: req.body[field]
        });
      }
    }

    // Update the pickup
    const result = await pool.query(`
      UPDATE scheduler SET
        company_name = $1,
        address = $2,
        city = $3,
        state = $4,
        zipcode = $5,
        contact_name = $6,
        phone_number = $7,
        email = $8,
        make = $9,
        model = $10,
        serial_number = $11,
        shop = $12,
        pickup_date = $13,
        notes = $14,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *
    `, [
      companyName,
      address,
      city,
      state,
      zipcode && zipcode.trim() !== '' ? zipcode : null,
      contactName,
      phoneNumber,
      email && email.trim() !== '' ? email : null,
      make,
      model && model.trim() !== '' ? model : null,
      serialNumber && serialNumber.trim() !== '' ? serialNumber : null,
      shop,
      pickupDate,
      notes && notes.trim() !== '' ? notes : null,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pickup not found' });
    }

    res.json({
      message: 'Pickup updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating pickup schedule:', error);
    console.error('Request body:', req.body);
    res.status(500).json({ 
      error: 'Failed to update pickup schedule',
      details: error.message 
    });
  }
});

// PATCH /api/scheduler/:id/complete - Mark a pickup as completed
router.patch('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Marking pickup as completed, ID:', id);
    
    const result = await pool.query(
      'UPDATE scheduler SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['Completed', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Pickup schedule not found' 
      });
    }

    res.json({
      message: 'Pickup marked as completed successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error marking pickup as completed:', error);
    res.status(500).json({ 
      error: 'Failed to mark pickup as completed',
      details: error.message 
    });
  }
});

// DELETE /api/scheduler/:id - Delete a scheduled pickup
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting pickup ID:', id);
    
    const result = await pool.query(
      'DELETE FROM scheduler WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Pickup schedule not found' 
      });
    }

    res.json({
      message: 'Pickup schedule deleted successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error deleting pickup schedule:', error);
    res.status(500).json({ 
      error: 'Failed to delete pickup schedule',
      details: error.message 
    });
  }
});

module.exports = router;
