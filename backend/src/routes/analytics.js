const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { requireAnalyticsRole } = require('../middleware/auth');

// GET /api/analytics/summary - OPTIMIZED VERSION
router.get('/summary', requireAnalyticsRole, async (req, res) => {
  try {
    // Use scalar subqueries for parts and time_logs to avoid Cartesian product
    // (JOIN would duplicate each part once per time entry)
    const query = `
      SELECT 
        w.*,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', li.id,
              'part_number', li.part_number,
              'description', li.description,
              'quantity', li.quantity,
              'waiting', li.waiting,
              'waiting_from', li.waiting_from,
              'waiting_to', li.waiting_to,
              'waiting_days', li.waiting_days,
              'ordered_date', li.ordered_date,
              'estimated_delivery_date', li.estimated_delivery_date
            )
          ) FROM line_items li WHERE li.work_order_no = w.work_order_no),
          '[]'::json
        ) as parts,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', te.id,
              'technician_assigned', te.technician_assigned,
              'assign_date', te.assign_date,
              'start_time', te.start_time,
              'finish_time', te.finish_time,
              'travel_time', te.travel_time
            )
          ) FROM time_entries te WHERE te.work_order_no = w.work_order_no),
          '[]'::json
        ) as time_logs
      FROM workorders w
      ORDER BY w.id DESC
    `;

    const result = await pool.query(query);
    let woRows = result.rows;

    // Convert JSON strings to arrays if needed
    woRows.forEach(wo => {
      if (typeof wo.parts === 'string') {
        try { wo.parts = JSON.parse(wo.parts); } catch { wo.parts = []; }
      }
      if (typeof wo.time_logs === 'string') {
        try { wo.time_logs = JSON.parse(wo.time_logs); } catch { wo.time_logs = []; }
      }
      // Rename for consistency
      wo.timeLogs = wo.time_logs;
      delete wo.time_logs;
    });

    // Ensure every work order has parts and timeLogs as arrays (even if empty)
    woRows.forEach(wo => {
      if (!Array.isArray(wo.parts)) wo.parts = [];
      if (!Array.isArray(wo.timeLogs)) wo.timeLogs = [];
    });

    // === Prepare Analytics ===
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    let totalOrders = woRows.length;
    let ordersThisYear = 0, ordersThisMonth = 0;
    let closedOrders = 0, waitingPartOrders = 0;
    let statusCounts = {};
    let shopCounts = {};
    let daysToCloseSum = 0, closedCount = 0;
    let activeStatusCounts = {};

woRows.forEach(row => {
  // --- Handle date string ---
  let dateStr = row.date;
  if (dateStr instanceof Date) {
    dateStr = dateStr.toISOString().slice(0, 10);
  } else if (typeof dateStr !== "string") {
    dateStr = String(dateStr || "");
  }

  // --- Vars ---
  const status = row.status || '';
  const shop = row.shop || '';


  // --- Your year/month analytics ---
  const [yr, mon] = dateStr.split('-');
  if (yr == thisYear) ordersThisYear++;
  if (yr == thisYear && mon == thisMonth) ordersThisMonth++;

  // --- Status analytics ---
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

    if (statusLC.includes('closed')) closedOrders++;
    if (!statusLC.includes('closed')) {
      activeStatusCounts[status] = (activeStatusCounts[status] || 0) + 1;
    }
  }

  if (shop) shopCounts[shop] = (shopCounts[shop] || 0) + 1;

// --- Days to close based on status_history ---
if ((status || '').toLowerCase().includes('closed') && Array.isArray(row.status_history)) {
  const createdAt = new Date(row.created_at);
  // Find the last (most recent) Closed entry in status_history
  const closedEntry = [...row.status_history].reverse().find(
    entry => (entry.status || '').toLowerCase() === 'closed'
  );
  if (createdAt && closedEntry && closedEntry.date) {
    console.log('AVG KPI DEBUG:', {
  wo: row.work_order_no,
  createdAt,
  closedAt: closedEntry.date,
  days: (new Date(closedEntry.date) - createdAt) / (1000 * 60 * 60 * 24)
});

    const closedAt = new Date(closedEntry.date);
    const days = Math.max(
      0,
      (closedAt - createdAt) / (1000 * 60 * 60 * 24)
    );
    daysToCloseSum += days;
    closedCount++;
  }
}
});


    // 4. Average days to close
    const avgDaysToClose = closedCount ? (daysToCloseSum / closedCount).toFixed(1) : null;

    // 5. Top 5 most used parts (by part number)
    const partUse = {};
    woRows.forEach(row => {
      if (Array.isArray(row.parts)) {
row.parts.forEach(part => {
  const partNum = (part.part_number || part.partNumber || '').trim();
  const desc = (part.description || '').trim();
  if (partNum) {
    partUse[partNum] = partUse[partNum] || { count: 0, description: desc };
    partUse[partNum].count += 1;
  }
});

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

    // 6. Work orders by technician (from all timeLogs)
    const techCounts = {};
    woRows.forEach(row => {
      if (Array.isArray(row.timeLogs)) {
row.timeLogs.forEach(log => {
  const tech = (log.technician_assigned || log.technicianAssigned || '').trim();
  if (tech) techCounts[tech] = (techCounts[tech] || 0) + 1;
});

      }
    });

    // 7. Trend: new work orders per month (last 12 months)
    const ordersByMonth = {};
woRows.forEach(row => {
  let dateStr = row.date;
  if (dateStr instanceof Date) {
    dateStr = dateStr.toISOString().slice(0, 10);
  } else if (typeof dateStr !== "string") {
    dateStr = String(dateStr || "");
  }
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
        const createdAt = row.created_at;
        if (!createdAt) return false;
        const daysOpen = (now - new Date(createdAt)) / (1000 * 60 * 60 * 24);
        return daysOpen > 10;
      })
      .map(row => ({
        workOrderNo: row.work_order_no,
        status: row.status,
        createdAt: row.created_at,
      }));
console.dir(woRows.slice(0, 2), { depth: 5 }); // Shows first 2 work orders and their nested arrays

// 9. Extract work orders with at least one waiting part
const pendingPartsWOs = woRows
  .filter(wo => Array.isArray(wo.parts) && wo.parts.some(p => p.waiting === true))
  .map(wo => ({
    workOrderNo: wo.work_order_no,
    companyName: wo.company_name,
    status: wo.status,
    shop: wo.shop,
    createdAt: wo.created_at,
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
      pendingPartsWOs,
      allWorkOrders: woRows, // This is what your frontend expects!
    });
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ error: 'Failed to get analytics.' });
  }
});

module.exports = router;
