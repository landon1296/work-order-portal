const pool = require('../db');

// Get all work orders - OPTIMIZED VERSION
// Get all work orders, with timeLogs and parts attached using JOIN queries
async function getAll() {
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
  const workOrders = result.rows;

  // Convert JSON strings to arrays
  workOrders.forEach(wo => {
    if (typeof wo.parts === 'string') {
      try { wo.parts = JSON.parse(wo.parts); } catch { wo.parts = []; }
    }
    if (typeof wo.time_logs === 'string') {
      try { wo.time_logs = JSON.parse(wo.time_logs); } catch { wo.time_logs = []; }
    }
    wo.timeLogs = wo.time_logs;
    delete wo.time_logs;
  });

  return workOrders;
}

// Get paginated work orders with lightweight fields and counts
async function getPaginated({ limit = 50, offset = 0, includeClosed = false }) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);

  // Build WHERE clause - exclude closed orders by default
  const whereClause = includeClosed ? '' : "WHERE w.status != 'Closed'";
  
  // Count total rows (respecting closed filter)
  const countQuery = includeClosed 
    ? 'SELECT COUNT(*)::int AS count FROM workorders'
    : "SELECT COUNT(*)::int AS count FROM workorders WHERE status != 'Closed'";
  const countResult = await pool.query(countQuery);
  const total = countResult.rows[0]?.count || 0;

  // Lightweight select to minimize transferred memory
  const result = await pool.query(
    `SELECT 
       w.id,
       w.work_order_no,
       w.date,
       w.company_name,
       w.shop,
       w.status,
       w.created_at,
       -- Summary fields needed by dashboards
       w.make,
       w.model,
       w.serial_number,
       w.po_number,
       w.contact_name,
       w.contact_phone,
       w.contact_email,
       w.shipping_cost,
       w.ship_from_glls_cost,
       w.shipping_comments,
       -- Minimal latest time log (for technician username display)
       COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'technician_assigned', te.technician_assigned,
               'assign_date', te.assign_date
             )
           ) FROM (
             SELECT te.technician_assigned, te.assign_date
             FROM time_entries te 
             WHERE te.work_order_no = w.work_order_no
             ORDER BY te.assign_date DESC NULLS LAST, te.id DESC
             LIMIT 1
           ) te
         ),
         '[]'::json
       ) AS time_logs
     FROM workorders w
     ${whereClause}
     ORDER BY w.id DESC
     LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset]
  );

  return { rows: result.rows, total };
}

async function getMaxWorkOrderNo() {
  const result = await pool.query('SELECT COALESCE(MAX(CAST(work_order_no AS INT)), 0) AS max_no FROM workorders');
  return result.rows[0]?.max_no || 0;
}

async function getAssignedForTechnician(username) {
  // Query only what we need and filter at DB layer
  const result = await pool.query(
    `SELECT w.*
     FROM workorders w
     WHERE w.status <> 'Closed'
       AND EXISTS (
         SELECT 1 FROM time_entries te
         WHERE te.work_order_no = w.work_order_no
           AND te.technician_assigned = $1
       )
     ORDER BY w.id DESC`,
    [username]
  );
  return result.rows;
}

async function searchWorkOrders(searchTerm, { limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const searchPattern = `%${searchTerm.toLowerCase()}%`;

  // Count total matches
  const countResult = await pool.query(`
    SELECT COUNT(*)::int AS count 
    FROM workorders w
    WHERE 
      LOWER(w.company_name) LIKE $1 OR
      w.work_order_no::text LIKE $2 OR
      LOWER(w.serial_number) LIKE $1 OR
      LOWER(w.make) LIKE $1 OR
      LOWER(w.model) LIKE $1 OR
      LOWER(w.work_description) LIKE $1 OR
      LOWER(w.notes) LIKE $1 OR
      LOWER(w.shop) LIKE $1 OR
      LOWER(w.status) LIKE $1 OR
      EXISTS (
        SELECT 1 FROM time_entries te 
        WHERE te.work_order_no = w.work_order_no 
          AND LOWER(te.technician_assigned) LIKE $1
      )
  `, [searchPattern, `%${searchTerm}%`]);
  
  const total = countResult.rows[0]?.count || 0;

  // Get matching work orders
  const result = await pool.query(`
    SELECT 
      w.*,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'technician_assigned', te.technician_assigned,
              'assign_date', te.assign_date
            )
          )
          FROM (
            SELECT te.technician_assigned, te.assign_date
            FROM time_entries te
            WHERE te.work_order_no = w.work_order_no
            ORDER BY te.assign_date DESC NULLS LAST, te.id DESC
            LIMIT 1
          ) te
        ),
        '[]'::json
      ) AS time_logs
    FROM workorders w
    WHERE 
      LOWER(w.company_name) LIKE $1 OR
      w.work_order_no::text LIKE $2 OR
      LOWER(w.serial_number) LIKE $1 OR
      LOWER(w.make) LIKE $1 OR
      LOWER(w.model) LIKE $1 OR
      LOWER(w.work_description) LIKE $1 OR
      LOWER(w.notes) LIKE $1 OR
      LOWER(w.shop) LIKE $1 OR
      LOWER(w.status) LIKE $1 OR
      EXISTS (
        SELECT 1 FROM time_entries te 
        WHERE te.work_order_no = w.work_order_no 
          AND LOWER(te.technician_assigned) LIKE $1
      )
    ORDER BY w.id DESC
    LIMIT $3 OFFSET $4
  `, [searchPattern, `%${searchTerm}%`, safeLimit, safeOffset]);

  return { rows: result.rows, total };
}

async function getWorkOrdersBySerialNumber(serialNumber, { limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM workorders WHERE LOWER(serial_number) = LOWER($1)',
    [serialNumber]
  );
  
  const total = countResult.rows[0]?.count || 0;

  const result = await pool.query(
    `SELECT * FROM workorders 
     WHERE LOWER(serial_number) = LOWER($1)
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [serialNumber, safeLimit, safeOffset]
  );

  return { rows: result.rows, total };
}


// Add a new work order
async function add(order) {
  console.log('📝 add() function called with order:', JSON.stringify(order, null, 2));
  
  if (!order.status) order.status = "Assigned";
if (!order.statusHistory || !Array.isArray(order.statusHistory)) {
  const now = new Date().toISOString();
  order.statusHistory = [{ status: "Assigned", date: now }];
}
if (!order.assignedDays) order.assignedDays = 1;

  // Validate required fields
  if (!order.workOrderNo) {
    throw new Error('workOrderNo is required');
  }
  if (!order.date) {
    throw new Error('date is required');
  }

  // Convert empty strings to null for numeric fields
  const shippingCost = order.shippingCost === '' || order.shippingCost === null || order.shippingCost === undefined 
    ? null 
    : (typeof order.shippingCost === 'string' ? parseFloat(order.shippingCost) || null : order.shippingCost);
  
  const shipFromGllsCost = order.shipFromGllsCost === '' || order.shipFromGllsCost === null || order.shipFromGllsCost === undefined 
    ? null 
    : (typeof order.shipFromGllsCost === 'string' ? parseFloat(order.shipFromGllsCost) || null : order.shipFromGllsCost);

  console.log('📝 Inserting work order with workOrderNo:', order.workOrderNo);

  try {
    const result = await pool.query(
      `INSERT INTO workorders
        (
          work_order_no, date, company_name, company_street, company_city,
          company_state, company_zip, field_contact_name, field_contact_number,
          field_street, field_city, field_state, field_zipcode,
          make, model, other_desc, serial_number, contact_name, contact_phone,
          contact_email, vendor_warranty, billable, maintenance, non_billable_repair, shop, repair_type,
          sales_name, shipping_cost, ship_from_glls_cost, shipping_comments, work_description, po_number, notes, status,
          status_history, assigned_days, in_progress_days,
          in_progress_pending_parts_days, completed_pending_approval_days,
          submitted_for_billing_days, closed_days, customer_signature, customer_signature_printed
        )
       VALUES
        (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
          $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43
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
        order.vendorWarranty,
        order.billable,
        order.maintenance,
        order.nonBillableRepair,
        order.shop,
        order.repairType,
        order.salesName,
        shippingCost,
        shipFromGllsCost,
        order.shippingComments,
        order.workDescription,
        order.poNumber,
        order.notes, // or order.notes, if that's what you use
        order.status,
        JSON.stringify(order.statusHistory || []), // this can be an array or JSON
        order.assignedDays,
        order.inProgressDays,
        order.inProgressPendingPartsDays,
        order.completedPendingApprovalDays,
        order.submittedForBillingDays,
        order.closedDays,
        order.customerSignature,
        order.customerSignaturePrinted
      ]
    );
    
    console.log('✅ Successfully inserted work order:', result.rows[0]?.work_order_no);
    return result.rows[0];
  } catch (dbError) {
    console.error('❌ Database error in add() function:', dbError);
    console.error('❌ Error code:', dbError.code);
    console.error('❌ Error detail:', dbError.detail);
    console.error('❌ Error constraint:', dbError.constraint);
    console.error('❌ Error message:', dbError.message);
    throw dbError; // Re-throw to be caught by route handler
  }
}

// Add a line item for a work order
async function addLineItem(lineItem) {
  const partNumber = (lineItem.partNumber || '').trim();
  const description = (lineItem.description || '').trim();
  const quantity = Number(lineItem.quantity || 0);

  if (!partNumber && !description && quantity === 0) return; // Skip if empty

  const result = await pool.query(
    `INSERT INTO line_items
      (work_order_no, part_number, description, quantity, waiting, waiting_from, ordered_date, estimated_delivery_date)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      lineItem.workOrderNo,
      partNumber,
      description,
      quantity,
      lineItem.waiting,
      lineItem.waiting ? new Date() : null,
      null,
      lineItem.estimatedDeliveryDate || null
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
  vendorWarranty: 'vendor_warranty',
  billable: 'billable',
  maintenance: 'maintenance',
  nonBillableRepair: 'non_billable_repair',
  shop: 'shop',
  repairType: 'repair_type',
  salesName: 'sales_name',
  shippingCost: 'shipping_cost',
  shipFromGllsCost: 'ship_from_glls_cost',
  shippingComments: 'shipping_comments',
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
  poNumber: 'po_number',
  customerSignature: 'customer_signature',
  customerSignaturePrinted: 'customer_signature_printed'
};

const dbUpdates = {};
// Numeric fields that should be NULL if empty string
const numericFields = ['shipping_cost', 'ship_from_glls_cost'];
for (const key in updates) {
  if (camelToSnake[key]) {
// If updating status_history, always stringify it
if (camelToSnake[key] === 'status_history') {
  dbUpdates['status_history'] = JSON.stringify(updates[key] || []);
} else {
  const dbField = camelToSnake[key];
  let value = updates[key];
  // Convert empty strings to NULL for numeric fields, and ensure numeric values are properly formatted
  if (numericFields.includes(dbField)) {
    if (value === '' || value === null || value === undefined) {
      value = null;
    } else if (typeof value === 'string' && value.trim() !== '') {
      // Convert string numbers to actual numbers
      const numValue = parseFloat(value);
      value = isNaN(numValue) ? null : numValue;
    }
  }
  dbUpdates[dbField] = value;
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
console.log('updateWorkOrderByNo: Database returned fields:', Object.keys(result.rows[0] || {}));
if (result.rows[0] && result.rows[0].notes) {
  console.log('updateWorkOrderByNo: Notes field from database:', result.rows[0].notes);
}
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
  getPaginated,
  getMaxWorkOrderNo,
  getAssignedForTechnician,
  searchWorkOrders,
  getWorkOrdersBySerialNumber,
  add,
  addLineItem,
  addTimeEntry,
  updateStatus,
  getById,
  updateWorkOrderByNo
};
