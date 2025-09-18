const { google } = require('googleapis');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Initialize Google Sheets API client
const authClient = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth: authClient });
const SPREADSHEET_ID = process.env.SHEET_ID;
(async () => {
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    console.log('📑 Available sheet tabs:', meta.data.sheets.map(s => s.properties.title));
  } catch (err) {
    console.error('Error fetching sheet metadata:', err);
  }
})();

function setupAuthRoutes(app) {
  app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Users!A2:C'
      });
      const rows = resp.data.values || [];
      console.log('🔍 Users rows:', rows);

      const userRow = rows.find(r => r[0] === username);
      if (!userRow) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const [ , hash, roleString ] = userRow;
      const valid = await bcrypt.compare(password, hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Parse comma-separated roles and create roles array
      const roles = roleString.split(',').map(r => r.trim()).filter(r => r);
      const primaryRole = roles[0]; // First role is the primary/default role
      const role = primaryRole; // For backward compatibility

      console.log(`🔑 User ${username} has roles:`, roles, `(primary: ${primaryRole})`);

      const token = jwt.sign({ username, role, roles, primaryRole }, process.env.JWT_SECRET, { expiresIn: '8h' });
      res.json({ token, role, roles, primaryRole, username });
    } catch (error) {
      console.error('Error fetching Users sheet:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

module.exports = { setupAuthRoutes };