import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import GLLSLogo from '../assets/GLLSLogo.png';
import logoBase64 from '../assets/logoBase64';
import { getStatusColor } from '../utils/statusColors';

// Constants
const SHOP_OPTIONS = [
  { value: 'All Shops', label: 'All Shops' },
  { value: 'Texas Shop', label: 'Texas Shop' },
  { value: 'Florida Shop', label: 'Florida Shop' },
  { value: 'Peotone Shop', label: 'Peotone Shop' }
];

const CLOSED_PAGE_SIZE = 10;

// Utility functions
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return isNaN(date) ? "" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

const drawRoundedRect = (doc, x, y, width, height, radius = 3) => {
  doc.roundedRect(x, y, width, height, radius, radius);
};

// Custom hooks
const useWorkOrders = (user) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!user?.token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await API.get('/workorders', { 
        headers: { Authorization: `Bearer ${user.token}` } 
      });
      setOrders(res.data);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setError('Failed to load work orders. Please refresh the page.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, loading, error, refetch: fetchOrders };
};

const useAlerts = () => {
  const [alerts, setAlerts] = useState([]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await API.get('/api/alerts');
      setAlerts(res.data || []);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
      setAlerts([]);
    }
  }, []);

  const clearAlert = useCallback(async (id) => {
    try {
      await API.delete(`/api/alerts/${id}`);
      fetchAlerts();
    } catch (err) {
      console.error('Failed to clear alert:', err);
    }
  }, [fetchAlerts]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  return { alerts, clearAlert };
};

const useShopFilter = () => {
  const [shopFilter, setShopFilter] = useState(() => 
    localStorage.getItem('defaultShopFilter') || 'All Shops'
  );

  const updateShopFilter = useCallback((newFilter) => {
    setShopFilter(newFilter);
  }, []);

  const setDefaultShop = useCallback((filter) => {
    localStorage.setItem('defaultShopFilter', filter);
    alert(`Default location set to "${filter}"!`);
  }, []);

  return { shopFilter, updateShopFilter, setDefaultShop };
};

const useSearchFilters = () => {
  const [search, setSearch] = useState("");
  const [searchBilling, setSearchBilling] = useState("");
  const [searchClosed, setSearchClosed] = useState("");
  const [closedPage, setClosedPage] = useState(1);

  const resetClosedPage = useCallback(() => setClosedPage(1), []);

  return {
    search, setSearch,
    searchBilling, setSearchBilling,
    searchClosed, setSearchClosed,
    closedPage, setClosedPage, resetClosedPage
  };
};

// PDF Generation
const generatePDF = (order) => {
  try {
    console.log("Generating PDF for work order", order.workOrderNo);

    const doc = new jsPDF({ margin: 20 });
    const leftMargin = 20;
    const rightMargin = 20;
    const topMargin = 20;
    const bottomMargin = 20;
    const pageHeight = doc.internal.pageSize.getHeight();

    let y = 20;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`Work Order #${order.workOrderNo}`, 80, y, { align: "right" });
    y += 10;
    
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 90, 10.5, 93.75, 15);
    }

    // Work Order Information
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

    // Work Description
    const estimatedWorkDescHeight = doc.splitTextToSize(order.workDescription || "", 170).length * 6 + 16;
    if (y + estimatedWorkDescHeight > pageHeight - bottomMargin) {
      doc.addPage();
      y = topMargin;
    }

    doc.setFont("helvetica", "bold");
    const workDescStartY = y + 10;
    doc.text("Work Description:", leftMargin, workDescStartY);
    doc.setFont("helvetica", "normal");
    const workDescText = doc.splitTextToSize(order.workDescription || "", 170);
    doc.text(workDescText, leftMargin, workDescStartY + 6);
    drawRoundedRect(doc, leftMargin - 5, workDescStartY - 5, 180, workDescText.length * 6 + 16, 4);
    y = workDescStartY + workDescText.length * 6 + 20;

    // Tech Summary / Notes
    const estimatedNotesHeight = doc.splitTextToSize(order.notes || "", 170).length * 6 + 16;
    if (y + estimatedNotesHeight > pageHeight - bottomMargin) {
      doc.addPage();
      y = topMargin;
    }

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
          lineWidth: 0
        },
        alternateRowStyles: {
          fillColor: [230, 230, 230]
        },
        tableWidth: doc.internal.pageSize.getWidth() - leftMargin - rightMargin,
        pageBreak: 'auto',
        headStyles: { fillColor: [0, 102, 204], textColor: 255 }
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    // Time Logs Table
    if (order.timeLogs && order.timeLogs.length > 0) {
      doc.setFont("helvetica", "bold");
      const timeLogsStartY = y;
      doc.text("Time Logs", leftMargin, timeLogsStartY);
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
          lineWidth: 0
        },
        alternateRowStyles: {
          fillColor: [230, 230, 230]
        },
        tableWidth: doc.internal.pageSize.getWidth() - leftMargin - rightMargin,
        pageBreak: 'auto',
        headStyles: { fillColor: [0, 102, 204], textColor: 255 }
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    // Signature
    if (order.customerSignature) {
      const pageHeight = doc.internal.pageSize.getHeight();
      const signatureBlockHeight = 60;

      if (y + signatureBlockHeight > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }

      const signatureStartY = y;
      doc.setFont("helvetica", "bold");
      doc.text("Customer Acknowledgement Signature:", leftMargin, signatureStartY);

      const sigImgHeight = 25;
      const sigImgWidth = 100;
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
    }

    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');

  } catch (err) {
    console.error("PDF generation failed:", err);
    alert('Failed to generate PDF. Please try again.');
  }
};

// Sub-components
const Header = ({ onLogout }) => (
  <div style={{
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    fontFamily: 'Arial, sans-serif'
  }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: 30 }}>
      <button
        onClick={onLogout}
        style={{
          background: '#ef4444',
          color: 'white',
          fontWeight: 'bold',
          padding: '6px 14px',
          fontSize: 14,
          borderRadius: 6,
          border: 'none',
          marginBottom: 10,
          cursor: 'pointer'
        }}
        aria-label="Log out of the application"
      >
        Log Out
      </button>
      <h1 style={{ margin: 0 }}>Accounting Dashboard</h1>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: 20 }}>
      <img src={GLLSLogo} alt="Company Logo" style={{ height: 100 }} />
    </div>
  </div>
);

const LocationFilter = ({ shopFilter, onShopFilterChange, onSetDefault }) => (
  <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 16, fontFamily: 'Arial, sans-serif' }}>
    <label style={{ fontWeight: 700, fontSize: 18, marginRight: 12 }} htmlFor="shop-filter">
      Location Filter:
    </label>
    <select
      id="shop-filter"
      value={shopFilter}
      onChange={e => onShopFilterChange(e.target.value)}
      style={{ fontSize: 18, padding: "6px 16px", borderRadius: 8, minWidth: 170 }}
      aria-label="Filter work orders by shop location"
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
      onClick={() => onSetDefault(shopFilter)}
      type="button"
      aria-label={`Set ${shopFilter} as default location filter`}
    >
      Set as Default
    </button>
  </div>
);

const AlertsSection = ({ alerts, onClearAlert }) => {
  if (alerts.length === 0) return null;

  return (
    <div style={{
      background: '#fef9c3', color: '#a16207', borderRadius: 8,
      margin: '18px auto', padding: '16px 24px', fontSize: 19, fontWeight: 700,
      maxWidth: 600, textAlign: 'center', border: '2px solid #facc15',
      fontFamily: 'Arial, sans-serif'
    }}>
      <ul style={{
        listStyle: 'none', margin: 0, padding: 0, display: 'flex',
        flexDirection: 'column', gap: 15
      }}>
        {alerts.map(alert => (
          <li key={alert.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fffde4', borderRadius: 6, padding: '9px 12px', marginBottom: 4, fontSize: 17
          }}>
            <span>
              Part Number <span style={{ fontWeight: 700 }}>{alert.partNumber}</span>
              {" "}marked pending for work order{" "}
              <span style={{ fontWeight: 700 }}>{alert.workOrderNo}</span>!
            </span>
            <button
              onClick={() => onClearAlert(alert.id)}
              style={{
                marginLeft: 18, background: '#fff', border: '2px solid #111',
                color: '#111', padding: '4px 12px', borderRadius: 5, fontWeight: 700,
                fontSize: 15, cursor: 'pointer', transition: 'background 0.2s'
              }}
              aria-label={`Dismiss alert for part ${alert.partNumber}`}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const SearchInput = ({ value, onChange, placeholder, "aria-label": ariaLabel }) => (
  <input
    type="text"
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    style={{
      marginBottom: 10,
      padding: 6,
      width: 400,
      fontSize: 16,
      border: "1px solid #ccc",
      borderRadius: 5,
      fontFamily: 'Arial, sans-serif'
    }}
    aria-label={ariaLabel}
  />
);

const WorkOrderTable = ({ 
  orders, 
  onViewEdit, 
  onRework, 
  onCloseWorkOrder, 
  onViewPDF,
  showStatus = true,
  showActions = true,
  emptyMessage = "No work orders found."
}) => (
  <div className="manager-table-wrapper" style={{ overflowX: 'auto', fontFamily: 'Arial, sans-serif' }}>
    <table className='manager-table' style={{ minWidth: 900, marginBottom: 40 }}>
      <thead>
        <tr>
          <th>Work Order Number</th>
          <th>Date Assigned</th>
          <th>Technician Username</th>
          <th>Company Name</th>
          <th>Shop</th>
          {showStatus && <th>Status</th>}
          {showActions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 && (
          <tr>
            <td colSpan={showStatus && showActions ? 7 : 6} style={{ textAlign: 'center' }}>
              {emptyMessage}
            </td>
          </tr>
        )}
        {orders.map(order => (
          <tr key={order.workOrderNo}>
            <td>{order.workOrderNo}</td>
            <td>
              {order.date
                ? new Date(order.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  })
                : ''}
            </td>
            <td>{order.timeLogs?.[0]?.technicianAssigned || ''}</td>
            <td>{order.companyName}</td>
            <td>{order.shop}</td>
            {showStatus && (
              <td style={{ fontWeight: 600 }}>
                <span style={{
                  display: "inline-block",
                  padding: "2px 10px",
                  borderRadius: "12px",
                  fontSize: "13px",
                  background: getStatusColor(order.status || 'Assigned'),
                  color: "#fff"
                }}>
                  {order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Assigned'}
                </span>
              </td>
            )}
            {showActions && (
              <td>
                <button
                  onClick={() => onViewEdit(order.workOrderNo)}
                  style={{ 
                    padding: '4px 10px', 
                    background: '#64748b', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: 4, 
                    marginRight: 4, 
                    cursor: 'pointer' 
                  }}
                  aria-label={`View and edit work order ${order.workOrderNo}`}
                >
                  View / Edit
                </button>
                {onRework && (
                  <button
                    onClick={() => onRework(order)}
                    style={{ 
                      padding: '4px 10px', 
                      background: '#eed812', 
                      color: '#222', 
                      border: 'none', 
                      borderRadius: 4, 
                      marginRight: 4, 
                      cursor: 'pointer' 
                    }}
                    aria-label={`Send work order ${order.workOrderNo} back for rework`}
                  >
                    Rework
                  </button>
                )}
                {onCloseWorkOrder && (
                  <button
                    onClick={() => onCloseWorkOrder(order)}
                    style={{
                      padding: '4px 10px',
                      background: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      marginLeft: 0,
                      whiteSpace: 'nowrap',
                      minWidth: 135,
                      cursor: 'pointer'
                    }}
                    title="Close this work order"
                    aria-label={`Close work order ${order.workOrderNo}`}
                  >
                    Close Work Order
                  </button>
                )}
                {onViewPDF && (
                  <button
                    onClick={() => onViewPDF(order)}
                    style={{ 
                      padding: '4px 12px', 
                      background: 'white', 
                      color: '#2563eb', 
                      border: '1px solid #2563eb', 
                      borderRadius: 4, 
                      cursor: 'pointer' 
                    }}
                    aria-label={`View PDF for work order ${order.workOrderNo}`}
                  >
                    View PDF
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Pagination = ({ currentPage, totalPages, onPageChange }) => (
  <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 16 }}>
    <button
      onClick={() => onPageChange(currentPage - 1)}
      disabled={currentPage === 1}
      style={{
        padding: '6px 12px',
        background: currentPage === 1 ? '#e5e7eb' : '#2563eb',
        color: currentPage === 1 ? '#888' : 'white',
        border: 'none',
        borderRadius: 6,
        cursor: currentPage === 1 ? 'default' : 'pointer'
      }}
      aria-label="Go to previous page"
    >
      Previous
    </button>

    <span style={{ alignSelf: 'center', fontSize: 14 }}>
      Page {currentPage} of {totalPages}
    </span>

    <button
      onClick={() => onPageChange(currentPage + 1)}
      disabled={currentPage >= totalPages}
      style={{
        padding: '6px 12px',
        background: currentPage >= totalPages ? '#e5e7eb' : '#2563eb',
        color: currentPage >= totalPages ? '#888' : 'white',
        border: 'none',
        borderRadius: 6,
        cursor: currentPage >= totalPages ? 'default' : 'pointer'
      }}
      aria-label="Go to next page"
    >
      Next
    </button>
  </div>
);

const SectionHeader = ({ title }) => (
  <h2 style={{ fontFamily: 'Arial, sans-serif' }}>
    {title}
  </h2>
);

// Main component
export default function AccountingDashboard({ user }) {
  const navigate = useNavigate();
  
  // Defensive: handle loading state to prevent crash
  if (!user || !user.token) {
    return <div>Loading dashboard...</div>;
  }

  // Custom hooks
  const { orders, loading, error, refetch } = useWorkOrders(user);
  const { alerts, clearAlert } = useAlerts();
  const { shopFilter, updateShopFilter, setDefaultShop } = useShopFilter();
  const { 
    search, setSearch, 
    searchBilling, setSearchBilling, 
    searchClosed, setSearchClosed, 
    closedPage, setClosedPage, resetClosedPage 
  } = useSearchFilters();

  // Memoized filtered orders
  const filteredOrders = useMemo(() => 
    shopFilter === 'All Shops' 
      ? orders 
      : orders.filter(order => order.shop === shopFilter),
    [orders, shopFilter]
  );

  // Memoized order categories
  const orderCategories = useMemo(() => {
    const submittedForBilling = filteredOrders.filter(
      o => o.status && o.status.toLowerCase() === 'submitted for billing'
    );

    const closed = filteredOrders.filter(
      o => o.status && o.status.toLowerCase() === 'closed'
    );

    const regular = filteredOrders.filter(
      o => !o.status || (
        o.status.toLowerCase() !== 'pending review' &&
        o.status.toLowerCase() !== 'pending approval' &&
        o.status.toLowerCase() !== 'submitted for billing' &&
        o.status.toLowerCase() !== 'closed'
      )
    );

    return { submittedForBilling, closed, regular };
  }, [filteredOrders]);

  // Memoized search filters
  const searchFilter = useCallback((order, searchTerm) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (order.companyName && order.companyName.toLowerCase().includes(searchLower)) ||
      (order.workOrderNo && order.workOrderNo.toString().includes(searchTerm)) ||
      (order.date && order.date.includes(searchTerm)) ||
      (order.serialNumber && order.serialNumber.toLowerCase().includes(searchLower)) ||
      (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(searchLower))
    );
  }, []);

  const filteredSubmittedForBilling = useMemo(() => 
    orderCategories.submittedForBilling.filter(order => searchFilter(order, searchBilling)),
    [orderCategories.submittedForBilling, searchFilter, searchBilling]
  );

  const filteredActiveWorkOrders = useMemo(() => 
    orderCategories.regular.filter(order => searchFilter(order, search)),
    [orderCategories.regular, searchFilter, search]
  );

  const filteredClosedOrders = useMemo(() => 
    orderCategories.closed.filter(order => searchFilter(order, searchClosed)),
    [orderCategories.closed, searchFilter, searchClosed]
  );

  // Event handlers
  const handleLogout = useCallback(() => {
    window.location.href = '/login';
  }, []);

  const handleViewEdit = useCallback((workOrderNo) => {
    navigate(`/dashboard/workorder/${workOrderNo}`);
  }, [navigate]);

  const handleRework = useCallback(async (order) => {
    try {
      await API.put(`/workorders/${order.workOrderNo}`, {
        ...order,
        status: 'Completed, Pending Approval'
      });
      alert('Sent back to manager for rework!');
      refetch();
    } catch (err) {
      alert('Failed to reassign for rework.');
      console.error(err);
    }
  }, [refetch]);

  const handleCloseWorkOrder = useCallback(async (order) => {
    if (!window.confirm("Are you sure you want to close this work order? This will write it to Google Sheets.")) return;
    try {
      await API.put(`/workorders/close/${order.id}`);
      alert("Work order closed!");
      refetch();
    } catch (err) {
      alert(
        err?.response?.data?.error ||
        "Failed to close work order. Make sure this work order is ready for close."
      );
      console.error(err);
    }
  }, [refetch]);

  const handleViewPDF = useCallback((order) => {
    generatePDF(order);
  }, []);

  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value);
    resetClosedPage();
  }, [setSearch, resetClosedPage]);

  const handleSearchBillingChange = useCallback((e) => {
    setSearchBilling(e.target.value);
    resetClosedPage();
  }, [setSearchBilling, resetClosedPage]);

  const handleSearchClosedChange = useCallback((e) => {
    setSearchClosed(e.target.value);
    resetClosedPage();
  }, [setSearchClosed, resetClosedPage]);

  // Loading and error states
  if (loading) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: '18px'
      }}>
        Loading work orders...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        color: '#ef4444'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <Header onLogout={handleLogout} />
      
      <LocationFilter 
        shopFilter={shopFilter}
        onShopFilterChange={updateShopFilter}
        onSetDefault={setDefaultShop}
      />

      <AlertsSection 
        alerts={alerts}
        onClearAlert={clearAlert}
      />

      {/* Submitted for Billing Table */}
      <SectionHeader title="Submitted for Billing (To Close)" />
      <SearchInput
        value={searchBilling}
        onChange={handleSearchBillingChange}
        placeholder="Search by company, order #, serial #, tech, or date..."
        aria-label="Search submitted for billing work orders"
      />
      <WorkOrderTable
        orders={filteredSubmittedForBilling}
        onViewEdit={handleViewEdit}
        onRework={handleRework}
        onCloseWorkOrder={handleCloseWorkOrder}
        onViewPDF={handleViewPDF}
        emptyMessage="There are no work orders submitted for billing."
      />

      {/* Active Work Orders */}
      <SectionHeader title="Active Work Orders" />
      <SearchInput
        value={search}
        onChange={handleSearchChange}
        placeholder="Search by company, order #, serial #, tech, or date..."
        aria-label="Search active work orders"
      />
      <WorkOrderTable
        orders={filteredActiveWorkOrders}
        onViewEdit={handleViewEdit}
        onViewPDF={handleViewPDF}
        emptyMessage="No active work orders."
      />

      {/* Closed Work Orders Archive */}
      <SectionHeader title="Closed Work Orders Archive" />
      <SearchInput
        value={searchClosed}
        onChange={handleSearchClosedChange}
        placeholder="Search by company, order #, serial #, tech, or date..."
        aria-label="Search closed work orders"
      />
      <WorkOrderTable
        orders={filteredClosedOrders.slice((closedPage - 1) * CLOSED_PAGE_SIZE, closedPage * CLOSED_PAGE_SIZE)}
        onViewEdit={handleViewEdit}
        onViewPDF={handleViewPDF}
        emptyMessage="No closed work orders found."
      />
      
      {filteredClosedOrders.length > CLOSED_PAGE_SIZE && (
        <Pagination
          currentPage={closedPage}
          totalPages={Math.ceil(filteredClosedOrders.length / CLOSED_PAGE_SIZE)}
          onPageChange={setClosedPage}
        />
      )}
    </div>
  );
}
