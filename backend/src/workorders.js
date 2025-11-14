const pool = require('../db');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const axios = require('axios');
const WebSocketBroadcaster = require('./utils/websocket');
const {
  add,
  addLineItem,
  addTimeEntry,
  getAll,
  getPaginated,
  getMaxWorkOrderNo,
  getAssignedForTechnician,
  searchWorkOrders,
  getWorkOrdersBySerialNumber,
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

function calculateDaysByStatus(statusHistory) {
  const daysByStatus = {
    assigned_days: 0,
    in_progress_days: 0,
    in_progress_pending_parts_days: 0,
    completed_pending_approval_days: 0,
    submitted_for_billing_days: 0,
    closed_days: 0,
  };

  if (!Array.isArray(statusHistory) || statusHistory.length === 0) return daysByStatus;

  for (let i = 0; i < statusHistory.length; i++) {
    const curr = statusHistory[i];
    const next = statusHistory[i + 1];
    const currDate = new Date(curr.date);
    const nextDate = next ? new Date(next.date) : new Date();

const diffMs = nextDate - currDate;
const diffHours = diffMs / (1000 * 60 * 60);
const diffDays = diffHours / 24;



    const status = (curr.status || "").toLowerCase();

    if (status.includes("assigned")) daysByStatus.assigned_days += diffDays;
    if (status.includes("in progress, pending parts")) {
      daysByStatus.in_progress_pending_parts_days += diffDays;
    } else if (status.includes("in progress")) {
      daysByStatus.in_progress_days += diffDays;
    }
    if (status.includes("completed, pending approval")) {
      daysByStatus.completed_pending_approval_days += diffDays;
    }
    if (status.includes("submitted for billing")) {
      daysByStatus.submitted_for_billing_days += diffDays;
    }
    if (status.includes("closed")) {
      daysByStatus.closed_days += diffDays;
    }
  }
for (const key in daysByStatus) {
  daysByStatus[key] = Math.max(1, Math.round(daysByStatus[key]));
}
  return daysByStatus;
}



// GET /workorders -> list all work orders
function setupWorkOrderRoutes(app) {
  app.get('/workorders', async (req, res) => {
    try {
      const { limit, offset } = req.query || {};
      // If pagination params are provided, use lightweight list
      if (limit !== undefined || offset !== undefined) {
        const { rows, total } = await getPaginated({ limit, offset });
        if (process.env.NODE_ENV !== 'production') {
          console.log('GET /workorders paginated: returned', rows.length, 'of', total);
        }
        return res.json({ rows: toCamel(rows), total });
      }

      // Fallback to full dataset (legacy)
      const workOrders = await getAll();
      if (process.env.NODE_ENV !== 'production') {
        console.log('GET /workorders: count', Array.isArray(workOrders) ? workOrders.length : 'n/a');
      }
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
    const techOrders = await getAssignedForTechnician(username);
    res.json(toCamel(techOrders));
  } catch (err) {
    console.error('❌ Failed to fetch technician work orders:', err);
    res.status(500).json({ error: 'Failed to fetch technician work orders.' });
  }
});






  // GET /workorders/next-number -> returns the next work order number
  app.get('/workorders/next-number', async (req, res) => {
    try {
      const maxNo = await getMaxWorkOrderNo();
      const nextNo = maxNo > 0 ? maxNo + 1 : await getStartingWorkOrderNo();
      res.json({ nextWorkOrderNo: nextNo });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch next work order number.' });
    }
  });

  // POST /workorders -> Save new work order in Supabase and line items and time entries
  app.post('/workorders', async (req, res) => {
    console.log('POST /workorders hit:', req.body);
    console.log('📦 Incoming status field:', req.body.status);


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

      // Broadcast the new work order via WebSocket (with error handling)
      try {
        WebSocketBroadcaster.broadcastWorkOrderCreated(savedOrder);
      } catch (wsError) {
        console.error('WebSocket broadcasting error:', wsError);
        // Don't fail the API call if WebSocket broadcasting fails
      }

      res.status(201).json(savedOrder);
    } catch (err) {
      console.error('Failed to create work order:', err);
      res.status(500).json({ error: 'Failed to create work order.' });
    }
  });

  // (moved below search routes to avoid route shadowing)



    app.put('/workorders/:workOrderNo', async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('PUT /workorders/:workOrderNo', req.params.workOrderNo, Object.keys(req.body || {}));
    }
    const workOrderNo = req.params.workOrderNo;
    const updates = req.body; // All fields to update
    // Recalculate day counts if statusHistory is present
if (Array.isArray(updates.statusHistory)) {
  const days = calculateDaysByStatus(updates.statusHistory);
  updates.assignedDays = days.assigned_days;
  updates.inProgressDays = days.in_progress_days;
  updates.inProgressPendingPartsDays = days.in_progress_pending_parts_days;
  updates.completedPendingApprovalDays = days.completed_pending_approval_days;
  updates.submittedForBillingDays = days.submitted_for_billing_days;
  updates.closedDays = days.closed_days;
}


        // Cleanup legacy fields
    const CLEANUP_FIELDS = ['fieldContactName', 'PoNumber', 'techSummary'];
    CLEANUP_FIELDS.forEach(f => {
      if (updates.hasOwnProperty(f)) delete updates[f];
    });


    // You'll need to write an updateWorkOrderByNo function in your store!
const updated = await updateWorkOrderByNo(workOrderNo, updates);

if (updates.parts && Array.isArray(updates.parts)) {
  // 1. Get existing line_items to preserve waiting_from dates
  const existingParts = await pool.query(
    'SELECT id, part_number, description, quantity, waiting, waiting_from, ordered_date, estimated_delivery_date FROM line_items WHERE work_order_no = $1',
    [workOrderNo]
  );
  
  // Create a map of existing parts by their key fields for quick lookup
  const existingPartsMap = new Map();
  existingParts.rows.forEach(part => {
    const key = `${part.part_number || ''}_${part.description || ''}_${part.quantity}`;
    existingPartsMap.set(key, part);
  });

  // 2. Delete existing line_items for this workOrderNo
  await pool.query('DELETE FROM line_items WHERE work_order_no = $1', [workOrderNo]);

  // 3. Insert valid parts, preserving original waiting_from dates
  for (const part of updates.parts) {
    const partNumber = (part.partNumber || '').trim();
    const description = (part.description || '').trim();
    const quantity = Number(part.quantity || 0);
    if (!partNumber && !description && quantity === 0) continue;

    // Look up existing part to preserve waiting_from date
    const key = `${partNumber}_${description}_${quantity}`;
    const existingPart = existingPartsMap.get(key);
    
    let waitingFrom = null;
    if (part.waiting) {
      // If part is waiting, preserve existing waiting_from date or set new one
      waitingFrom = existingPart?.waiting_from || new Date();
    }

    await pool.query(
      `INSERT INTO line_items (work_order_no, part_number, description, quantity, waiting, waiting_from, ordered_date, estimated_delivery_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        workOrderNo,
        partNumber,
        description,
        quantity,
        part.waiting || false,
        waitingFrom,
        part.ordered_date || existingPart?.ordered_date || null,
        part.estimatedDeliveryDate || existingPart?.estimated_delivery_date || null
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

// Broadcast the work order update via WebSocket (with error handling)
try {
  if (process.env.NODE_ENV !== 'production') {
    console.log('Broadcasting work order update for:', workOrderNo);
  }
  // Convert snake_case to camelCase for frontend compatibility
  const camelCaseUpdated = toCamel(updated);
  WebSocketBroadcaster.broadcastWorkOrderUpdated(workOrderNo, camelCaseUpdated);
  // Only broadcast parts update if parts were specifically modified (not just any update)
  if (updates.hasOwnProperty('parts') && Array.isArray(updates.parts)) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Broadcasting parts update for work order:', workOrderNo);
    }
    WebSocketBroadcaster.broadcastPartsUpdated(workOrderNo, updates.parts);
  }
} catch (wsError) {
  console.error('WebSocket broadcasting error:', wsError);
  // Don't fail the API call if WebSocket broadcasting fails
}

res.json({ message: 'Work order updated', workOrder: updated });

  } catch (err) {
    console.error('Failed to update work order:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      workOrderNo: req.params.workOrderNo,
      updateKeys: Object.keys(req.body || {})
    });
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

  // PUT /workorders/submit-for-billing/:workOrderNo -> set status to "Submitted for Billing" with email notification
  app.put('/workorders/submit-for-billing/:workOrderNo', async (req, res) => {
    try {
      const workOrderNo = req.params.workOrderNo;
      
      // Get the current work order to check if it's already submitted for billing
      const currentResult = await pool.query(
        'SELECT * FROM workorders WHERE work_order_no = $1',
        [workOrderNo]
      );
      
      if (currentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      const currentWorkOrder = currentResult.rows[0];
      
      // Check if already submitted for billing
      if (currentWorkOrder.status === 'Submitted for Billing') {
        return res.status(400).json({ error: 'Work order is already submitted for billing' });
      }
      
      // Validate that all shipping fields are filled out before submitting for billing
      const shippingCost = currentWorkOrder.shipping_cost;
      const shipFromGllsCost = currentWorkOrder.ship_from_glls_cost;
      const shippingComments = currentWorkOrder.shipping_comments;
      
      if (!shippingCost || shippingCost === '' || shippingCost === null) {
        return res.status(400).json({ error: 'Inbound Shipping is required to submit for billing.' });
      }
      
      if (!shipFromGllsCost || shipFromGllsCost === '' || shipFromGllsCost === null) {
        return res.status(400).json({ error: 'Outbound Shipping is required to submit for billing.' });
      }
      
      if (!shippingComments || shippingComments.trim() === '') {
        return res.status(400).json({ error: 'Shipping Comments are required to submit for billing.' });
      }
      
      // Update status to "Submitted for Billing"
      const now = new Date().toISOString();
      let statusHistory = currentWorkOrder.status_history;
      
      // Parse status_history if it's a string
      if (typeof statusHistory === "string") {
        statusHistory = JSON.parse(statusHistory);
      }
      
      // Add new status to history
      if (!Array.isArray(statusHistory)) {
        statusHistory = [];
      }
      statusHistory.push({ status: 'Submitted for Billing', date: now });
      
      // Calculate days by status
      const daysByStatus = calculateDaysByStatus(statusHistory);
      
      // Update the work order
      const updateResult = await pool.query(
        `UPDATE workorders
         SET status = $1,
             status_history = $2,
             assigned_days = $3,
             in_progress_days = $4,
             in_progress_pending_parts_days = $5,
             completed_pending_approval_days = $6,
             submitted_for_billing_days = $7,
             closed_days = $8
         WHERE work_order_no = $9
         RETURNING *`,
        [
          'Submitted for Billing',
          JSON.stringify(statusHistory),
          daysByStatus.assigned_days,
          daysByStatus.in_progress_days,
          daysByStatus.in_progress_pending_parts_days,
          daysByStatus.completed_pending_approval_days,
          daysByStatus.submitted_for_billing_days,
          daysByStatus.closed_days,
          workOrderNo
        ]
      );
      
      const updatedWorkOrder = updateResult.rows[0];
      
      // Send email notification using the same method as "waiting on part"
      try {
        // Get notification emails from Google Sheets
        const sheetsClient = new google.auth.GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth: sheetsClient });
        
        const emailResp = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Config!D2:D', // D2 and down - notification emails
        });
        
        const emailRows = emailResp.data.values || [];
        const notificationEmails = emailRows.map(r => r[0]).filter(email => email && email.includes('@'));
        
        if (notificationEmails.length > 0) {
          // Use the same email sending method as "waiting on part"
          const subject = `Work Order ${workOrderNo}: Submitted for Billing`;
          const text = `Work Order #${workOrderNo} has been submitted for billing.

Company: ${currentWorkOrder.company_name || 'N/A'}
Date: ${currentWorkOrder.date || 'N/A'}
Status: Submitted for Billing

This work order is now ready for billing processing.`;
          // Replace lines 488-496 with:
          // Send email directly using nodemailer (same as notify endpoint)
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: notificationEmails.join(','),
            subject,
            text
          });

          console.log('Billing notification email sent directly');
          console.log('Billing notification email sent via notify endpoint');
        }
      } catch (emailError) {
        console.error('Failed to send billing notification email:', emailError);
        // Don't fail the request if email fails
      }
      
      res.json({ 
        message: 'Work order submitted for billing and notification sent.', 
        workOrder: updatedWorkOrder 
      });
      
    } catch (err) {
      console.error('Failed to submit work order for billing:', err);
      res.status(500).json({ error: 'Failed to submit work order for billing.' });
    }
  });

  // PUT /workorders/submit-for-billing/:id -> set status to "Submitted for Billing" (legacy endpoint)
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
    const previousStatus = workOrder.status;
    let statusHistory = workOrder.status_history;

    // Parse status_history (if needed)
    if (typeof statusHistory === "string") statusHistory = JSON.parse(statusHistory);

    // Calculate days spent in each status
        const daysByStatus = calculateDaysByStatus(statusHistory);


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

    const updatedWorkOrder = updateResult.rows[0];

    // Send email notification if transitioning from "Customer Invoiced" to "Closed"
    if (previousStatus && previousStatus.toLowerCase() === 'customer invoiced') {
      try {
        // Get notification emails from Google Sheets
        const sheetsClient = new google.auth.GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth: sheetsClient });
        
        const emailResp = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Config!D2:D', // D2 and down - notification emails
        });
        
        const emailRows = emailResp.data.values || [];
        const notificationEmails = emailRows.map(r => r[0]).filter(email => email && email.includes('@'));
        
        if (notificationEmails.length > 0) {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          const subject = `Work Order ${workOrder.work_order_no}: Closed`;
          const text = `Work Order #${workOrder.work_order_no} has been closed.

Company: ${workOrder.company_name || 'N/A'}
Date: ${workOrder.date || 'N/A'}
Previous Status: Customer Invoiced
Current Status: Closed

This work order has been marked as paid and closed.`;

          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: notificationEmails.join(','),
            subject,
            text
          });

          console.log('Work order closed notification email sent');
        }
      } catch (emailError) {
        console.error('Failed to send work order closed notification email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.json({ message: "Work order closed!", workOrder: updatedWorkOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to close work order." });
  }
  });

  // === ENDPOINT: Delete Work Order (with password protection)
  app.delete('/workorders/:workOrderNo', async (req, res) => {
    try {
      const { workOrderNo } = req.params;
      const { password } = req.body;

      // Password validation - you can change this to any password you want
      const DELETE_PASSWORD = process.env.DELETE_WORK_ORDER_PASSWORD || 'delete123';
      
      if (!password || password !== DELETE_PASSWORD) {
        return res.status(401).json({ error: 'Incorrect password. Work order deletion requires authorization.' });
      }

      // First, get the work order to verify it exists
      const workOrderResult = await pool.query('SELECT work_order_no FROM workorders WHERE work_order_no = $1', [workOrderNo]);
      if (workOrderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Work order not found' });
      }

      // Start a transaction to ensure all related data is deleted
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Delete troubleshooting records first (due to foreign key constraint)
        await client.query('DELETE FROM troubleshoot WHERE work_order_no = $1', [workOrderNo]);

        // Delete time entries
        await client.query('DELETE FROM time_entries WHERE work_order_no = $1', [workOrderNo]);

        // Delete line items
        await client.query('DELETE FROM line_items WHERE work_order_no = $1', [workOrderNo]);

        // Delete photos (if they exist in a photos table)
        // Uncomment if you have a photos table: await client.query('DELETE FROM photos WHERE work_order_no = $1', [workOrderNo]);

        // Finally, delete the work order itself
        const deleteResult = await client.query('DELETE FROM workorders WHERE work_order_no = $1 RETURNING work_order_no', [workOrderNo]);

        await client.query('COMMIT');

        res.json({ 
          message: `Work order ${workOrderNo} and all related data have been permanently deleted.`,
          deletedWorkOrderNo: workOrderNo
        });

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (err) {
      console.error('Error deleting work order:', err);
      res.status(500).json({ error: 'Failed to delete work order. Please try again.' });
    }
  });

  // === ENDPOINT: Update Part Status (Ordered/Arrived)
  app.put('/workorders/:workOrderNo/parts/:partId/status', async (req, res) => {
    try {
      const { workOrderNo, partId } = req.params;
      const { action, estimatedDeliveryDate } = req.body; // 'ordered' or 'arrived', optional estimatedDeliveryDate
      
      console.log('DEBUG: Update part status request:', { workOrderNo, partId, action, estimatedDeliveryDate });
      
      if (!action || !['ordered', 'arrived'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be "ordered" or "arrived".' });
      }

      // Get the current work order
      const workOrderResult = await pool.query(
        'SELECT * FROM workorders WHERE work_order_no = $1',
        [workOrderNo]
      );
      
      if (workOrderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      const workOrder = workOrderResult.rows[0];
      
      // Get the part
      const partResult = await pool.query(
        'SELECT * FROM line_items WHERE id = $1 AND work_order_no = $2',
        [partId, workOrderNo]
      );
      
      if (partResult.rows.length === 0) {
        return res.status(404).json({ error: 'Part not found' });
      }
      
      const part = partResult.rows[0];
      
      if (action === 'ordered') {
        // Mark part as ordered and update work order status
        await pool.query(
          'UPDATE line_items SET ordered_date = $1, estimated_delivery_date = $2 WHERE id = $3',
          [new Date(), estimatedDeliveryDate || null, partId]
        );
        
        // Update work order status to "In Progress, Pending Parts (Ordered)"
        const now = new Date().toISOString();
        let statusHistory = workOrder.status_history;
        
        if (typeof statusHistory === "string") {
          statusHistory = JSON.parse(statusHistory);
        }
        
        if (!Array.isArray(statusHistory)) {
          statusHistory = [];
        }
        
        statusHistory.push({ 
          status: 'In Progress, Pending Parts (Ordered)', 
          date: now,
          updatedBy: req.user?.username || req.user?.name || 'System'
        });
        
        // Update work order status (no need to update parts array since it's stored in line_items table)
        await pool.query(
          'UPDATE workorders SET status = $1, status_history = $2 WHERE work_order_no = $3',
          ['In Progress, Pending Parts (Ordered)', JSON.stringify(statusHistory), workOrderNo]
        );
        
        // Broadcast the part status update via WebSocket (with error handling)
        try {
          WebSocketBroadcaster.broadcastPartStatusUpdated(workOrderNo, partId, action, estimatedDeliveryDate);
        } catch (wsError) {
          console.error('WebSocket broadcasting error:', wsError);
          // Don't fail the API call if WebSocket broadcasting fails
        }

        res.json({ 
          message: 'Part marked as ordered and work order status updated.',
          newStatus: 'In Progress, Pending Parts (Ordered)'
        });
        
      } else if (action === 'arrived') {
        // Mark part as arrived and update work order status back to "In Progress"
        await pool.query(
          'UPDATE line_items SET waiting_to = $1, waiting = FALSE WHERE id = $2',
          [new Date(), partId]
        );
        
        // Update work order status back to "In Progress"
        const now = new Date().toISOString();
        let statusHistory = workOrder.status_history;
        
        if (typeof statusHistory === "string") {
          statusHistory = JSON.parse(statusHistory);
        }
        
        if (!Array.isArray(statusHistory)) {
          statusHistory = [];
        }
        
        statusHistory.push({ 
          status: 'In Progress', 
          date: now,
          updatedBy: req.user?.username || req.user?.name || 'System'
        });
        
        await pool.query(
          'UPDATE workorders SET status = $1, status_history = $2 WHERE work_order_no = $3',
          ['In Progress', JSON.stringify(statusHistory), workOrderNo]
        );
        
        // Broadcast the part status update via WebSocket (with error handling)
        try {
          WebSocketBroadcaster.broadcastPartStatusUpdated(workOrderNo, partId, action, null);
        } catch (wsError) {
          console.error('WebSocket broadcasting error:', wsError);
          // Don't fail the API call if WebSocket broadcasting fails
        }

        res.json({ 
          message: 'Part marked as arrived and work order status updated.',
          newStatus: 'In Progress'
        });
      }
      
    } catch (err) {
      console.error('Failed to update part status:', err);
      res.status(500).json({ error: 'Failed to update part status.' });
    }
  });

  // === ENDPOINT: Search Work Orders
  app.get('/workorders/search', async (req, res) => {
    try {
      const { q: searchTerm, limit, offset } = req.query;
      
      if (!searchTerm || searchTerm.trim().length < 2) {
        return res.status(400).json({ error: 'Search term must be at least 2 characters' });
      }
      
      const { rows, total } = await searchWorkOrders(searchTerm.trim(), { limit, offset });
      res.json({ rows: toCamel(rows), total });
    } catch (err) {
      console.error('Failed to search work orders:', err);
      res.status(500).json({ error: 'Failed to search work orders.' });
    }
  });

  // === ENDPOINT: Get Work Orders by Serial Number
  app.get('/workorders/by-serial/:serialNumber', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const { limit, offset } = req.query;
      
      const { rows, total } = await getWorkOrdersBySerialNumber(serialNumber, { limit, offset });
      res.json({ rows: toCamel(rows), total });
    } catch (err) {
      console.error('Failed to fetch work orders by serial number:', err);
      res.status(500).json({ error: 'Failed to fetch work orders by serial number.' });
    }
  });

  // GET /workorders/:workOrderNo -> get a single work order by work order number
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
