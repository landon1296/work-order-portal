const pool = require('../db');

// Get all work orders
// Get all work orders, with timeLogs and parts attached
async function getAll() {
  const result = await pool.query('SELECT * FROM workorders ORDER BY id DESC');
  const workOrders = result.rows;

  for (const wo of workOrders) {
    // Fetch time logs for this work order
    const { rows: timeLogs } = await pool.query(
      'SELECT * FROM time_entries WHERE work_order_no = $1',
      [wo.work_order_no]
    );
    wo.timeLogs = timeLogs;

    // Fetch parts (line items) for this work order
    const { rows: parts } = await pool.query(
      'SELECT * FROM line_items WHERE work_order_no = $1',
      [wo.work_order_no]
    );
    wo.parts = parts;
  }
  return workOrders;
}


// Add a new work order
async function add(order) {
  const result = await pool.query(
    `INSERT INTO workorders
      (
        work_order_no, date, company_name, company_street, company_city,
        company_state, company_zip, field_contact_name, field_contact_number,
        field_street, field_city, field_state, field_zipcode,
        make, model, other_desc, serial_number, contact_name, contact_phone,
        contact_email, warranty, billable, maintenance, non_billable_repair, shop, repair_type,
        sales_name, shipping_cost, work_description, po_number, notes, status,
        status_history, assigned_days, in_progress_days,
        in_progress_pending_parts_days, completed_pending_approval_days,
        submitted_for_billing_days, closed_days
      )
     VALUES
      (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39
      )
     RETURNING *`,
    [
      order.workOrderNo,
      order.date,
      order.companyName,
      order.companyStreet,
      order.companyCity,
      order.companyState,
      order.companyZip,
      order.fieldContact,
      order.fieldContactNumber,
      order.fieldStreet,
      order.fieldCity,
      order.fieldState,
      order.fieldZipcode,
      order.make,
      order.model,
      order.otherDesc,
      order.serialNumber,
      order.contactName,
      order.contactPhone,
      order.contactEmail,
      order.warranty,
      order.billable,
      order.maintenance,
      order.nonBillableRepair,
      order.shop,
      order.repairType,
      order.salesName,
      order.shippingCost,
      order.workDescription,
      order.poNumber,
      order.notes, // or order.notes, if that's what you use
      order.status,
      order.statusHistory, // this can be an array or JSON
      order.assignedDays,
      order.inProgressDays,
      order.inProgressPendingPartsDays,
      order.completedPendingApprovalDays,
      order.submittedForBillingDays,
      order.closedDays
    ]
  );
  return result.rows[0];
}

// Add a line item for a work order
async function addLineItem(lineItem) {
  const partNumber = (lineItem.partNumber || '').trim();
  const description = (lineItem.description || '').trim();
  const quantity = Number(lineItem.quantity || 0);

  if (!partNumber && !description && quantity === 0) return; // Skip if empty

  const result = await pool.query(
    `INSERT INTO line_items
      (work_order_no, part_number, description, quantity, waiting)
     VALUES
      ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      lineItem.workOrderNo,
      partNumber,
      description,
      quantity,
      lineItem.waiting
    ]
  );

  return result.rows[0];
}



// Add a time entry for a work order
async function addTimeEntry(entry) {
  const result = await pool.query(
    `INSERT INTO time_entries
      (work_order_no, technician_assigned, assign_date, start_time, finish_time, travel_time)
     VALUES
      ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      entry.workOrderNo,
      entry.technicianAssigned,
      entry.assignDate,
      entry.startTime,
      entry.finishTime,
      entry.travelTime
    ]
  );
  return result.rows[0];
}

// (To be updated) Update a work order's status
async function updateStatus(id, status) {
  const result = await pool.query(
    `UPDATE workorders SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return result.rows[0];
}

async function updateWorkOrderByNo(workOrderNo, updates) {
  // List all fields you want to allow updating here!
// Map camelCase keys to snake_case
const camelToSnake = {
  companyName: 'company_name',
  companyStreet: 'company_street',
  companyCity: 'company_city',
  companyState: 'company_state',
  companyZip: 'company_zip',
  fieldContact: 'field_contact_name',
  fieldContactNumber: 'field_contact_number',
  fieldStreet: 'field_street',
  fieldCity: 'field_city',
  fieldState: 'field_state',
  fieldZipcode: 'field_zipcode',
  make: 'make',
  model: 'model',
  otherDesc: 'other_desc',
  serialNumber: 'serial_number',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
  contactEmail: 'contact_email',
  warranty: 'warranty',
  billable: 'billable',
  maintenance: 'maintenance',
  nonBillableRepair: 'non_billable_repair',
  shop: 'shop',
  repairType: 'repair_type',
  salesName: 'sales_name',
  shippingCost: 'shipping_cost',
  workDescription: 'work_description',
  poNumber: 'po_number',
  notes: 'notes',
  status: 'status',
  statusHistory: 'status_history',
  assignedDays: 'assigned_days',
  inProgressDays: 'in_progress_days',
  inProgressPendingPartsDays: 'in_progress_pending_parts_days',
  completedPendingApprovalDays: 'completed_pending_approval_days',
  submittedForBillingDays: 'submitted_for_billing_days',
  closedDays: 'closed_days',
  date: 'date',
  createdAt: 'created_at',
  poNumber: 'po_number'
};

const dbUpdates = {};
for (const key in updates) {
  if (camelToSnake[key]) {
// If updating status_history, always stringify it
if (camelToSnake[key] === 'status_history') {
  dbUpdates['status_history'] = JSON.stringify(updates[key] || []);
} else {
  dbUpdates[camelToSnake[key]] = updates[key];
}}}

const setClauses = [];
const values = [];
let idx = 1;
for (const field in dbUpdates) {
  setClauses.push(`${field} = $${idx++}`);
  values.push(dbUpdates[field]);
}

if (setClauses.length === 0) return null;

values.push(workOrderNo);

const query = `
  UPDATE workorders
  SET ${setClauses.join(', ')}
  WHERE work_order_no = $${idx}
  RETURNING *
`;

const result = await pool.query(query, values);
return result.rows[0];

}

// (To be updated) Get a work order by ID
async function getById(id) {
  const result = await pool.query(
    'SELECT * FROM workorders WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

module.exports = {
  getAll,
  add,
  addLineItem,
  addTimeEntry,
  updateStatus,
  getById,
  updateWorkOrderByNo,
};
