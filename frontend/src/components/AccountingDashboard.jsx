import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import GLLSLogo from '../assets/GLLSLogo.png';
import logoBase64 from '../assets/logoBase64';
import { getStatusColor } from '../utils/statusColors';

const SHOP_OPTIONS = [
  { value: 'All Shops', label: 'All Shops' },
  { value: 'Texas Shop', label: 'Texas Shop' },
  { value: 'Florida Shop', label: 'Florida Shop' },
  { value: 'Peotone Shop', label: 'Peotone Shop' }
];

export default function AccountingDashboard({ user }) {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [searchBilling, setSearchBilling] = useState("");
  const [searchClosed, setSearchClosed] = useState("");
  const [shopFilter, setShopFilter] = useState(() => localStorage.getItem('defaultShopFilter') || 'All Shops');
  const [alerts, setAlerts] = useState([]);
  const navigate = useNavigate();
  const [closedPage, setClosedPage] = useState(1);
  const CLOSED_PAGE_SIZE = 10;

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line
  }, [user.token]);

  useEffect(() => {
    const defaultShop = localStorage.getItem('defaultShopFilter');
    if (defaultShop) setShopFilter(defaultShop);
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch all work orders
  const fetchOrders = async () => {
    try {
      const res = await API.get('/workorders', { headers: { Authorization: `Bearer ${user.token}` } });
      setOrders(res.data);
    } catch (err) {
      setOrders([]);
      console.error(err);
    }
  };

  async function fetchAlerts() {
    try {
      const res = await API.get('/api/alerts');
      setAlerts(res.data || []);
    } catch {
      setAlerts([]);
    }
  }

  // Clear an alert
  async function clearAlert(id) {
    await API.delete(`/api/alerts/${id}`);
    fetchAlerts(); // Reload list
  }

  // Location filter
  const filteredOrders = shopFilter === 'All Shops'
    ? orders
    : orders.filter(order => order.shop === shopFilter);

  // Status filters


  const submittedForBillingOrders = filteredOrders.filter(
    o => o.status && o.status.toLowerCase() === 'submitted for billing'
  );

  const closedOrders = filteredOrders.filter(
    o => o.status && o.status.toLowerCase() === 'closed'
  );

  const regularOrders = filteredOrders.filter(
    o => !o.status || (
      o.status.toLowerCase() !== 'pending review' &&
      o.status.toLowerCase() !== 'pending approval' &&
      o.status.toLowerCase() !== 'submitted for billing' &&
      o.status.toLowerCase() !== 'closed'
    )
  );

  // Search Filters
const filteredSubmittedForBilling = submittedForBillingOrders.filter(order =>
  (order.companyName && order.companyName.toLowerCase().includes(searchBilling.toLowerCase())) ||
  (order.workOrderNo && order.workOrderNo.toString().includes(searchBilling)) ||
  (order.date && order.date.includes(searchBilling)) ||
  (order.serialNumber && order.serialNumber.toLowerCase().includes(searchBilling.toLowerCase())) ||
  (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(searchBilling.toLowerCase()))
);

const filteredClosedOrders = closedOrders.filter(order =>
  (order.companyName && order.companyName.toLowerCase().includes(searchClosed.toLowerCase())) ||
  (order.workOrderNo && order.workOrderNo.toString().includes(searchClosed)) ||
  (order.date && order.date.includes(searchClosed)) ||
  (order.serialNumber && order.serialNumber.toLowerCase().includes(searchClosed.toLowerCase())) ||
  (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(searchClosed.toLowerCase()))
);

const filteredActiveWorkOrders = regularOrders.filter(order =>
  (order.companyName && order.companyName.toLowerCase().includes(search.toLowerCase())) ||
  (order.workOrderNo && order.workOrderNo.toString().includes(search)) ||
  (order.date && order.date.includes(search)) ||
  (order.serialNumber && order.serialNumber.toLowerCase().includes(search.toLowerCase())) ||
  (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(search.toLowerCase()))
);

  // Handlers
  const handleRework = async (order) => {
    try {
      await API.put(`/workorders/${order.workOrderNo}`, {
        ...order,
        status: 'Completed, Pending Approval'
      });
      alert('Sent back to manager for rework!');
      fetchOrders();
    } catch (err) {
      alert('Failed to reassign for rework.');
      console.error(err);
    }
  };

  const handleCloseWorkOrder = async (order) => {
    if (!window.confirm("Are you sure you want to close this work order? This will write it to Google Sheets.")) return;
    try {
      await API.put(`/workorders/close/${order.id}`);
      alert("Work order closed!");
      fetchOrders();
    } catch (err) {
      alert(
        err?.response?.data?.error ||
        "Failed to close work order. Make sure this work order is ready for close."
      );
      console.error(err);
    }
  };

// --- NEW PDF HANDLER (jsPDF + autoTable) ---


function formatDate(dateStr) {
  const date = new Date(dateStr);
  return isNaN(date) ? "" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}
function drawRoundedRect(doc, x, y, width, height, radius = 3) {
  doc.roundedRect(x, y, width, height, radius, radius);
}

const handleViewPDF = (order) => {
  try {
    console.log("Generating PDF for work order", order.workOrderNo);

const doc = new jsPDF({ margin: 20 }); // doesn't apply automatically, so we’ll manage margins manually
const leftMargin = 20;
const rightMargin = 20;
const topMargin = 20;
const bottomMargin = 20;
const pageHeight = doc.internal.pageSize.getHeight();

    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`Work Order #${order.workOrderNo}`, 80, y, { align: "right" });
    y += 10;
    if (logoBase64) {
    doc.addImage(logoBase64, "PNG", 90, 10.5, 93.75, 15);


    }
    
  

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    const info = [
      ["Date", formatDate(order.date)],
      ["Company", order.companyName],
      ["Address", `${order.companyStreet}, ${order.companyCity}, ${order.companyState} ${order.companyZip}`],
      ["Contact", `${order.contactName || ""} (${order.contactPhone || ""})`],
      ["Technician(s)", [...new Set((order.timeLogs || []).map(t => t.technicianAssigned).filter(Boolean))].join(", ")],
      ["Make / Model / Serial", `${order.make} / ${order.model} / ${order.serialNumber}`],
      ["Repair Type", order.repairType],
      ["Work Type", [
        order.vendorWarranty ? "Vendor Warranty" : "",
        order.billable ? "Billable" : "",
        order.maintenance ? "Maintenance" : "",
        order.nonBillableRepair ? "Non-billable Repair" : ""
      ].filter(Boolean).join(", ")],
      ["Shop", order.shop],
      ["Status", order.status]
    ];
    const infoStartY = y + 5;
    let currentInfoY = infoStartY;

    info.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, leftMargin, currentInfoY += 8);
      doc.setFont("helvetica", "normal");
      doc.text(value || "", leftMargin + 60, currentInfoY);
    });
    drawRoundedRect(doc, leftMargin - 5, infoStartY - 0, 180, currentInfoY - infoStartY + 5, 4);
    y = currentInfoY + 4;
const estimatedWorkDescHeight = doc.splitTextToSize(order.workDescription || "", 170).length * 6 + 16;
if (y + estimatedWorkDescHeight > pageHeight - bottomMargin) {
  doc.addPage();
  y = topMargin;
}

// Work Description
doc.setFont("helvetica", "bold");
const workDescStartY = y + 10;
doc.text("Work Description:", leftMargin, workDescStartY);
doc.setFont("helvetica", "normal");
const workDescText = doc.splitTextToSize(order.workDescription || "", 170);
doc.text(workDescText, leftMargin, workDescStartY + 6);
drawRoundedRect(doc, leftMargin - 5, workDescStartY - 5, 180, workDescText.length * 6 + 16, 4);
y = workDescStartY + workDescText.length * 6 + 20;


const estimatedNotesHeight = doc.splitTextToSize(order.notes || "", 170).length * 6 + 16;
if (y + estimatedNotesHeight > pageHeight - bottomMargin) {
  doc.addPage();
  y = topMargin;
}

// Tech Summary / Notes
doc.setFont("helvetica", "bold");
const notesStartY = y;
doc.text("Tech Summary / Notes:", leftMargin, notesStartY);
doc.setFont("helvetica", "normal");
const notesText = doc.splitTextToSize(order.notes || "", 170);
doc.text(notesText, leftMargin, notesStartY + 6);
drawRoundedRect(doc, leftMargin - 5, notesStartY - 5, 180, notesText.length * 6 + 16, 4);
y = notesStartY + notesText.length * 6 + 20;


// Parts Table
if (order.parts && order.parts.length > 0) {
  doc.setFont("helvetica", "bold");
const partsStartY = y;
doc.text("Parts Used", leftMargin, partsStartY);
y += 6;


doc.autoTable({
  startY: y,
  head: [["Part #", "Description", "Qty"]],
  body: order.parts.map(p => [p.partNumber || "", p.description || "", p.quantity || ""]),
  margin: { top: 20, bottom: 20, left: leftMargin, right: rightMargin },
  styles: {
    fontSize: 10,
    overflow: 'linebreak',
    cellPadding: 3,
    lineWidth: 0 // disables all borders
  },
  alternateRowStyles: {
    fillColor: [230, 230, 230] // light gray for zebra striping
  },
  tableWidth: doc.internal.pageSize.getWidth() - leftMargin - rightMargin,
  pageBreak: 'auto',
  headStyles: { fillColor: [0, 102, 204], textColor: 255 },
});
y = doc.lastAutoTable.finalY + 14;

}

// Time Logs Table
if (order.timeLogs && order.timeLogs.length > 0) {
  doc.setFont("helvetica", "bold");
  doc.text("Time Logs", leftMargin, y);
  y += 6;

doc.autoTable({
  startY: y,
  head: [["Tech", "Date", "Start", "Finish", "Travel"]],
  body: order.timeLogs.map(log => [
    log.technicianAssigned || "",
    formatDate(log.assignDate),
    log.startTime || "",
    log.finishTime || "",
    log.travelTime || ""
  ]),
  margin: { top: 10, bottom: 30, left: leftMargin, right: rightMargin },
    styles: {
    fontSize: 10,
    overflow: 'linebreak',
    cellPadding: 3,
    lineWidth: 0 // disables all borders
  },
  alternateRowStyles: {
    fillColor: [230, 230, 230] // light gray for zebra striping
  },
  tableWidth: doc.internal.pageSize.getWidth() - leftMargin - rightMargin,
  pageBreak: 'auto',
  headStyles: { fillColor: [0, 102, 204], textColor: 255 },
});


  y = doc.lastAutoTable.finalY + 14;
}




// Signature
if (order.customerSignature) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const signatureBlockHeight = 60; // estimated block height including image + text

  if (y + signatureBlockHeight > pageHeight - 20) {
    doc.addPage();
    y = 20;
  }

  const signatureStartY = y;

  doc.setFont("helvetica", "bold");
  doc.text("Customer Acknowledgement Signature:", leftMargin, signatureStartY);

  const sigImgHeight = 25;
  const sigImgWidth = 100;
  const sigPadding = 10;

  doc.addImage(order.customerSignature, "PNG", leftMargin, signatureStartY + 5, sigImgWidth, sigImgHeight);

  let printedY = signatureStartY + sigImgHeight + 15;

  doc.setFontSize(9);
  if (order.signatureTimestamp) {
    doc.text(`Signed on: ${new Date(order.signatureTimestamp).toLocaleString()}`, leftMargin, printedY);
    printedY += 10;
  }

  if (order.customerSignaturePrinted) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Printed Signature: ${order.customerSignaturePrinted}`, leftMargin, printedY);
    printedY += 10;
  }

  const sectionHeight = printedY - signatureStartY + 5;
  doc.setDrawColor(0);
  drawRoundedRect(doc, leftMargin - 5, signatureStartY - 5, 180, sectionHeight, 4);

  y = printedY + 10;
}




    const pdfUrl = doc.output('bloburl');
window.open(pdfUrl, '_blank');

  } catch (err) {
    console.error("PDF generation failed:", err);
  }
};

  return (
    <div>
      {/* Header row: title left, logo right */}
<div style={{
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  marginBottom: 8,
  fontFamily: 'Ariel, sans-serif'
}}>
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: 30, fontFamily: 'Ariel, sans-serif' }}>
    <button
      onClick={() => window.location.href = '/login'}
      style={{
        background: '#ef4444',
        color: 'white',
        fontWeight: 'bold',
        padding: '6px 14px',
        fontSize: 14,
        borderRadius: 6,
        border: 'none',
        marginBottom: 10,
        cursor: 'pointer',
        fontFamily: 'Ariel, sans-serif'
      }}
    >
      Log Out
    </button>
    <h1 style={{ margin: 0 }}>Accounting Dashboard</h1>
  </div>
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: 20, fontFamily: 'Ariel, sans-serif'}}>
    <img src={GLLSLogo} alt="Company Logo" style={{ height: 100 }} />
  </div>
</div>


      {/* Location Filter */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 16, fontFamily: 'Ariel, sans-serif' }}>
        <label style={{ fontWeight: 700, fontSize: 18, marginRight: 12 }}>Location Filter:</label>
        <select
          value={shopFilter}
          onChange={e => setShopFilter(e.target.value)}
          style={{ fontSize: 18, padding: "6px 16px", borderRadius: 8, minWidth: 170 }}
        >
          {SHOP_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          style={{
            marginLeft: 8,
            padding: "6px 16px",
            borderRadius: 8,
            background: "#e5e7eb",
            color: "#334155",
            fontWeight: 600,
            border: "1px solid #cbd5e1",
            cursor: "pointer",
            fontFamily: 'Ariel, sans-serif'
          }}
          onClick={() => {
            localStorage.setItem('defaultShopFilter', shopFilter);
            alert(`Default location set to "${shopFilter}"!`);
          }}
          type="button"
        >
          Set as Default
        </button>
      </div>

      {alerts.length > 0 && (
        <div style={{
          background: '#fef9c3', color: '#a16207', borderRadius: 8,
          margin: '18px auto', padding: '16px 24px', fontSize: 19, fontWeight: 700,
          maxWidth: 600, textAlign: 'center', border: '2px solid #facc15',
          fontFamily: 'Ariel, sans-serif'
        }}>
          <ul style={{
            listStyle: 'none', margin: 0, padding: 0, display: 'flex',
            flexDirection: 'column', gap: 15, fontFamily: 'Ariel, sans-serif'
          }}>
            {alerts.map(alert => (
              <li key={alert.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#fffde4', borderRadius: 6, padding: '9px 12px', marginBottom: 4, fontSize: 17, fontFamily: 'Ariel, sans-serif'
              }}>
                <span>
                  Part Number <span style={{ fontWeight: 700, fontFamily: 'Ariel, sans-serif' }}>{alert.partNumber}</span>
                  {" "}marked pending for work order{" "}
                  <span style={{ fontWeight: 700, fontFamily: 'Ariel, sans-serif' }}>{alert.workOrderNo}</span>!
                </span>
                <button
                  onClick={() => clearAlert(alert.id)}
                  style={{
                    marginLeft: 18, background: '#fff', border: '2px solid #111',
                    color: '#111', padding: '4px 12px', borderRadius: 5, fontWeight: 700,
                    fontSize: 15, cursor: 'pointer', transition: 'background 0.2s', fontFamily: 'Ariel, sans-serif', cursor: 'pointer'
                  }}
                >Dismiss</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Submitted for Billing Table --- */}
      <h2 style={{fontFamily: 'Ariel, sans-serif'}}>Submitted for Billing (To Close)</h2>
      <input
        type="text"
        placeholder="Search by company, order #, serial #, tech, or date..."
        value={searchBilling}
        onChange={e => { setSearchBilling(e.target.value);
          setClosedPage(1);
        }}
        style={{
          marginBottom: 10,
          padding: 6,
          width: 400,
          fontSize: 16,
          border: "1px solid #ccc",
          borderRadius: 5,
          fontFamily: 'Ariel, sans-serif'
        }}
      />
      <div className="manager-table-wrapper" style={{ overflowX: 'auto' }}>
        <table className='manager-table' style={{ minWidth: 900, marginBottom: 40, fontFamily: 'Ariel, sans-serif'}}>
          <thead>
            <tr>
              <th>Work Order Number</th>
              <th>Date Assigned</th>
              <th>Technician Username</th>
              <th>Company Name</th>
              <th>Shop</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSubmittedForBilling.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', fontFamily: 'Ariel, sans-serif' }}>There are no work orders submitted for billing.</td>
              </tr>
            )}
            {filteredSubmittedForBilling.map(o => (
              <tr key={o.workOrderNo}>
                <td>{o.workOrderNo}</td>
                <td>
  {o.date
    ? new Date(o.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    : ''}
</td>
                <td>{o.timeLogs?.[0]?.technicianAssigned || ''}</td>
                <td>{o.companyName}</td>
                <td>{o.shop}</td>
                <td style={{ fontWeight: 600 }}>
  <span style={{
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: "12px",
    fontSize: "13px",
    background: getStatusColor(o.status),
    color: "#fff",
    fontFamily: 'Ariel, sans-serif'
  }}>
    {o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Submitted for Billing'}
  </span>
</td>
                <td>
                  <button
                    onClick={() => navigate(`/dashboard/workorder/${o.workOrderNo}`)}
                    style={{ cursor: 'pointer', padding: '4px 10px', background: '#64748b', color: 'white', border:'none', borderRadius: 4, marginRight: 4, fontFamily: 'Ariel, sans-serif'}}
                  >
                    View / Edit
                  </button>
                  <button
                    onClick={() => handleRework(o)}
                    style={{ cursor: 'pointer', padding: '4px 10px', background:'#eed812', color: '#222', border:'none', borderRadius: 4, marginRight: 4}}
                  >
                    Rework
                  </button>
                  <button
                    onClick={() => handleCloseWorkOrder(o)}
                    style={{
                      padding: '4px 10px',
                      background:'#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      marginLeft: 0,
                      whiteSpace: 'nowrap',
                      minWidth: 135,
                      cursor: 'pointer'
                    }}
                    title="Close this work order"
                  >
                    Close Work Order
                  </button>
                  <button
                    onClick={() => handleViewPDF(o)}
                    style={{ cursor: 'pointer', padding: '4px 12px', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 4 }}
                  >
                    View PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* --- Active Work Orders --- */}
      <h2 style={{ marginTop: 32, fontFamily: 'Ariel, sans-serif' }}>Active Work Orders</h2>
            <input
        type="text"
        placeholder="Search by company, order #, serial #, tech, or date..."
        value={search}
        onChange={e =>{ setSearch(e.target.value); setClosedPage(1);}}
        style={{
          marginBottom: 10,
          padding: 6,
          width: 400,
          fontSize: 16,
          border: "1px solid #ccc",
          borderRadius: 5,
          fontFamily: 'Ariel, sans-serif'
        }}
      />
      <div className="manager-table-wrapper" style={{overflowX: 'auto'}}>
        <table className='manager-table' style={{ minWidth: 900, marginBottom: 40, fontFamily: 'Ariel, sans-serif' }}>
          <thead>
            <tr>
              <th>Work Order Number</th>
              <th>Date Assigned</th>
              <th>Technician Username</th>
              <th>Company Name</th>
              <th>Shop</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {regularOrders.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', fontFamily: 'Ariel, sans-serif' }}>No active work orders.</td>
              </tr>
            )}
            {filteredActiveWorkOrders.map(o => (
              <tr key={o.workOrderNo}>
                <td>{o.workOrderNo}</td>
                <td>
  {o.date
    ? new Date(o.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    : ''}
</td>
                <td>{o.timeLogs?.[0]?.technicianAssigned || ''}</td>
                <td>{o.companyName}</td>
                <td>{o.shop}</td>
                <td style={{ fontWeight: 600 }}>
  <span style={{
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: "12px",
    fontSize: "13px",
    background: getStatusColor(o.status || 'Assigned'),
    color: "#fff"
  }}>
    {o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Assigned'}
  </span>
</td>

                <td>
                  <button
                    onClick={() => navigate(`/dashboard/workorder/${o.workOrderNo}`)}
                    style={{ cursor: 'pointer', padding: '4px 12px', background: '#64748b', color: 'white', border:'none', borderRadius: 4, marginRight: 4 }}
                  >
                    View / Edit
                  </button>
                  <button
                    onClick={() => handleViewPDF(o)}
                    style={{ cursor: 'pointer', padding: '4px 12px', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 4 }}
                  >
                    View PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* --- Closed Work Orders Archive --- */}
      <h2 style={{ marginTop: 32, fontFamily: 'Ariel, sans-serif' }}>Closed Work Orders Archive</h2>
      <input
        type="text"
        placeholder="Search by company, order #, serial #, tech, or date..."
        value={searchClosed}
        onChange={e => {setSearchClosed(e.target.value); setClosedPage(1);}}
        style={{
          marginBottom: 10,
          padding: 6,
          width: 400,
          fontSize: 16,
          border: "1px solid #ccc",
          borderRadius: 5,
          fontFamily: 'Ariel, sans-serif'
        }}
      />
      <div className="manager-table-wrapper" style={{ overflowX: 'auto' }}>
        <table className='manager-table' style={{ minWidth: 900, marginBottom: 40, fontFamily: 'Ariel, sans-serif' }}>
          <thead>
            <tr>
              <th>Work Order Number</th>
              <th>Date Assigned</th>
              <th>Technician Username</th>
              <th>Company Name</th>
              <th>Shop</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClosedOrders.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>No closed work orders found.</td>
              </tr>
            )}
            {filteredClosedOrders
              .slice((closedPage - 1) * CLOSED_PAGE_SIZE, closedPage * CLOSED_PAGE_SIZE)
              .map(o => (

              <tr key={o.workOrderNo}>
                <td>{o.workOrderNo}</td>
                <td>
  {o.date
    ? new Date(o.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    : ''}
</td>
                <td>{o.timeLogs?.[0]?.technicianAssigned || ''}</td>
                <td>{o.companyName}</td>
                <td>{o.shop}</td>
                <td>{o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Closed'}</td>
                <td>
                  <button
                    onClick={() => navigate(`/dashboard/workorder/${o.workOrderNo}`)}
                    style={{ cursor: 'pointer', padding: '4px 12px', background: '#64748b', color: 'white', border:'none', borderRadius: 4, marginRight: 4 }}
                  >
                    View / Edit
                  </button>
                  <button
                    onClick={() => handleViewPDF(o)}
                    style={{ cursor: 'pointer', padding: '4px 12px', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 4 }}
                  >
                    View PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredClosedOrders.length > CLOSED_PAGE_SIZE && (
  <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 16 }}>
    <button
      onClick={() => setClosedPage(p => Math.max(p - 1, 1))}
      disabled={closedPage === 1}
      style={{
        padding: '6px 12px',
        background: closedPage === 1 ? '#e5e7eb' : '#2563eb',
        color: closedPage === 1 ? '#888' : 'white',
        border: 'none',
        borderRadius: 6,
        cursor: closedPage === 1 ? 'default' : 'pointer'
      }}
    >
      Previous
    </button>

    <span style={{ alignSelf: 'center', fontSize: 14 }}>
      Page {closedPage} of {Math.ceil(filteredClosedOrders.length / CLOSED_PAGE_SIZE)}
    </span>

    <button
      onClick={() => setClosedPage(p => p + 1)}
      disabled={closedPage >= Math.ceil(filteredClosedOrders.length / CLOSED_PAGE_SIZE)}
      style={{
        padding: '6px 12px',
        background: closedPage >= Math.ceil(filteredClosedOrders.length / CLOSED_PAGE_SIZE) ? '#e5e7eb' : '#2563eb',
        color: closedPage >= Math.ceil(filteredClosedOrders.length / CLOSED_PAGE_SIZE) ? '#888' : 'white',
        border: 'none',
        borderRadius: 6,
        cursor: closedPage >= Math.ceil(filteredClosedOrders.length / CLOSED_PAGE_SIZE) ? 'default' : 'pointer'
      }}
    >
      Next
    </button>
  </div>
)}

      </div>


    </div>
  );
}
