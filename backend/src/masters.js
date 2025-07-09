const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SHEET_ID;

// Create auth client *inside* this file:
const authClient = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

// GET /api/masters/technicians
router.get('/technicians', async (req, res) => {
  try {
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Masters!A2:A'
    });
    const techs = (response.data.values || []).flat().filter(Boolean);
    res.json(techs);
  } catch (error) {
    console.error('Error fetching technicians from Masters tab:', error);
    res.status(500).json({ error: 'Failed to fetch technicians' });
  }
});
// GET /api/masters/shops
router.get('/shops', async (req, res) => {
  try {
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Masters!B2:B' // Assumes shops are in column B
    });
    const shops = (response.data.values || []).flat().filter(Boolean);
    res.json(shops);
  } catch (error) {
    console.error('Error fetching shops from Masters tab:', error);
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});
// GET /api/masters/repairTypes
router.get('/repairTypes', async (req, res) => {
  try {
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Masters!C2:C' // Assumes repair types are in column C
    });
    const repairTypes = (response.data.values || []).flat().filter(Boolean);
    res.json(repairTypes);
  } catch (error) {
    console.error('Error fetching repair types from Masters tab:', error);
    res.status(500).json({ error: 'Failed to fetch repair types' });
  }
});
// GET /api/masters/salesnames
router.get('/salesnames', async (req, res) => {
  try {
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Masters!D2:D' // adjust column as needed
    });
    const salesNames = (response.data.values || []).flat().filter(Boolean);
    res.json(salesNames);
  } catch (error) {
    console.error('Error fetching sales names from Masters tab:', error);
    res.status(500).json({ error: 'Failed to fetch sales names' });
  }
});


module.exports = router;
