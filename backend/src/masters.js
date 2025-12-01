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

// GET /api/masters/makes
router.get('/makes', async (req, res) => {
  try {
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Masters!E2:E' // Assumes makes are in column E
    });
    const makes = (response.data.values || []).flat().filter(Boolean);
    res.json(makes);
  } catch (error) {
    console.error('Error fetching makes from Masters tab:', error);
    res.status(500).json({ error: 'Failed to fetch makes' });
  }
});

// GET /api/masters/models
router.get('/models', async (req, res) => {
  try {
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // Pull from columns E (Make) and F (Model)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Masters!E2:F' // Make in column E, Model in column F
    });
    
    const models = (response.data.values || []).map(row => ({
      make: row[0] || '',
      model: row[1] || ''
    })).filter(item => item.make && item.model);
    
    res.json(models);
  } catch (error) {
    console.error('Error fetching models from Masters tab:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// GET /api/masters/makes-models
router.get('/makes-models', async (req, res) => {
  try {
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Masters!E2:F', // E=Make, F=Model, skip header row
    });
    const rows = response.data.values || [];
    res.json(rows); // Each row: [make, model]
  } catch (error) {
    console.error('Error fetching makes and models from Masters tab:', error);
    res.status(500).json({ error: 'Failed to fetch makes and models.' });
  }
});

// GET /api/masters/managers
router.get('/managers', async (req, res) => {
  try {
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Users!A2:C', // A=Username, B=HashedPassword, C=Role
    });
    
    const users = (response.data.values || []).map(row => ({
      name: row[0] || '',
      username: row[0] || '', // Use username as identifier
      role: row[2] || ''
    })).filter(user => user.name && user.role && user.role.toLowerCase().includes('manager'));
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching managers from Users tab:', error);
    res.status(500).json({ error: 'Failed to fetch managers.' });
  }
});

// GET /api/masters/sales-machines
// Expected SalesMasters tab structure:
// Column A: Brand (Make)
// Column B: Machine/Item (Model)
// Column C: Brand & Machine (combined identifier, optional)
// Column D: Sale Price (for new sales)
// Column E: Commission % New
// Column F: Commission % Used
// Column G: Commission Service (flat amount, not percentage)
// Column H: Rental Daily Rate
// Column I: Rental Weekly Rate
// Column J: Rental Monthly Rate
// Column K: Commission Flat Rate Sales (flat amount for new/used sales, overrides percentage)
router.get('/sales-machines', async (req, res) => {
  try {
    const client = await authClient.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'SalesMasters!A2:K', // Brand, Machine/Item, Brand & Machine, Sale Price, Commission % New, Commission % Used, Commission Service, Rental Daily, Rental Weekly, Rental Monthly, Commission Flat Rate Sales
    });
    
    const machines = (response.data.values || []).map(row => {
      // Parse commission percentages (remove % sign if present)
      const parsePercent = (val) => {
        if (!val) return null;
        const str = String(val).replace('%', '').trim();
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
      };
      
      // Parse flat amounts (for service commission and flat rate sales)
      const parseAmount = (val) => {
        if (!val) return null;
        const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        return isNaN(num) ? null : num;
      };
      
      return {
        brand: row[0] || '',
        machine: row[1] || '',
        brandAndMachine: row[2] || '',
        salePrice: row[3] ? parseFloat(String(row[3]).replace(/[^0-9.-]/g, '')) : null,
        commissionPercentNew: parsePercent(row[4]),
        commissionPercentUsed: parsePercent(row[5]),
        commissionService: parseAmount(row[6]), // Flat amount for service
        rentalDailyRate: row[7] ? parseFloat(String(row[7]).replace(/[^0-9.-]/g, '')) : null,
        rentalWeeklyRate: row[8] ? parseFloat(String(row[8]).replace(/[^0-9.-]/g, '')) : null,
        rentalMonthlyRate: row[9] ? parseFloat(String(row[9]).replace(/[^0-9.-]/g, '')) : null,
        commissionFlatRateSales: parseAmount(row[10]) // Flat rate for sales (overrides percentage)
      };
    }).filter(machine => machine.brand && machine.machine);
    
    res.json(machines);
  } catch (error) {
    console.error('Error fetching sales machines from SalesMasters tab:', error);
    res.status(500).json({ error: 'Failed to fetch sales machines.' });
  }
});

module.exports = router;
