const express = require('express');
const pool = require('../../db');
const router = express.Router();

// Helper function to convert camelCase to snake_case
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

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
      pickupDate
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'companyName', 'address', 'city', 'state',
      'contactName', 'phoneNumber', 'make', 'shop', 'pickupDate'
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

    // Insert into scheduler table - match exact table schema
    const result = await pool.query(
      `INSERT INTO scheduler (
        company_name, address, city, state, zipcode,
        contact_name, phone_number, email, make, model, serial_number, shop, pickup_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        companyName,                    // company_name NOT NULL
        address,                        // address NOT NULL
        city,                          // city NOT NULL
        state,                         // state NOT NULL
        zipcode && zipcode.trim() !== '' ? zipcode : null,  // zipcode NULL
        contactName,                   // contact_name NOT NULL
        phoneNumber,                   // phone_number NOT NULL
        email && email.trim() !== '' ? email : null,        // email NULL
        make,                          // make NOT NULL
        model && model.trim() !== '' ? model : null,        // model NULL
        serialNumber && serialNumber.trim() !== '' ? serialNumber : null, // serial_number NULL
        shop,                          // shop NOT NULL
        pickupDate                     // pickup_date NOT NULL
      ]
    );

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

// GET /api/scheduler - Get all pickup schedules
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM scheduler 
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pickup schedules:', error);
    res.status(500).json({ 
      error: 'Failed to fetch pickup schedules' 
    });
  }
});

// GET /api/scheduler/:id - Get a specific pickup schedule
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM scheduler WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Pickup schedule not found' 
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching pickup schedule:', error);
    res.status(500).json({ 
      error: 'Failed to fetch pickup schedule' 
    });
  }
});

// PUT /api/scheduler/:id - Update a pickup schedule
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'companyName', 'address', 'city', 'state', 'zipcode',
      'contactName', 'phoneNumber', 'email', 'make', 'model', 
      'serialNumber', 'shop', 'pickupDate', 'status'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        const snakeKey = toSnakeCase(key);
        updateFields.push(`${snakeKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        error: 'No valid fields to update' 
      });
    }

    // Add updated_at
    updateFields.push(`updated_at = $${paramCount}`);
    values.push(new Date().toISOString());
    paramCount++;

    // Add id for WHERE clause
    values.push(id);

    const query = `
      UPDATE scheduler 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Pickup schedule not found' 
      });
    }

    res.json({
      message: 'Pickup schedule updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating pickup schedule:', error);
    res.status(500).json({ 
      error: 'Failed to update pickup schedule' 
    });
  }
});

// DELETE /api/scheduler/:id - Delete a pickup schedule
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
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
      message: 'Pickup schedule deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting pickup schedule:', error);
    res.status(500).json({ 
      error: 'Failed to delete pickup schedule' 
    });
  }
});

module.exports = router;
