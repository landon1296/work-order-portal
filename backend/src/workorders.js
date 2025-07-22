const pool = require('../db');
const { google } = require('googleapis');
const {
  add,
  addLineItem,
  addTimeEntry,
  getAll,
  getById,
  updateStatus,
  updateWorkOrderByNo
} = require('./workordersStore'); // path is correct

// Helper to recursively convert snake_case to camelCase
function toCamel(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => toCamel(v));
  } else if (obj && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
      let val = obj[key];
      // --- PATCH: If this is a JS Date object, convert it to YYYY-MM-DD string
      if (val instanceof Date) {
        val = val.toISOString().slice(0, 10);
      }
      result[camelKey] = toCamel(val);
      return result;
    }, {});
  }
  return obj;
}



const SPREADSHEET_ID = process.env.SHEET_ID;

// Helper: get starting work order number from Google Sheet Config tab
async function getStartingWorkOrderNo() {
  // You can keep this logic if you want to read from Google Sheets config
  // Or switch to DB logic if you want
  try {
    const sheetsClient = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth: sheetsClient });
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Config!A1:B'
    });
    const rows = resp.data.values || [];
    const row = rows.find(r => r[0] === 'StartingWorkOrderNo');
    if (row) return parseInt(row[1]);
  } catch (e) {}
  return 1;
}

// GET /workorders -> list all work orders
function setupWorkOrderRoutes(app) {
  app.get('/workorders', async (req, res) => {
    try {
      const workOrders = await getAll();
      console.log('GET /workorders:', workOrders);
      function toCamel(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => toCamel(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
      result[camelKey] = toCamel(obj[key]);
      return result;
    }, {});
  }
  return obj;
}

// ...in your GET route:
res.json(toCamel(workOrders));

      
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch work orders.' });
    }
  });

  // GET /workorders/assigned/:username -> list work orders for a technician (basic version)
app.get('/workorders/assigned/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const workOrders = await getAll();
    const techOrders = workOrders.filter(
      wo => (wo.timeLogs || []).some(log => log.technician_assigned === username)
        && wo.status !== 'Closed'
    );
    res.json(toCamel(techOrders));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch technician work orders.' });
  }
});





  // GET /workorders/next-number -> returns the next work order number
  app.get('/workorders/next-number', async (req, res) => {
    // This can be as simple as: get max work_order_no from DB + 1
    try {
      const workOrders = await getAll();
      let nextNo = 1;
      if (workOrders.length > 0) {
        const maxNo = Math.max(
          ...workOrders.map(wo => parseInt(wo.work_order_no || 0, 10)).filter(Boolean)
        );
        nextNo = maxNo + 1;
      } else {
        nextNo = await getStartingWorkOrderNo();
      }
      res.json({ nextWorkOrderNo: nextNo });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch next work order number.' });
    }
  });

  // POST /workorders -> Save new work order in Supabase and line items and time entries
  app.post('/workorders', async (req, res) => {
    console.log('POST /workorders hit:', req.body);

    try {
      const order = req.body;
          // Cleanup legacy fields
    const CLEANUP_FIELDS = ['fieldContactName', 'PoNumber', 'techSummary'];
    CLEANUP_FIELDS.forEach(f => {
      if (order.hasOwnProperty(f)) delete order[f];
    });


      // 1. Add the main work order
      const savedOrder = await add(order);

      // 2. Add all parts (line items)
for (const part of order.parts) {
  const partNumber = (part.partNumber || '').trim();
  const description = (part.description || '').trim();
  const quantity = Number(part.quantity || 0);
  if (!partNumber && !description && quantity === 0) continue;

  await addLineItem({
    workOrderNo: order.workOrderNo,
    partNumber,
    description,
    quantity,
    waiting: part.waiting
  });
}


      // 3. Add all time entries
      if (order.timeLogs && Array.isArray(order.timeLogs)) {
        for (const log of order.timeLogs) {
          await addTimeEntry({
            workOrderNo: order.workOrderNo,
            technicianAssigned: log.technicianAssigned,
            assignDate: log.assignDate,
            startTime: log.startTime,
            finishTime: log.finishTime,
            travelTime: log.travelTime
          });
        }
      }

      res.status(201).json(savedOrder);
    } catch (err) {
      console.error('Failed to create work order:', err);
      res.status(500).json({ error: 'Failed to create work order.' });
    }
  });

  // GET /workorders/:id -> get a single work order by ID
app.get('/workorders/:workOrderNo', async (req, res) => {
  try {
    const workOrderNo = req.params.workOrderNo;
    // 1. Fetch main workorder
    const result = await pool.query(
      'SELECT * FROM workorders WHERE work_order_no = $1',
      [workOrderNo]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Work order not found' });
    let wo = result.rows[0];

    // 2. Fetch parts (line_items)
    const partsResult = await pool.query(
      'SELECT * FROM line_items WHERE work_order_no = $1',
      [workOrderNo]
    );
    wo.parts = partsResult.rows;

    // 3. Fetch timeLogs (time_entries)
    const timeLogsResult = await pool.query(
      'SELECT * FROM time_entries WHERE work_order_no = $1',
      [workOrderNo]
    );
    wo.timeLogs = timeLogsResult.rows;

    // 4. Convert to camelCase for frontend
const toCamel = obj => {
  if (Array.isArray(obj)) {
    return obj.map(toCamel);
  } else if (obj && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
      let val = obj[key];
      if (val instanceof Date) {
        val = val.toISOString().slice(0, 10);
      }
      result[camelKey] = toCamel(val);
      return result;
    }, {});
  }
  return obj;
};

    // Apply toCamel on arrays too:
    wo = toCamel(wo);
    wo.parts = wo.parts.map(toCamel);
    wo.timeLogs = wo.timeLogs.map(toCamel);

    res.json(wo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch work order.' });
  }
});



    app.put('/workorders/:workOrderNo', async (req, res) => {
  try {
    console.log('PUT /workorders/:workOrderNo', req.params.workOrderNo, req.body);
    const workOrderNo = req.params.workOrderNo;
    const updates = req.body; // All fields to update

        // Cleanup legacy fields
    const CLEANUP_FIELDS = ['fieldContactName', 'PoNumber', 'techSummary'];
    CLEANUP_FIELDS.forEach(f => {
      if (updates.hasOwnProperty(f)) delete updates[f];
    });


    // You'll need to write an updateWorkOrderByNo function in your store!
const updated = await updateWorkOrderByNo(workOrderNo, updates);

if (updates.parts && Array.isArray(updates.parts)) {
  // 1. Delete existing line_items for this workOrderNo
  await pool.query('DELETE FROM line_items WHERE work_order_no = $1', [workOrderNo]);

  // 2. Insert valid parts
  for (const part of updates.parts) {
    const partNumber = (part.partNumber || '').trim();
    const description = (part.description || '').trim();
    const quantity = Number(part.quantity || 0);
    if (!partNumber && !description && quantity === 0) continue;

    await pool.query(
      `INSERT INTO line_items (work_order_no, part_number, description, quantity, waiting)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        workOrderNo,
        partNumber,
        description,
        quantity,
        part.waiting || false
      ]
    );
  }
}
if (updates.timeLogs && Array.isArray(updates.timeLogs)) {
  // Delete existing time entries for this workOrderNo
  await pool.query('DELETE FROM time_entries WHERE work_order_no = $1', [workOrderNo]);

  // Insert updated time logs
  for (const log of updates.timeLogs) {
    await pool.query(
      `INSERT INTO time_entries (work_order_no, technician_assigned, assign_date, start_time, finish_time, travel_time)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        workOrderNo,
        log.technicianAssigned,
        log.assignDate,
        log.startTime,
        log.finishTime,
        log.travelTime
      ]
    );
  }
}


if (!updated) return res.status(404).json({ error: 'Work order not found' });
res.json({ message: 'Work order updated', workOrder: updated });

  } catch (err) {
    console.error('Failed to update work order:', err);
    res.status(500).json({ error: err.message || 'Failed to update work order.' });
  }

});

  // PUT /workorders/:id -> update a work order by ID (you should write update logic in workordersStore.js)
  //app.put('/workorders/:id', async (req, res) => {
    // Not implemented in workordersStore.js above, but you can add it!
    //res.status(501).json({ error: 'Not implemented yet.' });
  //});

  // PUT /workorders/by-id/:id -> update a work order by ID (same as above)
  //app.put('/workorders/by-id/:id', async (req, res) => {
    //res.status(501).json({ error: 'Not implemented yet.' });
  //});

  // PUT /workorders/submit-for-billing/:id -> set status to "Submitted for Billing"
  app.put('/workorders/submit-for-billing/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await updateStatus(id, 'Submitted for Billing');
      if (!updated) return res.status(404).json({ error: 'Work order not found' });
      res.json({ message: 'Work order submitted for billing.', workOrder: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit work order for billing.' });
    }
  });

  // PUT /workorders/close/:id -> closes work order and writes to Google Sheets (if you want)
  // You can move your Google Sheets logic here if you want to keep that integration!
  app.put('/workorders/close/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Fetch work order to get status_history
    const result = await pool.query('SELECT * FROM workorders WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    const workOrder = result.rows[0];
    let statusHistory = workOrder.status_history;

    // Parse status_history (if needed)
    if (typeof statusHistory === "string") statusHistory = JSON.parse(statusHistory);

    // Calculate days spent in each status
    const daysByStatus = {
      assigned_days: 0,
      in_progress_days: 0,
      in_progress_pending_parts_days: 0,
      completed_pending_approval_days: 0,
      submitted_for_billing_days: 0,
      closed_days: 0,
    };

    if (Array.isArray(statusHistory) && statusHistory.length > 0) {
      for (let i = 0; i < statusHistory.length; i++) {
        const curr = statusHistory[i];
        const next = statusHistory[i + 1];
        const currDate = new Date(curr.date);
        const nextDate = next ? new Date(next.date) : new Date();

        const diffDays = Math.max(1, Math.round((nextDate - currDate) / (1000 * 60 * 60 * 24)));

        // Map the status string to your DB columns (adjust as needed)
        if (curr.status.toLowerCase().includes("assigned")) daysByStatus.assigned_days += diffDays;
        if (curr.status.toLowerCase().includes("in progress, pending parts")) daysByStatus.in_progress_pending_parts_days += diffDays;
        else if (curr.status.toLowerCase().includes("in progress")) daysByStatus.in_progress_days += diffDays;
        if (curr.status.toLowerCase().includes("completed, pending approval")) daysByStatus.completed_pending_approval_days += diffDays;
        if (curr.status.toLowerCase().includes("submitted for billing")) daysByStatus.submitted_for_billing_days += diffDays;
        if (curr.status.toLowerCase().includes("closed")) daysByStatus.closed_days += diffDays;
      }
    }
        // --- PATCH: Ensure statusHistory always ends with a "Closed" status ---
    const now = new Date().toISOString();
    if (
      Array.isArray(statusHistory) &&
      (
        statusHistory.length === 0 ||
        (statusHistory[statusHistory.length - 1].status || '').toLowerCase() !== 'closed'
      )
    ) {
      statusHistory.push({ status: 'Closed', date: now });
    }


    // Now update the work order status to "Closed" and set day counts
const updateResult = await pool.query(
  `UPDATE workorders
   SET status = $1,
       status_history = $2,   -- <-- Add this line!
       assigned_days = $3,
       in_progress_days = $4,
       in_progress_pending_parts_days = $5,
       completed_pending_approval_days = $6,
       submitted_for_billing_days = $7,
       closed_days = $8
   WHERE id = $9
   RETURNING *`,
  [
    "Closed",
    JSON.stringify(statusHistory),  // <-- Pass your updated statusHistory here!
    daysByStatus.assigned_days,
    daysByStatus.in_progress_days,
    daysByStatus.in_progress_pending_parts_days,
    daysByStatus.completed_pending_approval_days,
    daysByStatus.submitted_for_billing_days,
    daysByStatus.closed_days,
    id
  ]
);

    res.json({ message: "Work order closed!", workOrder: updateResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to close work order." });
  }
});




  // === ENDPOINT: Makes & Models (still Google Sheets)
  app.get('/api/masters/makes-models', async (req, res) => {
    try {
      const sheetsClient = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      const sheets = google.sheets({ version: 'v4', auth: sheetsClient });
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Masters!E2:F', // E=Make, F=Model, skip header row
      });
      const rows = resp.data.values || [];
      res.json(rows); // Each row: [make, model]
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch makes and models.' });
    }
  });
}

module.exports = { setupWorkOrderRoutes };
