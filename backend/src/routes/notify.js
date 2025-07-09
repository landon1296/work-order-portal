const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const SPREADSHEET_ID = process.env.SHEET_ID;

// Sheets client helper
function getSheetsClient() {
  const sheetsClient = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth: sheetsClient });
}

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address
    pass: process.env.EMAIL_PASS, // Your Gmail "App Password"
  },
});

// POST /api/notify/email
router.post('/email', async (req, res) => {
  const { to, subject, text } = req.body;

  if (!to || !subject || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    });
    res.json({ message: 'Email sent!', info });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// GET /api/notify/recipients
router.get('/recipients', async (req, res) => {
  try {
    const sheets = getSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Config!D2:D', // D2 and down
    });
    const rows = resp.data.values || [];
    const emails = rows.map(r => r[0]).filter(email => email && email.includes('@'));
    res.json({ emails });
  } catch (e) {
    console.error('Failed to fetch notification emails:', e);
    res.status(500).json({ error: 'Failed to fetch notification emails.' });
  }
});

// Export router at the very end!
module.exports = router;
