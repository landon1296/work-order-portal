// backend/src/routes/alerts.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ALERTS_FILE = path.join(__dirname, '../../alerts.json');

// Helper: Load alerts
function loadAlerts() {
  if (!fs.existsSync(ALERTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8') || '[]');
}

// Helper: Save alerts
function saveAlerts(alerts) {
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
}

// POST /api/alerts -- Add a new alert
router.post('/', (req, res) => {
  const { workOrderNo, partNumber } = req.body;
  if (!workOrderNo || !partNumber) return res.status(400).json({ error: 'Missing info' });
  const alerts = loadAlerts();
  alerts.push({
    id: Date.now(),
    workOrderNo,
    partNumber,
    time: new Date().toISOString(),
  });
  saveAlerts(alerts);
  res.json({ success: true });
});

// GET /api/alerts -- List all alerts
router.get('/', (req, res) => {
  res.json(loadAlerts());
});

// DELETE /api/alerts/:id -- Clear an alert by ID
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  let alerts = loadAlerts();
  alerts = alerts.filter(alert => alert.id !== id);
  saveAlerts(alerts);
  res.json({ success: true });
});

module.exports = router;
