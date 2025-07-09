const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const WORKORDERS_JSON = path.join(__dirname, 'workorders.json');

// Helper: get Google Sheets API client
function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: sheetsClient });
}

const sheetsClient = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth: sheetsClient });
const SPREADSHEET_ID = process.env.SHEET_ID;

// Helper: read all local work orders
function readLocalWorkOrders() {
  if (!fs.existsSync(WORKORDERS_JSON)) return [];
  const text = fs.readFileSync(WORKORDERS_JSON, 'utf-8');
  return JSON.parse(text || '[]');
}

// Helper: write all local work orders
function writeLocalWorkOrders(data) {
  fs.writeFileSync(WORKORDERS_JSON, JSON.stringify(data, null, 2));
}

// Helper: get starting work order number from Google Sheet Config tab
async function getStartingWorkOrderNo() {
  try {
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

// === Days Per Status Calculation ===
const ALL_STATUSES = [
  'Assigned',
  'In Progress',
  'In Progress, Pending Parts',
  'Completed, Pending Approval',
  'Submitted for Billing',
  'Closed'
];

function calculateDaysInStatuses(statusHistory) {
  if (!statusHistory || statusHistory.length === 0) return {};
  // Sort by date ascending
  const sorted = [...statusHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  const now = new Date();
  const daysByStatus = {};

  // For each status, store a Set of date strings (YYYY-MM-DD)
  const statusDaysSet = {};

  for (let i = 0; i < sorted.length; i++) {
    const { status, date } = sorted[i];
    const start = new Date(date);
    const end = (i + 1 < sorted.length)
      ? new Date(sorted[i + 1].date)
      : now;

    // Get all *full* days in between (does not count partial days)
    let current = new Date(start);
    current.setHours(0,0,0,0); // start of the day
    const endDay = new Date(end);
    endDay.setHours(0,0,0,0);

    while (current < endDay) {
      const ymd = current.toISOString().slice(0,10);
      if (!statusDaysSet[status]) statusDaysSet[status] = new Set();
      statusDaysSet[status].add(ymd);
      // Move to next day
      current.setDate(current.getDate() + 1);
    }
  }

  // Convert Set sizes to day counts for each status
  for (const st of ALL_STATUSES) {
    daysByStatus[st] = statusDaysSet[st] ? statusDaysSet[st].size : 0;
  }
  return daysByStatus;
}


// Append one row to "Master WorkOrders" tab
async function appendToMasterSheet(wo) {
  const sheets = getSheetsClient();

  // Calculate days in each status
  const daysInStatuses = calculateDaysInStatuses(wo.statusHistory || []);
  
  const row = [
    wo.workOrderNo,
    wo.date,
    wo.companyName,
    wo.companyStreet,
    wo.companyCity,
    wo.companyState,
    wo.companyZip,
    wo.fieldContact,
    wo.fieldContactNumber,
    wo.fieldStreet,
    wo.fieldCity,
    wo.fieldState,
    wo.fieldZipcode,
    wo.make,
    wo.model,
    wo.otherDesc || "",
    wo.serialNumber,
    wo.contactName,
    wo.contactPhone,
    wo.contactEmail,
    wo.warranty ? 'Yes' : 'No',
    wo.billable ? 'Yes' : 'No',
    wo.maintenance ? 'Yes' : 'No',
    wo.shop,
    wo.repairType,
    wo.salesName,
    wo.shippingCost,
    wo.workDescription,
    wo.notes,
    wo.status || '',
    wo.createdAt || '',
    JSON.stringify(wo.statusHistory || []),
    daysInStatuses['Assigned'] || 0,
    daysInStatuses['In Progress'] || 0,
    daysInStatuses['In Progress, Pending Parts'] || 0,
    daysInStatuses['Completed, Pending Approval'] || 0,
    daysInStatuses['Submitted for Billing'] || 0,
    daysInStatuses['Closed'] || 0,
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Master WorkOrders!A1:AL1', // Update to match your new column count
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
}

// Append parts to "LineItems" tab
async function appendPartsToLineItemsSheet(workOrderNo, parts) {
  const sheets = getSheetsClient();
  const rows = parts.map(part => [
    workOrderNo,
    part.partNumber,
    part.description,
    part.quantity,
    part.waiting ? 'Yes' : 'No'
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'LineItems!A1:G1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });
}

// Append time logs to "TimeLogs" tab
async function appendTimeLogsToSheet(workOrderNo, timeLogs) {
  const sheets = getSheetsClient();
  const rows = timeLogs.map(log => [
    workOrderNo,
    log.technicianAssigned,
    log.assignDate,
    log.startTime,
    log.finishTime,
    log.travelTime,
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'TimeLogs!A1:F1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });
}

function setupWorkOrderRoutes(app) {
  // GET /workorders -> list all work orders
  app.get('/workorders', (req, res) => {
    const workOrders = readLocalWorkOrders();
    res.json(workOrders);
  });

  // GET /workorders/assigned/:username -> list work orders for a technician
  app.get('/workorders/assigned/:username', (req, res) => {
    const { username } = req.params;
    const workOrders = readLocalWorkOrders();
    // Return only work orders assigned to this tech that are not closed
    const techOrders = workOrders.filter(
      wo => wo.timeLogs.some(log => log.technicianAssigned === username)
        && wo.status !== 'Closed'
    );
    res.json(techOrders);
  });

  // GET /workorders/next-number -> returns the next work order number
  app.get('/workorders/next-number', async (req, res) => {
    const workOrders = readLocalWorkOrders();
    let nextNo;
    if (workOrders.length > 0) {
      nextNo = workOrders[workOrders.length - 1].id + 1;
    } else {
      nextNo = await getStartingWorkOrderNo();
    }
    res.json({ nextWorkOrderNo: nextNo });
  });

  // POST /workorders -> Save new work order *locally* (not to Google Sheets yet)
  app.post('/workorders', async (req, res) => {
    const newOrder = req.body;
    const workOrders = readLocalWorkOrders();
    let nextId;
    if (workOrders.length > 0) {
      nextId = workOrders[workOrders.length - 1].id + 1;
    } else {
      nextId = await getStartingWorkOrderNo();
    }
    newOrder.id = nextId;
    newOrder.workOrderNo = String(nextId);
    newOrder.status = 'Assigned';
    newOrder.createdAt = new Date().toISOString();
    newOrder.statusHistory = [{ status: 'Assigned', date: newOrder.createdAt }];
    workOrders.push(newOrder);
    writeLocalWorkOrders(workOrders);
    res.status(201).json({ message: 'Work order saved locally', workOrder: newOrder });
  });

  // GET /workorders/:id -> get a single work order by ID
  app.get('/workorders/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const workOrders = readLocalWorkOrders();
    const found = workOrders.find(wo => wo.id === id);
    if (!found) return res.status(404).json({ error: 'Work order not found' });
    res.json(found);
  });

  // PUT /workorders/:id -> update a work order by ID
  app.put('/workorders/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const workOrders = readLocalWorkOrders();
    const idx = workOrders.findIndex(wo => wo.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Work order not found' });
    workOrders[idx] = { ...workOrders[idx], ...req.body };
    writeLocalWorkOrders(workOrders);
    res.json({ message: 'Work order updated', workOrder: workOrders[idx] });
  });

  // PUT /workorders/by-id/:id -> update a work order by ID
  app.put('/workorders/by-id/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const workOrders = readLocalWorkOrders();
    const idx = workOrders.findIndex(wo => wo.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Work order not found' });

    workOrders[idx] = { ...workOrders[idx], ...req.body };
    writeLocalWorkOrders(workOrders);
    res.json({ message: 'Work order updated', workOrder: workOrders[idx] });
  });

  // === NEW: Manager submits for billing, status only ===
  app.put('/workorders/submit-for-billing/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const workOrders = readLocalWorkOrders();
    const idx = workOrders.findIndex(wo => wo.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Work order not found' });

    workOrders[idx].status = 'Submitted for Billing';
    workOrders[idx].statusHistory = [
      ...(workOrders[idx].statusHistory || []),
      { status: 'Submitted for Billing', date: new Date().toISOString() }
    ];
    writeLocalWorkOrders(workOrders);
    res.json({ message: 'Work order submitted for billing.' });
});

  // === NEW: Anyone (manager or accounting) closes, writes to Google Sheets ===
app.put('/workorders/close/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const workOrders = readLocalWorkOrders();
  const idx = workOrders.findIndex(wo => wo.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Work order not found' });

  // ...parts blank logic here...

  // Already exported? Just update status, don't re-export.
  if (workOrders[idx].exportedToSheets) {
    // If status is not already "Closed", update it and add to history.
    if (workOrders[idx].status !== 'Closed') {
      workOrders[idx].status = 'Closed';
      workOrders[idx].statusHistory = [
        ...(workOrders[idx].statusHistory || []),
        { status: 'Closed', date: new Date().toISOString() }
      ];
      
      writeLocalWorkOrders(workOrders);
    }
    return res.json({ message: 'Work order already exported to Google Sheets. Status updated to Closed.' });
  }

  // Update status before export
  workOrders[idx].status = 'Closed';
  workOrders[idx].statusHistory = [
    ...(workOrders[idx].statusHistory || []),
    { status: 'Closed', date: new Date().toISOString() }
  ];
  // Calculate closedDays: days from createdAt to now (when closing)
const msInDay = 24 * 60 * 60 * 1000;
const closedDate = new Date(); // the time right now
const createdAt = workOrders[idx].createdAt ? new Date(workOrders[idx].createdAt) : null;

if (createdAt) {
  const closedDays = (closedDate - createdAt) / msInDay;
  workOrders[idx].closedDays = Number(closedDays.toFixed(2));
}
  // SET FLAG **before** or **immediately after** Sheets export
  try {
    await appendToMasterSheet(workOrders[idx]);
    if (workOrders[idx].parts && workOrders[idx].parts.length > 0) {
      await appendPartsToLineItemsSheet(workOrders[idx].workOrderNo, workOrders[idx].parts);
    }
    if (workOrders[idx].timeLogs && workOrders[idx].timeLogs.length > 0) {
      await appendTimeLogsToSheet(workOrders[idx].workOrderNo, workOrders[idx].timeLogs);
    }
    workOrders[idx].exportedToSheets = true; // <-- SET FLAG
    writeLocalWorkOrders(workOrders);        // <-- SAVE FLAG
    res.json({ message: 'Work order closed and written to Google Sheets.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to write to Google Sheets.' });
  }
});

  // === NEW ENDPOINT: Makes & Models ===
  app.get('/api/masters/makes-models', async (req, res) => {
    try {
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
