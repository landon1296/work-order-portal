const pool = require('../db');

// Get all work orders - OPTIMIZED VERSION
// Get all work orders, with timeLogs and parts attached using JOIN queries
async function getAll() {
  const query = `
    SELECT 
      w.*,
      COALESCE(
        json_agg(
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
        ) FILTER (WHERE li.id IS NOT NULL), 
        '[]'::json
      ) as parts,
      COALESCE(
        json_agg(
          json_build_object(
            'id', te.id,
            'technician_assigned', te.technician_assigned,
            'assign_date', te.assign_date,
            'start_time', te.start_time,
            'finish_time', te.finish_time,
            'travel_time', te.travel_time
          )
        ) FILTER (WHERE te.id IS NOT NULL), 
        '[]'::json
      ) as time_logs
    FROM workorders w
    LEFT JOIN line_items li ON w.work_order_no = li.work_order_no
    LEFT JOIN time_entries te ON w.work_order_no = te.work_order_no
    GROUP BY w.id, w.work_order_no, w.date, w.company_name, w.company_street, w.company_city, w.company_state, w.company_zip, w.field_contact_name, w.field_contact_number, w.field_street, w.field_city, w.field_state, w.field_zipcode, w.make, w.model, w.other_desc, w.serial_number, w.contact_name, w.contact_phone, w.contact_email, w.vendor_warranty, w.billable, w.maintenance, w.non_billable_repair, w.shop, w.repair_type, w.sales_name, w.shipping_cost, w.work_description, w.notes, w.status, w.created_at, w.status_history, w.assigned_days, w.in_progress_days, w.in_progress_pending_parts_days, w.completed_pending_approval_days, w.submitted_for_billing_days, w.closed_days, w.po_number, w.customer_signature, w.customer_signature_printed, w.shipping_comments
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


// Add a new work order
async function add(order) {
  if (!order.status) order.status = "Assigned";
if (!order.statusHistory || !Array.isArray(order.statusHistory)) {
  const now = new Date().toISOString();
  order.statusHistory = [{ status: "Assigned", date: now }];
}
if (!order.assignedDays) order.assignedDays = 1;

  const result = await pool.query(
    `INSERT INTO workorders
      (
        work_order_no, date, company_name, company_street, company_city,
        company_state, company_zip, field_contact_name, field_contact_number,
        field_street, field_city, field_state, field_zipcode,
        make, model, other_desc, serial_number, contact_name, contact_phone,
        contact_email, vendor_warranty, billable, maintenance, non_billable_repair, shop, repair_type,
        sales_name, shipping_cost, shipping_comments, work_description, po_number, notes, status,
        status_history, assigned_days, in_progress_days,
        in_progress_pending_parts_days, completed_pending_approval_days,
        submitted_for_billing_days, closed_days, customer_signature, customer_signature_printed
      )
     VALUES
      (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42
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
      order.shippingCost,
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
  updateWorkOrderByNo
};
