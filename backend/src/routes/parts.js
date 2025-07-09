const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SHEET_ID;

// GET /api/parts/memory
router.get('/memory', async (req, res) => {
  try {
    // Auth client for Google Sheets
    const authClient = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Fetch all parts from LineItems tab, columns: A = WorkOrderNo, B = PartNumber, C = Description
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'LineItems!A2:C',
    });

    const rows = resp.data.values || [];

    // Deduplicate by partNumber, use last description found
    const mem = {};
    rows.forEach(r => {
      const partNumber = (r[1] || '').trim();
      const description = (r[2] || '').trim();
      if (partNumber) mem[partNumber] = description;
    });
    // Convert object to array for frontend
    const memory = Object.entries(mem).map(([partNumber, description]) => ({ partNumber, description }));

    res.json(memory);
  } catch (err) {
    console.error('Failed to fetch parts memory:', err);
    res.status(500).json({ error: 'Failed to fetch parts memory.' });
  }
});

module.exports = router;
