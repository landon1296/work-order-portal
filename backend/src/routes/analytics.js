const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { requireAnalyticsRole } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const SPREADSHEET_ID = process.env.SHEET_ID;

// Helper to get Google Sheets client
async function getSheetsClient() {
  const authClient = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const client = await authClient.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// GET /api/analytics/summary
router.get('/summary', requireAnalyticsRole, async (req, res) => {
  try {
    const sheets = await getSheetsClient();

    // === 1. Fetch Master WorkOrders from workorders.json ===
    const workOrdersPath = path.join(__dirname, '..', 'workorders.json');
    let woRows = [];
    try {
      const woData = JSON.parse(fs.readFileSync(workOrdersPath, 'utf8'));
      woRows = woData;
    } catch (e) {
      woRows = [];
    }

    // === 2. Fetch LineItems ===
    const liResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'LineItems!A2:E',
    });
    const liRows = liResp.data.values || [];

    // === 3. Fetch TimeLogs (optional, for technician stats) ===
    const tlResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'TimeLogs!A2:F',
    });
    const tlRows = tlResp.data.values || [];

    // === Prepare Analytics ===
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    let totalOrders = 0, ordersThisYear = 0, ordersThisMonth = 0;
    let closedOrders = 0, waitingPartOrders = 0;
    let statusCounts = {};
    let shopCounts = {};
    let daysToCloseSum = 0, closedCount = 0;
    let activeStatusCounts = {};

    woRows.forEach(row => {
      totalOrders++;
      const dateStr = row.date || '';
      const status = (row.status || '').trim();
      const shop = (row.shop || '').trim();
      const closedDays = parseFloat(row.closedDays || '0');

      // Date filters
      if (dateStr) {
        const [yr, mon] = dateStr.split('-');
        if (yr == thisYear) ordersThisYear++;
        if (yr == thisYear && mon == thisMonth) ordersThisMonth++;
      }

      // Status
      if (status) {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        const statusLC = status.toLowerCase();
        if (
        statusLC.includes('pending parts') ||
        statusLC.includes('waiting on part') ||
        statusLC.includes('pending part') ||
        statusLC.includes('awaiting part')
        ) {
        waitingPartOrders++;
        }

        if (status.toLowerCase().includes('closed')) closedOrders++;
        if (!status.toLowerCase().includes('closed')) {
          activeStatusCounts[status] = (activeStatusCounts[status] || 0) + 1;
        }
      }
      if (shop) shopCounts[shop] = (shopCounts[shop] || 0) + 1;

      // Days to close
      if (closedDays > 0) {
        daysToCloseSum += closedDays;
        closedCount++;
      }
    });

    // 4. Average days to close
    const avgDaysToClose = closedCount ? (daysToCloseSum / closedCount).toFixed(1) : null;

    // 5. Top 5 most used parts (by part number)
    const partUse = {};
    liRows.forEach(row => {
      const partNum = (row[1] || '').trim();
      const desc = (row[2] || '').trim();
      if (partNum) {
        partUse[partNum] = partUse[partNum] || { count: 0, description: desc };
        partUse[partNum].count += 1;
      }
    });
    const topParts = Object.entries(partUse)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([partNumber, data]) => ({
        partNumber,
        description: data.description,
        count: data.count,
      }));

    // 6. Work orders by technician (from TimeLogs sheet)
    const techCounts = {};
    tlRows.forEach(row => {
      const tech = (row[1] || '').trim();
      if (tech) techCounts[tech] = (techCounts[tech] || 0) + 1;
    });

    // 7. Trend: new work orders per month (last 12 months)
    const ordersByMonth = {};
    woRows.forEach(row => {
      const dateStr = row.date || '';
      if (dateStr.match(/^\d{4}-\d{2}/)) {
        const ym = dateStr.slice(0, 7); // yyyy-mm
        ordersByMonth[ym] = (ordersByMonth[ym] || 0) + 1;
      }
    });

    // 8. Slow movers: open > X days
    const slowWOs = woRows
      .filter(row => {
        const status = (row.status || '').toLowerCase();
        if (status.includes('closed')) return false;
        const createdAt = row.createdAt;
        if (!createdAt) return false;
        const daysOpen = (now - new Date(createdAt)) / (1000 * 60 * 60 * 24);
        return daysOpen > 10;
      })
      .map(row => ({
        workOrderNo: row.workOrderNo,
        status: row.status,
        createdAt: row.createdAt,
      }));

    res.json({
      totalOrders,
      ordersThisYear,
      ordersThisMonth,
      closedOrders,
      waitingPartOrders,
      avgDaysToClose,
      shopCounts,
      statusCounts,
      activeStatusCounts,
      topParts,
      techCounts,
      ordersByMonth,
      slowWOs,
      allWorkOrders: woRows,
    });
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ error: 'Failed to get analytics.' });
  }
});

module.exports = router;
