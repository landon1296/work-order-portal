import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import GLLSLogo from '../assets/GLLSLogo.png';

const SHOP_OPTIONS = [
  { value: 'All Shops', label: 'All Shops' },
  { value: 'Texas Shop', label: 'Texas Shop' },
  { value: 'Florida Shop', label: 'Florida Shop' },
  { value: 'Peotone Shop', label: 'Peotone Shop' }
];

export default function AccountingDashboard({ user }) {
  const [orders, setOrders] = useState([]);
  const [searchBilling, setSearchBilling] = useState("");
  const [searchClosed, setSearchClosed] = useState("");
  const [shopFilter, setShopFilter] = useState(() => localStorage.getItem('defaultShopFilter') || 'All Shops');
  const [alerts, setAlerts] = useState([]);
  const navigate = useNavigate();

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

  // Filters
  const filteredSubmittedForBilling = submittedForBillingOrders.filter(order =>
    (order.companyName && order.companyName.toLowerCase().includes(searchBilling.toLowerCase())) ||
    (order.workOrderNo && order.workOrderNo.toString().includes(searchBilling)) ||
    (order.date && order.date.includes(searchBilling)) ||
    (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(searchBilling.toLowerCase()))
  );

  const filteredClosedOrders = closedOrders.filter(order =>
    (order.companyName && order.companyName.toLowerCase().includes(searchClosed.toLowerCase())) ||
    (order.workOrderNo && order.workOrderNo.toString().includes(searchClosed)) ||
    (order.date && order.date.includes(searchClosed)) ||
    (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(searchClosed.toLowerCase()))
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

  // PDF GENERATION HANDLER
  const handleViewPDF = (order) => {
    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.padding = '24px';
    container.style.fontFamily = 'Arial';
    container.style.fontSize = '14px';
    container.innerHTML = `
      <h2 style="text-align:center; color:#3056d3;">Work Order #${order.workOrderNo}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td><strong>Date:</strong></td><td>${order.date}</td></tr>
        <tr><td><strong>Company:</strong></td><td>${order.companyName}</td></tr>
        <tr><td><strong>Address:</strong></td><td>${order.companyStreet}, ${order.companyCity}, ${order.companyState} ${order.companyZip}</td></tr>
        <tr><td><strong>Contact:</strong></td><td>${order.contactName || ""} (${order.contactPhone || ""})</td></tr>
        <tr>
          <td><strong>Technician:</strong></td>
          <td>${
            order.timeLogs
              ? [...new Set(order.timeLogs.map(t => t.technicianAssigned).filter(Boolean))].join(', ')
              : ""
          }</td>
        </tr>
        <tr><td><strong>Make / Model / Serial:</strong></td><td>${order.make} / ${order.model} / ${order.serialNumber}</td></tr>
        <tr><td><strong>Repair Type:</strong></td><td>${order.repairType}</td></tr>
        <tr><td><strong>Shop:</strong></td><td>${order.shop}</td></tr>
        <tr><td><strong>Status:</strong></td><td>${order.status}</td></tr>
      </table>
      <h3 style="margin-top:18px;">Work Description</h3>
      <div style="border:1px solid #ccc; padding:6px; min-height:36px;">${order.workDescription || ""}</div>
      <h3 style="margin-top:18px;">Tech Summary / Notes</h3>
      <div style="border:1px solid #ccc; padding:6px; min-height:36px;">${order.notes || ""}</div>
      <h3 style="margin-top:18px;">Parts</h3>
      <table style="width:100%; border-collapse:collapse; border:1px solid #aaa;">
        <tr style="background:#e3e3e3;"><th>Description</th><th>Part #</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr>
        ${(order.parts || []).map(part =>
          `<tr>
            <td>${part.description || ""}</td>
            <td>${part.partNumber || ""}</td>
            <td>${part.quantity || ""}</td>
            <td>${part.unitPrice || ""}</td>
            <td>${part.amount || ""}</td>
          </tr>`
        ).join("")}
      </table>
      <h3 style="margin-top:18px;">Time Logs</h3>
      <table style="width:100%; border-collapse:collapse; border:1px solid #aaa;">
        <tr style="background:#e3e3e3;"><th>Tech</th><th>Date</th><th>Start</th><th>Finish</th><th>Travel</th></tr>
        ${(order.timeLogs || []).map(log =>
          `<tr>
            <td>${log.technicianAssigned || ""}</td>
            <td>${log.assignDate || ""}</td>
            <td>${log.startTime || ""}</td>
            <td>${log.finishTime || ""}</td>
            <td>${log.travelTime || ""}</td>
          </tr>`
        ).join("")}
      </table>
    `;

    document.body.appendChild(container); // Attach to DOM for rendering

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

      document.body.removeChild(container); // Clean up DOM
    });
  };

  return (
    <div>
      {/* Header row: title left, logo right */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 8
      }}>
        <h1 style={{ margin: 30 }}>Accounting Dashboard</h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <img src={GLLSLogo} alt="Company Logo" className= "login-logo"  />
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

      {alerts.length > 0 && (
        <div style={{
          background: '#fef9c3', color: '#a16207', borderRadius: 8,
          margin: '18px auto', padding: '16px 24px', fontSize: 19, fontWeight: 700,
          maxWidth: 600, textAlign: 'center', border: '2px solid #facc15',
        }}>
          <ul style={{
            listStyle: 'none', margin: 0, padding: 0, display: 'flex',
            flexDirection: 'column', gap: 15,
          }}>
            {alerts.map(alert => (
              <li key={alert.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#fffde4', borderRadius: 6, padding: '9px 12px', marginBottom: 4, fontSize: 17,
              }}>
                <span>
                  Part Number <span style={{ fontWeight: 700 }}>{alert.partNumber}</span>
                  {" "}marked pending for work order{" "}
                  <span style={{ fontWeight: 700 }}>{alert.workOrderNo}</span>!
                </span>
                <button
                  onClick={() => clearAlert(alert.id)}
                  style={{
                    marginLeft: 18, background: '#fff', border: '2px solid #111',
                    color: '#111', padding: '4px 12px', borderRadius: 5, fontWeight: 700,
                    fontSize: 15, cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >Dismiss</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Submitted for Billing Table --- */}
      <h2 className="text-lg font-bold mb-2">Submitted for Billing (To Close)</h2>
      <input
        type="text"
        placeholder="Search by company, order #, tech, or date..."
        value={searchBilling}
        onChange={e => setSearchBilling(e.target.value)}
        style={{
          marginBottom: 10,
          padding: 6,
          width: 320,
          fontSize: 16,
          border: "1px solid #ccc",
          borderRadius: 5,
        }}
      />
      <div style={{ overflowX: 'auto' }}>
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
                <td colSpan={7} style={{ textAlign: 'center' }}>There are no work orders submitted for billing.</td>
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
                <td>{o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Submitted for Billing'}</td>
                <td>
                  <button
                    onClick={() => navigate(`/dashboard/workorder/${o.id}`)}
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
                    }}
                    title="Close this work order"
                  >
                    Close Work Order
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
      {/* --- Active Work Orders --- */}
      <h2 className="text-lg font-bold mb-2" style={{ marginTop: 32 }}>Active Work Orders</h2>
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
            {regularOrders.map(o => (
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
                <td>{o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Assigned'}</td>
                <td>
                  <button
                    onClick={() => navigate(`/dashboard/workorder/${o.id}`)}
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
        placeholder="Search by company, order #, tech, or date..."
        value={searchClosed}
        onChange={e => setSearchClosed(e.target.value)}
        style={{
          marginBottom: 10,
          padding: 6,
          width: 320,
          fontSize: 16,
          border: "1px solid #ccc",
          borderRadius: 5,
        }}
      />
      <div style={{ overflowX: 'auto' }}>
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
                    onClick={() => navigate(`/dashboard/workorder/${o.id}`)}
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
