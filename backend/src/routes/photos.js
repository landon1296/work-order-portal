const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../../supabaseClient.js');
const pool = require('../../db');
const { v4: uuidv4 } = require('uuid');

// Set up multer to handle file uploads in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/upload', upload.single('photo'), async (req, res) => {
  const file = req.file;
  const { workOrderNo, description } = req.body;

  if (!file || !workOrderNo) {
    return res.status(400).json({ error: 'Missing file or workOrderNo' });
  }

  const filename = `${workOrderNo}/${uuidv4()}-${file.originalname}`;

  try {
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('workorder-photos')
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data } = supabase.storage
      .from('workorder-photos')
      .getPublicUrl(filename);

    const imageUrl = data.publicUrl;

    // Insert metadata into workorder_photos table
    await pool.query(
      `INSERT INTO workorder_photos (work_order_no, url, description)
       VALUES ($1, $2, $3)`,
      [workOrderNo, imageUrl, description || null]
    );

    res.status(200).json({ message: 'Photo uploaded successfully!', url: imageUrl });
  } catch (err) {
    console.error('Photo upload failed:', err);
    res.status(500).json({ error: 'Photo upload failed' });
  }
});

// GET /api/photos/:workOrderNo
router.get('/:workOrderNo', async (req, res) => {
  const { workOrderNo } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, url, description, created_at
       FROM workorder_photos
       WHERE work_order_no = $1
       ORDER BY created_at ASC`,
      [workOrderNo]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch photos:', err);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }

  
});
// DELETE /api/photos/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT url FROM workorder_photos WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const url = rows[0].url;
    const path = decodeURIComponent(url.split('/workorder-photos/')[1]);

console.log('🗑 Deleting Supabase storage path:', path); // Add this
    const { error: deleteError } = await supabase.storage
      .from('workorder-photos')
      
      .remove([path]);

    if (deleteError) throw deleteError;

    await pool.query(`DELETE FROM workorder_photos WHERE id = $1`, [id]);

    res.status(200).json({ message: 'Photo deleted' });
  } catch (err) {
    console.error('Delete failed:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

module.exports = router;
