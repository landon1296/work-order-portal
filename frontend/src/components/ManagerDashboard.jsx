import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import GLLSLogo from '../assets/GLLSLogo.png';
import { getStatusColor } from '../utils/statusColors';


const SHOP_OPTIONS = [
  { value: 'All Shops', label: 'All Shops' },
  { value: 'Texas Shop', label: 'Texas Shop' },
  { value: 'Florida Shop', label: 'Florida Shop' },
  { value: 'Peotone Shop', label: 'Peotone Shop' }
];

export default function ManagerDashboard({ user }) {
  // Defensive: handle loading state to prevent crash
  if (!user || !user.token) {
    return <div>Loading dashboard...</div>;
  }

  // ...your existing code follows:
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [closedSearch, setClosedSearch] = useState("");
  const [shopFilter, setShopFilter] = useState(() => localStorage.getItem('defaultShopFilter') || 'All Shops');
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line
  }, [user.token]);


  useEffect(() => {
    const defaultShop = localStorage.getItem('defaultShopFilter');
    if (defaultShop) setShopFilter(defaultShop);
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

  // Robust helper: checks if a part is fully blank/empty
  function isPartBlank(part) {
    if (!part) return true;
    return Object.values(part).every(
      val =>
        val === "" ||
        val === null ||
        val === undefined ||
        val === false ||
        val === 0 ||
        (typeof val === "number" && isNaN(val))
    );
  }

  // Helper: can this WO be closed by Ray?
  function canCloseWorkOrder(wo) {
    // Must be in "Pending Review" or "Pending Approval"
    if (
      !wo.status ||
      !(
        wo.status.toLowerCase().includes("pending review") ||
        wo.status.toLowerCase().includes("pending approval")
      )
    ) return false;
    // No parts at all, or all parts are blank
    if (!Array.isArray(wo.parts) || wo.parts.length === 0) return true;
    return wo.parts.every(isPartBlank);
  }

  // Handler for new work order
  const handleAssignNewWorkOrder = () => {
    navigate('/assign');
  };

  // Location filter: applies to ALL order groups
  const filteredOrders = shopFilter === 'All Shops'
    ? orders
    : orders.filter(order => order.shop === shopFilter);

  // Split orders by status (using filteredOrders)
  const pendingReviewOrders = filteredOrders.filter(
    o =>
      o.status &&
      (
        o.status.toLowerCase().includes('pending review') ||
        o.status.toLowerCase().includes('pending approval')
      )
  );

  const regularOrders = filteredOrders.filter(
    o => !o.status || (
      !o.status.toLowerCase().includes('pending review') &&
      !o.status.toLowerCase().includes('pending approval') &&
      o.status.toLowerCase() !== 'submitted for billing' &&
      o.status.toLowerCase() !== 'closed'
    )
  );

  // Filters for archives (using filteredOrders)
  const submittedForBillingOrders = filteredOrders.filter(
    o => o.status && o.status.toLowerCase() === 'submitted for billing'
  );

  const closedOrders = filteredOrders.filter(
    o => o.status && o.status.toLowerCase() === 'closed'
  );



  // Search filter (optional, affects both archives)


const filteredSubmittedForBilling = submittedForBillingOrders.filter(order =>
  (order.companyName && order.companyName.toLowerCase().includes(search.toLowerCase())) ||
  (order.workOrderNo && order.workOrderNo.toString().includes(search)) ||
  (order.date && order.date.includes(search)) ||
  (order.serialNumber && order.serialNumber.toLowerCase().includes(search.toLowerCase())) ||
  (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(search.toLowerCase()))
);


const filteredClosedOrders = closedOrders.filter(order =>
  (order.companyName && order.companyName.toLowerCase().includes(closedSearch.toLowerCase())) ||
  (order.workOrderNo && order.workOrderNo.toString().includes(closedSearch)) ||
  (order.date && order.date.includes(closedSearch)) ||
  (order.serialNumber && order.serialNumber.toLowerCase().includes(closedSearch.toLowerCase())) ||
  (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(closedSearch.toLowerCase()))
);

const filteredActiveWorkOrders = regularOrders.filter(order =>

  (order.companyName && order.companyName.toLowerCase().includes(search.toLowerCase())) ||
  (order.workOrderNo && order.workOrderNo.toString().includes(search)) ||
  (order.date && order.date.includes(search)) ||
  (order.serialNumber && order.serialNumber.toLowerCase().includes(search.toLowerCase())) ||
  (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(search.toLowerCase()))
);

  // Button handlers (same as before)
  const handleRework = async (order) => {
    try {
      await API.put(`/workorders/${order.workOrderNo}`, {
        ...order,
        status: 'Assigned'
      });
      alert('Sent back to technician for rework!');
      fetchOrders();
    } catch (err) {
      alert('Failed to reassign for rework.');
      console.error(err);
    }
  };

  const handleSubmitForBilling = async (order) => {
    try {
      await API.put(`/workorders/submit-for-billing/${order.id}`);
      alert('Work order submitted for billing!');
      fetchOrders();
    } catch (err) {
      alert('Failed to submit for billing.');
      console.error(err);
    }
  };

  // Handler for closing work order
  const handleCloseWorkOrder = async (order) => {
    if (!window.confirm("Are you sure you want to close this work order? This cannot be undone.")) return;
    try {
      await API.put(`/workorders/close/${order.id}`);
      alert("Work order closed!");
      fetchOrders();
    } catch (err) {
      alert(
        err?.response?.data?.error ||
        "Failed to close work order. Make sure this work order truly has no parts."
      );
      console.error(err);
    }
  };

  // PDF GENERATION HANDLER (updated)
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return isNaN(date) ? '' : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

const handleViewPDF = (order) => {
  const container = document.createElement('div');
  container.style.width = '700px';
  container.style.wordBreak = 'break-word';
  container.style.padding = '12px';
  container.style.fontFamily = 'monospace';
  container.style.fontSize = '15px';
  container.style.lineHeight = '1.6';
  container.style.letterSpacing = '0.2px';
  container.innerHTML = `
    <h2 style="text-align:center; color:#3056d3;">Work Order #${order.workOrderNo}</h2>
    <table style="width:100%; border-collapse:collapse; margin-left:50px">
  <tr><td style="padding-bottom:3px;"><strong>Date:</strong></td><td style="padding-bottom:3px;">${formatDate(order.date)}</td></tr>
  <tr><td style="padding-bottom:3px;"><strong>Company:</strong></td><td style="padding-bottom:3px;">${order.companyName}</td></tr>
  <tr><td style="padding-bottom:3px;"><strong>Address:</strong></td><td style="padding-bottom:3px;">${order.companyStreet}, ${order.companyCity}, ${order.companyState} ${order.companyZip}</td></tr>
  <tr>
  <td><strong>Contact:</strong></td>
  <td>
    ${order.contactName || ""}
    <span style="margin-left: 6px; font-family: monospace; font-size: 15px;">
      (${order.contactPhone || ""})
    </span>
  </td>
</tr>

  <tr><td style="padding-bottom:3px;"><strong>Technician:</strong></td><td style="padding-bottom:3px;">${
    order.timeLogs
      ? [...new Set(order.timeLogs.map(t => t.technicianAssigned).filter(Boolean))].join(', ')
      : ""
  }</td></tr>
  <tr><td style="padding-bottom:3px;"><strong>Make / Model / Serial:</strong></td><td style="padding-bottom:3px;">${order.make} / ${order.model} / ${order.serialNumber}</td></tr>
  <tr><td style="padding-bottom:3px;"><strong>Repair Type:</strong></td><td style="padding-bottom:3px;">${order.repairType}</td></tr>
  <tr><td style="padding-bottom:3px;"><strong>Work Type:</strong></td><td style="padding-bottom:3px;">${[
    order.warranty ? 'Warranty' : '',
    order.billable ? 'Billable' : '',
    order.maintenance ? 'Maintenance' : '',
    order.nonBillableRepair ? 'Non-billable Repair' : ''
  ].filter(Boolean).join(', ')}</td></tr>
  <tr><td style="padding-bottom:3px;"><strong>Shop:</strong></td><td style="padding-bottom:3px;">${order.shop}</td></tr>
  <tr><td style="padding-bottom:3px;"><strong>Status:</strong></td><td style="padding-bottom:3px;">${order.status}</td></tr>
</table>

    <h3 style="margin-top:18px;">Work Description</h3>
    <div style="border:1px solid #ccc; padding:6px; min-height:36px;">${order.workDescription || ""}</div>
    <h3 style="margin-top:18px;">Tech Summary / Notes</h3>
    <div style="border:1px solid #ccc; padding:6px; min-height:36px;">${order.notes || ""}</div>
    <h3 style="margin-top:18px;">Parts</h3>
    <table style="width:100%; border-collapse:collapse; border:1px solid #aaa;">
      <tr style="background:#e3e3e3;"><th>Part #</th><th>Description</th><th>Qty</th></tr>
      ${(order.parts || []).map(part =>
        `<tr>
          <td>${part.partNumber || ""}</td>
          <td>${part.description || ""}</td>
          <td>${part.quantity || ""}</td>
        </tr>`
      ).join("")}
    </table>
    <h3 style="margin-top:18px;">Time Logs</h3>
<table style="width:100%; border-collapse:collapse; border:1px solid #aaa; text-align:left;">
  <thead>
    <tr style="background:#e3e3e3;">
      <th style="padding:6px;">Tech</th>
      <th style="padding:6px;">Date</th>
      <th style="padding:6px;">Start</th>
      <th style="padding:6px;">Finish</th>
      <th style="padding:6px;">Travel</th>
    </tr>
  </thead>
  <tbody>
    ${(order.timeLogs || []).map(log =>
      `<tr>
        <td style="padding:6px;">${log.technicianAssigned || ""}</td>
        <td style="padding:6px;">${formatDate(log.assignDate)}</td>
        <td style="padding:6px;">${log.startTime || ""}</td>
        <td style="padding:6px;">${log.finishTime || ""}</td>
        <td style="padding:6px;">${log.travelTime || ""}</td>
      </tr>`
    ).join("")}
  </tbody>
</table>

    ${
      order.customerSignature
        ? `
          <div style="margin-top:24px;">
            <div style="font-weight:600; margin-bottom:4px;">Customer Acknowledgement Signature:</div>
            <img src="${order.customerSignature}" alt="Customer Signature" style="max-width:100%; height:auto; border:1px solid #aaa;" />
            <div style="font-size:12px; color:#555;">${
              order.signatureTimestamp
                ? `Signed on: ${new Date(order.signatureTimestamp).toLocaleString()}`
                : ""
            }</div>
          </div>
        `
        : ""
    }
  `;
  document.body.appendChild(container);
  html2canvas(container, { scale: 2 }).then(canvas => {
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    });
    const imgWidth = 560;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    pdf.addImage(imgData, 'PNG', 20, 20, imgWidth, imgHeight);
    window.open(pdf.output('bloburl'));
    document.body.removeChild(container);
  });
};


  return (
    <div>
      {/* Header row: title left, logo and button right */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 8
      }}>
        <h1 style={{ margin: 30 }}>Manager Dashboard</h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <img src={GLLSLogo} alt="Company Logo" className= "login-logo"  />
          <button
            style={{
              background: '#2563eb',
              color: 'white',
              fontWeight: 'bold',
              fontSize: 18,
              padding: '10px 28px',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              marginBottom: 0
            }}
            onClick={handleAssignNewWorkOrder}
          >
            Assign New Work Order
          </button>
        </div>
      </div>

      {/* Location Filter */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 16 }}>
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
            cursor: "pointer"
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

      {/* Active Work Orders */}
      <h2 className="text-lg font-bold mb-2">Active Work Orders</h2>
            <input
        type="text"
        placeholder="Search by company, order #, serial #, tech, or date..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          marginBottom: 10,
          padding: 6,
          width: 400,
          fontSize: 16,
          border: "1px solid #ccc",
          borderRadius: 5,
        }}
      />
      <div style={{overflowX: 'auto'}}>
      <table className='manager-table' style={{ minWidth: 900, marginBottom: 40 }}>
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
              <td colSpan={7} style={{ textAlign: 'center' }}>No active work orders.</td>
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
                  style={{ padding: '4px 10px', background: '#64748b', color: 'white', border:'none', borderRadius: 4, marginRight: 4}}
                >
                  View / Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Pending Review Work Orders */}
      <h2
  className="text-lg font-bold mb-2"
  style={{
    color: pendingReviewOrders.length > 0 ? '#8b5cf6' : 'inherit',
    backgroundColor: pendingReviewOrders.length > 0 ? '#f3e8ff' : 'transparent',
    padding: pendingReviewOrders.length > 0 ? '6px 12px' : undefined,
    borderRadius: pendingReviewOrders.length > 0 ? 6 : undefined,
    textAlign: 'center'
  }}
>
  Pending Review
</h2>

      <div style={{overflowX: 'auto'}}>
      <table className='manager-table' style={{ minWidth: 900 }}>
        <thead>
          <tr>
            <th>Work Order Number</th>
            <th>Date Assigned</th>
            <th>Technician Username</th>
            <th>Company Name</th>
            <th>Shop</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pendingReviewOrders.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center' }}>No work orders pending review.</td>
            </tr>
          )}
          {pendingReviewOrders.map(o => (
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
              <td>
                <button
                  onClick={() => navigate(`/dashboard/workorder/${o.workOrderNo}`)}
                  style={{ padding: '4px 10px', background: '#64748b', color: 'white', border:'none', borderRadius: 4, marginRight: 4}}
                >
                  View / Edit
                </button>
                <button
                  onClick={() => handleRework(o)}
                  style={{ padding: '4px 10px', background:'#eed812', color: '#222', border:'none', borderRadius: 4, marginRight: 4}}
                >
                  Rework
                </button>
                <button
                  onClick={() => handleSubmitForBilling(o)}
                  style={{ padding: '4px 10px', background: '#16a34a', color: 'white', border:'none', borderRadius: 4}}
                >
                  Submit for Billing
                </button>
                {canCloseWorkOrder(o) && (
                  <button
                    onClick={() => handleCloseWorkOrder(o)}
                    style={{
                      padding: '4px 10px',
                      background:'#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      marginLeft: 0,
                    }}
                    title="Close this work order (only if no parts present)"
                  >
                    Close Work Order
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* --- Submitted for Billing Archive --- */}
      <h2 className="text-lg font-bold mb-2" style={{ marginTop: 32 }}>Submitted for Billing Archive</h2>
      <input
        type="text"
        placeholder="Search by company, order #, serial #, tech, or date..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          marginBottom: 10,
          padding: 6,
          width: 400,
          fontSize: 16,
          border: "1px solid #ccc",
          borderRadius: 5,
        }}
      />
      <div style={{ overflowX: 'auto'}}>
        <table className='manager-table' style={{ minWidth: 900, marginBottom: 40 }}>
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
                <td colSpan={7} style={{ textAlign: 'center' }}>No submitted for billing work orders found.</td>
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
                  color: "#fff"
                }}>
                  {o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Submitted for Billing'}
                </span>
              </td>

                <td>
                  <button
                    onClick={() => navigate(`/dashboard/workorder/${o.workOrderNo}`)}
                    style={{ padding: '4px 12px', background: '#64748b', color: 'white', border:'none', borderRadius: 4, marginRight: 4 }}
                  >
                    View / Edit
                  </button>
                  <button
                    onClick={() => handleViewPDF(o)}
                    style={{ padding: '4px 12px', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 4 }}
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
      <h2 className="text-lg font-bold mb-2" style={{ marginTop: 32 }}>Closed Work Orders Archive</h2>
      <input
          type="text"
          placeholder="Search by company, order #, serial #, tech, or date..."
          value={closedSearch}
          onChange={e => setClosedSearch(e.target.value)}
          style={{
            marginBottom: 10,
            padding: 6,
            width: 400,
            fontSize: 16,
            border: "1px solid #ccc",
            borderRadius: 5,
          }}
        />
      <div style={{ overflowX: 'auto'}}>
        <table className='manager-table' style={{ minWidth: 900, marginBottom: 40 }}>
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
            {filteredClosedOrders.map(o => (
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
                    style={{ padding: '4px 12px', background: '#64748b', color: 'white', border:'none', borderRadius: 4, marginRight: 4 }}
                  >
                    View / Edit
                  </button>
                  <button
                    onClick={() => handleViewPDF(o)}
                    style={{ padding: '4px 12px', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 4 }}
                  >
                    View PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
