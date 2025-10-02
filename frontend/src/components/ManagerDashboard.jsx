import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import API from '../api';
import WorkOrderCompletionStatus from './WorkOrderCompletionStatus';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import GLLSLogo from '../assets/GLLSLogo.png';
import logoBase64 from '../assets/logoBase64';
import { getStatusColor } from '../utils/statusColors';
import NotificationBell from './NotificationBell';
import DeleteWorkOrderModal from './DeleteWorkOrderModal';
import { workOrderWS, useWebSocket, persistentWSManager } from '../utils/websocket';

// Add responsive styles for mobile
const mobileStyles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  
  @media (max-width: 768px) {
    .manager-table-wrapper {
      margin-left: 15px !important;
      margin-right: 15px !important;
    }
    
    .manager-table {
      font-size: 12px !important;
    }
    
    .manager-table th,
    .manager-table td {
      padding: 8px 4px !important;
      white-space: nowrap;
    }
    
    .manager-table th:first-child,
    .manager-table td:first-child {
      position: sticky;
      left: 0;
      background: white;
      z-index: 1;
    }
    
    .header-container {
      flex-direction: column !important;
      align-items: center !important;
      text-align: center !important;
    }
    
    .header-left {
      align-items: center !important;
      margin-left: 0 !important;
      margin-bottom: 20px !important;
    }
    
    .header-right {
      align-items: center !important;
      margin-right: 0 !important;
    }
    
    .assign-button {
      margin-right: 0 !important;
      margin-left: 0 !important;
    }
    
    .button-group {
      justify-content: center !important;
      width: 100% !important;
      flex-wrap: nowrap !important;
    }
  }
  
  @media (max-width: 480px) {
    .manager-table-wrapper {
      margin-left: 10px !important;
      margin-right: 10px !important;
    }
    
    .manager-table {
      font-size: 11px !important;
    }
    
    .manager-table th,
    .manager-table td {
      padding: 6px 3px !important;
    }
  }
`;

// Constants
const SHOP_OPTIONS = [
  { value: 'All Shops', label: 'All Shops' },
  { value: 'Texas Shop', label: 'Texas Shop' },
  { value: 'Florida Shop', label: 'Florida Shop' },
  { value: 'Peotone Shop', label: 'Peotone Shop' }
];

const CLOSED_PAGE_SIZE = 10;

// Utility functions
const isPartBlank = (part) => {
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
};

const canCloseWorkOrder = (wo) => {
  if (
    !wo.status ||
    !(
      wo.status.toLowerCase().includes("pending review") ||
      wo.status.toLowerCase().includes("pending approval")
    )
  ) return false;
  
  if (!Array.isArray(wo.parts) || wo.parts.length === 0) return true;
  return wo.parts.every(isPartBlank);
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return isNaN(date) ? "" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

const drawRoundedRect = (doc, x, y, width, height, radius = 3) => {
  doc.roundedRect(x, y, width, height, radius, radius);
};

// Global search functionality
const useGlobalSearch = () => {
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const performGlobalSearch = useCallback((orders, searchTerm) => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    const results = orders.filter(order => {
      return (
        (order.companyName && order.companyName.toLowerCase().includes(searchLower)) ||
        (order.workOrderNo && order.workOrderNo.toString().includes(searchTerm)) ||
        (order.date && order.date.includes(searchTerm)) ||
        (order.serialNumber && order.serialNumber.toLowerCase().includes(searchLower)) ||
        (order.timeLogs?.[0]?.technicianAssigned && order.timeLogs[0].technicianAssigned.toLowerCase().includes(searchLower)) ||
        (order.workDescription && order.workDescription.toLowerCase().includes(searchLower)) ||
        (order.notes && order.notes.toLowerCase().includes(searchLower)) ||
        (order.make && order.make.toLowerCase().includes(searchLower)) ||
        (order.model && order.model.toLowerCase().includes(searchLower)) ||
        (order.repairType && order.repairType.toLowerCase().includes(searchLower)) ||
        (order.shop && order.shop.toLowerCase().includes(searchLower)) ||
        (order.status && order.status.toLowerCase().includes(searchLower))
      );
    });

    setSearchResults(results);
    setShowSearchResults(true);
  }, []);

  const handleGlobalSearch = useCallback((searchTerm) => {
    setGlobalSearchTerm(searchTerm);
    // Don't perform search on every keystroke - only when explicitly triggered
  }, []);

  const clearGlobalSearch = useCallback(() => {
    setGlobalSearchTerm('');
    setShowSearchResults(false);
    setSearchResults([]);
  }, []);

  return {
    globalSearchTerm,
    showSearchResults,
    searchResults,
    searchLoading,
    setSearchLoading,
    handleGlobalSearch,
    clearGlobalSearch,
    performGlobalSearch
  };
};

// Custom hooks
const useWorkOrders = (user) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeUsers, setActiveUsers] = useState({}); // Track users actively working on work orders

  const fetchOrders = useCallback(async () => {
    if (!user?.token) return;
    
    console.log('ManagerDashboard: fetchOrders called - fetching fresh work orders data');
    setLoading(true);
    setError(null);
    
    try {
      // Add cache-busting parameter to ensure fresh data
      const timestamp = Date.now();
      const res = await API.get(`/workorders?_t=${timestamp}`, { 
        headers: { Authorization: `Bearer ${user.token}` } 
      });
      console.log('ManagerDashboard: Received work orders data:', res.data.length, 'orders');
      setOrders(res.data);
      // Store all orders globally for search functionality
      window.allWorkOrders = res.data;
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

  return { orders, loading, error, refetch: fetchOrders, activeUsers, setActiveUsers };
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
  const [closedSearch, setClosedSearch] = useState("");
  const [closedPage, setClosedPage] = useState(1);

  const resetClosedPage = useCallback(() => setClosedPage(1), []);

  return {
    search, setSearch,
    closedSearch, setClosedSearch,
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
      ["Company Address", `${order.companyName}, ${order.companyStreet}, ${order.companyCity}, ${order.companyState} ${order.companyZip}`],
      ["Contact", `${order.contactName || ""} (${order.contactPhone || ""})`],
      ["Contact Email", order.contactEmail || ""],
      ["PO Number", order.poNumber || ""],
      ["Make / Model / Serial", `${order.make} / ${order.model} / ${order.serialNumber}`],
      ["Work Type", [
        order.vendorWarranty ? "Vendor Warranty" : "",
        order.billable ? "Billable" : "",
        order.maintenance ? "Maintenance" : "",
        order.nonBillableRepair ? "Non-billable Repair" : ""
      ].filter(Boolean).join(", ")],
      ["Shipping Cost", order.shippingCost || ""],
      ["Shipping Comments", order.shippingComments || ""]
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
      // Filter out empty parts and ensure unique entries
      const validParts = order.parts.filter(p => {
        const partNumber = (p.partNumber || p.part_number || '').trim();
        const description = (p.description || '').trim();
        const quantity = Number(p.quantity || 0);
        return partNumber || description || quantity !== 0;
      });

      // Remove duplicates based on part number and description
      const uniqueParts = validParts.filter((part, index, self) => {
        const partKey = `${(part.partNumber || part.part_number || '').trim()}-${(part.description || '').trim()}`;
        return index === self.findIndex(p => 
          `${(p.partNumber || p.part_number || '').trim()}-${(p.description || '').trim()}` === partKey
        );
      });

      console.log(`PDF Generation: Original parts count: ${order.parts.length}, Valid parts: ${validParts.length}, Unique parts: ${uniqueParts.length}`);

      if (uniqueParts.length > 0) {
        doc.setFont("helvetica", "bold");
        const partsStartY = y;
        doc.text("Parts Used", leftMargin, partsStartY);
        y += 6;

        doc.autoTable({
          startY: y,
          head: [["Part #", "Description", "Qty"]],
          body: uniqueParts.map(p => [
            p.partNumber || p.part_number || "", 
            p.description || "", 
            p.quantity || ""
          ]),
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
    }

    // Time Logs Table
    if (order.timeLogs && order.timeLogs.length > 0) {
      doc.setFont("helvetica", "bold");
      const timeLogsStartY = y;
      doc.text("Time Logs", leftMargin, timeLogsStartY);
      y += 6;

      // Store the starting Y position for the rectangle
      const timeLogsTableStartY = y;

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
        headStyles: { fillColor: [0, 102, 204], textColor: 255 },
        didDrawPage: function(data) {
          // Draw rectangle around time logs table on each page it appears
          const currentPage = doc.getCurrentPageInfo().pageNumber;
          
          // Only draw rectangle if this is the first page of the time logs table
          if (currentPage === Math.floor(timeLogsTableStartY / pageHeight) + 1) {
            const rectHeight = Math.min(pageHeight - timeLogsTableStartY - 20, data.cursor.y - timeLogsTableStartY + 10);
            drawRoundedRect(doc, leftMargin - 5, timeLogsTableStartY - 5, 180, rectHeight, 4);
          }
        }
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
const Header = ({ onAssignNewWorkOrder, onLogout, onRefresh, user, wsConnected }) => (
  <div className="header-container" style={{
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    fontFamily: 'Arial, sans-serif',
    flexWrap: 'wrap',
    gap: '10px'
  }}>
    <div className="header-left" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'flex-start', 
      marginLeft: 30,
      flex: '1 1 auto',
      minWidth: '200px'
    }}>
      <div className="button-group" style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: 10,
        marginTop: 10,
        flexWrap: 'nowrap'
      }}>
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
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
          aria-label="Log out of the application"
        >
          Log Out
        </button>
        <button
          onClick={onRefresh}
          style={{
            background: '#2563eb',
            color: 'white',
            fontWeight: 'bold',
            padding: '6px 14px',
            fontSize: 14,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
          aria-label="Refresh dashboard data"
        >
          Refresh
        </button>
      </div>
      
                           <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          width: '100%', 
          margin: '0 auto 20px auto'
        }}>
                    <h1 style={{ 
             textAlign: 'left', 
             marginTop: '50px', 
             fontFamily: 'Arial, sans-serif',
             fontSize: 'clamp(40px, 4vw, 24px)',
             whiteSpace: 'nowrap'
           }}>
             Manager Dashboard
           </h1>
           {/* WebSocket connection status */}
           <div style={{ 
             display: 'flex', 
             alignItems: 'center', 
             marginTop: '10px',
             gap: '8px'
           }}>
             <div style={{
               width: '8px',
               height: '8px',
               borderRadius: '50%',
               backgroundColor: wsConnected ? '#10B981' : '#EF4444',
               animation: wsConnected ? 'pulse 2s infinite' : 'none'
             }}></div>
             <span style={{ 
               color: 'white', 
               fontSize: '14px',
               fontWeight: '500'
             }}>
               {wsConnected ? 'Live Updates' : 'Offline'}
             </span>
           </div>
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', marginTop: '25px', justifyContent: 'center', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
             <span style={{ fontSize: '20px', fontWeight: 'bold' }}>Notifications</span>
             <NotificationBell user={user}/>
           </div>
        </div>
      

    </div>

    <div className="header-right" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'stretch',
      flex: '0 1 auto'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '10px',
        marginTop: '10px'
      }}>
        <img 
          src={GLLSLogo} 
          alt="Company Logo" 
          className="login-logo" 
          style={{
            height: 'auto',
            maxHeight:'85px',
            width: 'auto',
            maxWidth: '500px'
          }}
        />
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        gap: '16px',
        marginBottom: '10px',
        fontSize: '20px',
        fontWeight: 'bold',
        width: '100%'
      }}>

        <button
          className="assign-button"
          style={{
            background: '#2563eb',
            color: 'white',
            fontWeight: 'bold',
            fontSize: 'clamp(14px, 3vw, 18px)',
            padding: '10px 28px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            marginBottom: 0,
            marginRight: 30,
            whiteSpace: 'nowrap'
          }}
          onClick={onAssignNewWorkOrder}
          aria-label="Create a new work order"
        >
          Assign New Work Order
        </button>
      </div>
    </div>
  </div>
);

const LocationFilter = ({ shopFilter, onShopFilterChange, onSetDefault, globalSearchTerm, onGlobalSearchChange, onGlobalSearchSubmit, searchLoading }) => (
  <div style={{ 
    marginBottom: 28, 
    marginLeft: 30, 
    marginRight: 30,
    position: 'relative',
    display: "flex", 
    flexDirection: 'column',
    gap: 16, 
    fontFamily: 'Arial, sans-serif' 
  }}>
    {/* Top row for location filter */}
    <div style={{
      display: "flex", 
      alignItems: "center", 
      gap: 16,
      flexWrap: 'wrap'
    }}>
      <label style={{ 
        fontWeight: 700, 
        fontSize: 'clamp(14px, 3vw, 18px)', 
        marginRight: 12,
        whiteSpace: 'nowrap'
      }} htmlFor="shop-filter">
        Location Filter:
      </label>
      <select
        id="shop-filter"
        value={shopFilter}
        onChange={e => onShopFilterChange(e.target.value)}
        style={{ 
          fontSize: 'clamp(14px, 3vw, 18px)', 
          padding: "6px 16px", 
          borderRadius: 8, 
          minWidth: 170,
          maxWidth: '200px'
        }}
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
          border: "1px solid #f4f3f2",
          cursor: "pointer",
          whiteSpace: 'nowrap'
        }}
        onClick={() => onSetDefault(shopFilter)}
        type="button"
        aria-label={`Set ${shopFilter} as default location filter`}
      >
        Set as Default
      </button>
    </div>
    
    {/* Global Search Bar */}
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 8,
      width: '100%',
      maxWidth: '600px'
    }}>
      <input
        type="text"
        placeholder="Search all work orders..."
        value={globalSearchTerm}
        onChange={onGlobalSearchChange}
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            onGlobalSearchSubmit();
          }
        }}
        style={{
          padding: "8px 16px",
          fontSize: 16,
          border: "2px solid #e5e7eb",
          borderRadius: 8,
          flex: 1,
          minWidth: 200,
          fontFamily: 'Arial, sans-serif',
        }}
        aria-label="Search all work orders"
      />
      <button
        onClick={onGlobalSearchSubmit}
        disabled={searchLoading}
        style={{
          padding: "8px 16px",
          background: searchLoading ? "#9ca3af" : "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          cursor: searchLoading ? "not-allowed" : "pointer",
          fontSize: 16,
          whiteSpace: 'nowrap'
        }}
        aria-label="Search work orders"
      >
        {searchLoading ? (
          <div style={{
            display: 'inline-block',
            width: '16px',
            height: '16px',
            border: '2px solid #ffffff',
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
        ) : (
          'Search'
        )}
      </button>
    </div>
  </div>
);

const SearchInput = ({ value, onChange, placeholder, "aria-label": ariaLabel }) => (
  <input
    type="text"
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    style={{
      marginBottom: 10,
      padding: 6,
      width: 'calc(100% - 60px)',
      maxWidth: 400,
      fontSize: 16,
      border: "1px solid #ccc",
      borderRadius: 5,
      fontFamily: 'Arial, sans-serif',
      marginLeft: 30,
      marginRight: 30,
    }}
    aria-label={ariaLabel}
  />
);

const WorkOrderTable = ({ 
  orders, 
  onViewEdit, 
  onRework, 
  onSubmitForBilling, 
  onCloseWorkOrder, 
  onViewPDF,
  onDelete,
  onDuplicate,
  showStatus = true,
  showActions = true,
  emptyMessage = "No work orders found.",
  activeUsers = {}
}) => {
  const [hoveredOrderId, setHoveredOrderId] = useState(null);
  
  // Debug log to ensure activeUsers is available
  console.log('WorkOrderTable: activeUsers prop:', activeUsers);

  return (
  <div className="manager-table-wrapper" style={{ 
    overflowX: 'auto', 
    fontFamily: 'Arial, sans-serif', 
    marginLeft: 30, 
    marginRight: 30,
    WebkitOverflowScrolling: 'touch',
    border: '1px solid #e5e7eb',
    borderRadius: '8px'
  }}>
    <table className='manager-table' style={{ 
      minWidth: 900, 
      marginBottom: 40,
      fontSize: 'clamp(12px, 2.5vw, 14px)',
      width: '100%',
      borderCollapse: 'collapse'
    }}>
      <thead>
        <tr>
          <th>Work Order Number
          </th>
          <th>Date Assigned</th>
          <th>Technician Username</th>
          <th>Company Name</th>
          <th>Make / Model / Serial #</th>
          <th>Shop</th>
          {showStatus && <th>Status</th>}
          {showActions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 && (
          <tr>
            <td colSpan={showStatus && showActions ? 8 : 7} style={{ textAlign: 'center' }}>
              {emptyMessage}
            </td>
          </tr>
        )}
        {orders.map(order => (
          <tr key={order.workOrderNo} style={(order.shop || '').toLowerCase().includes('shop repair') ? { background: '#fff7cc' } : undefined}>
            <td>
              {onDelete && (
                <span
                  onClick={() => onDelete(order.workOrderNo)}
                  style={{ 
                    display: 'inline-block',
                    width: '16px',
                    height: '16px',
                    background: '#ef4444', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '50%', 
                    marginRight: '8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    lineHeight: '16px',
                    verticalAlign: 'middle'
                  }}
                  title={`Delete work order ${order.workOrderNo}`}
                  aria-label={`Delete work order ${order.workOrderNo}`}
                >
                  ×
                </span>
              )}
              <WorkOrderCompletionStatus workOrder={order} />
              {/* Real-time user activity indicator */}
              {activeUsers && activeUsers[order.workOrderNo] && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginLeft: '8px',
                  padding: '2px 6px',
                  background: '#10b981',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '500'
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    background: '#fff',
                    borderRadius: '50%',
                    marginRight: '4px',
                    animation: 'pulse 2s infinite'
                  }} />
                  {activeUsers[order.workOrderNo].userName} ({activeUsers[order.workOrderNo].userRole})
                </div>
              )}
            </td>
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
            <td>{`${order.make || ''} / ${order.model || ''} / ${order.serialNumber || ''}`}</td>
            <td>{order.shop}</td>
            {showStatus && (
              <td style={{ fontWeight: 600 }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span 
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      borderRadius: "12px",
                      fontSize: "13px",
                      background: getStatusColor(order.status || 'Assigned'),
                      color: "#fff",
                      cursor: order.status && order.status.toLowerCase().includes('pending parts') ? 'help' : 'default'
                    }}
                    onMouseEnter={() => {
                      if (order.status && order.status.toLowerCase().includes('pending parts')) {
                        setHoveredOrderId(order.workOrderNo);
                      }
                    }}
                    onMouseLeave={() => setHoveredOrderId(null)}
                  >
                    {order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Assigned'}
                  </span>
                  {order.status && order.status.toLowerCase().includes('pending parts') && hoveredOrderId === order.workOrderNo && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: '#1f2937',
                      color: 'white',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      zIndex: 1000,
                      marginBottom: '5px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      pointerEvents: 'none'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Pending Parts:</div>
                      {order.parts && order.parts.length > 0 ? (
                        (() => {
                          const pendingParts = order.parts.filter(part => 
                            part && 
                            part.waiting === true && 
                            (part.partNumber || part.description || part.quantity)
                          );
                          
                          if (pendingParts.length === 0) {
                            return <div style={{ fontSize: '11px', fontStyle: 'italic' }}>No parts currently pending</div>;
                          }
                          
                          return pendingParts.map((part, index) => (
                            <div key={index} style={{ fontSize: '11px', marginBottom: '2px' }}>
                              {part.partNumber && `${part.partNumber} - `}
                              {part.description || 'No description'}
                              {part.quantity && ` (Qty: ${part.quantity})`}
                              {part.estimatedDeliveryDate && (
                                <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '1px' }}>
                                  Est. Delivery: {part.estimatedDeliveryDate}
                                </div>
                              )}
                            </div>
                          ));
                        })()
                      ) : (
                        <div style={{ fontSize: '11px', fontStyle: 'italic' }}>No parts data available</div>
                      )}
                    </div>
                  )}
                </div>
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
                {onSubmitForBilling && (
                  <button
                    onClick={() => onSubmitForBilling(order)}
                    style={{ 
                      padding: '4px 10px', 
                      background: '#16a34a', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: 4, 
                      cursor: 'pointer' 
                    }}
                    aria-label={`Submit work order ${order.workOrderNo} for billing`}
                  >
                    Submit for Billing
                  </button>
                )}
                {onCloseWorkOrder && canCloseWorkOrder(order) && (
                  <button
                    onClick={() => onCloseWorkOrder(order)}
                    style={{
                      padding: '4px 10px',
                      background: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      marginLeft: 0,
                      cursor: 'pointer'
                    }}
                    title="Close this work order (only if no parts present)"
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
                {onDuplicate && (
                  <button
                    onClick={() => onDuplicate(order)}
                    style={{ 
                      padding: '4px 10px', 
                      background: '#8b5cf6', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: 4, 
                      marginLeft: 4, 
                      cursor: 'pointer' 
                    }}
                    aria-label={`Duplicate work order ${order.workOrderNo}`}
                  >
                    Duplicate
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
};

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

const SectionHeader = ({ title, count, highlight = false }) => (
  <h2 style={{
    color: highlight && count > 0 ? '#8b5cf6' : 'inherit',
    backgroundColor: highlight && count > 0 ? '#f3e8ff' : 'transparent',
    padding: highlight && count > 0 ? '6px 12px' : undefined,
    borderRadius: highlight && count > 0 ? 6 : undefined,
    textAlign: 'center',
    fontFamily: 'Arial, sans-serif',
    marginTop: 32,
    marginLeft: 30,
    marginRight: 30,
    fontSize: 'clamp(18px, 4vw, 22px)'
  }}>
    {title}
  </h2>
);

const SearchResultsPage = ({ searchTerm, results, onViewEdit, onViewPDF, onDuplicate, onBackToDashboard }) => {
  const highlightText = (text, searchTerm) => {
    if (!text || !searchTerm) return text;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.toString().replace(regex, '<mark style="background-color: yellow; padding: 1px 2px;">$1</mark>');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '30px',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '20px'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#1f2937' }}>
            Search Results for "{searchTerm}"
          </h1>
          <p style={{ margin: '8px 0 0 0', color: '#6b7280', fontSize: '16px' }}>
            Found {results.length} work order{results.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onBackToDashboard}
          style={{
            padding: '8px 16px',
            background: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      {/* Search Results */}
      {results.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px 20px',
          color: '#6b7280'
        }}>
          <h3 style={{ marginBottom: '10px' }}>No results found</h3>
          <p>Try searching with different keywords or check your spelling.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {results.map((order, index) => (
            <div
              key={order.workOrderNo}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '20px',
                backgroundColor: 'white',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                transition: 'box-shadow 0.2s',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
              }}
            >
              {/* Result Header */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: '12px'
              }}>
                <div>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '18px', 
                    color: '#2563eb',
                    fontWeight: '600'
                  }}>
                    <span dangerouslySetInnerHTML={{ 
                      __html: highlightText(order.workOrderNo, searchTerm) 
                    }} />
                  </h3>
                  <p style={{ 
                    margin: '4px 0 0 0', 
                    color: '#6b7280', 
                    fontSize: '14px' 
                  }}>
                    <span dangerouslySetInnerHTML={{ 
                      __html: highlightText(order.companyName, searchTerm) 
                    }} />
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => onViewEdit(order.workOrderNo)}
                    style={{
                      padding: '6px 12px',
                      background: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    View/Edit
                  </button>
                  <button
                    onClick={() => onViewPDF(order)}
                    style={{
                      padding: '6px 12px',
                      background: 'white',
                      color: '#2563eb',
                      border: '1px solid #2563eb',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    PDF
                  </button>
                  {onDuplicate && (
                    <button
                      onClick={() => onDuplicate(order)}
                      style={{
                        padding: '6px 12px',
                        background: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Duplicate
                    </button>
                  )}
                </div>
              </div>

              {/* Result Details */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                fontSize: '14px'
              }}>
                <div>
                  <strong>Date:</strong> 
                  <span dangerouslySetInnerHTML={{ 
                    __html: highlightText(formatDate(order.date), searchTerm) 
                  }} />
                </div>
                <div>
                  <strong>Technician:</strong> 
                  <span dangerouslySetInnerHTML={{ 
                    __html: highlightText(order.timeLogs?.[0]?.technicianAssigned || '', searchTerm) 
                  }} />
                </div>
                <div>
                  <strong>Shop:</strong> 
                  <span dangerouslySetInnerHTML={{ 
                    __html: highlightText(order.shop, searchTerm) 
                  }} />
                </div>
                <div>
                  <strong>Status:</strong> 
                  <span style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    background: getStatusColor(order.status || 'Assigned'),
                    color: "#fff",
                    marginLeft: '4px'
                  }}>
                    {order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Assigned'}
                  </span>
                </div>
                <div>
                  <strong>Serial #:</strong> 
                  <span dangerouslySetInnerHTML={{ 
                    __html: highlightText(order.serialNumber, searchTerm) 
                  }} />
                </div>
                <div>
                  <strong>Make/Model:</strong> 
                  <span dangerouslySetInnerHTML={{ 
                    __html: highlightText(`${order.make} / ${order.model}`, searchTerm) 
                  }} />
                </div>
              </div>

              {/* Work Description Preview */}
              {order.workDescription && (
                <div style={{ marginTop: '12px' }}>
                  <strong>Work Description:</strong>
                  <p style={{ 
                    margin: '4px 0 0 0', 
                    color: '#374151',
                    lineHeight: '1.4',
                    fontSize: '13px'
                  }}>
                    <span dangerouslySetInnerHTML={{ 
                      __html: highlightText(
                        order.workDescription.length > 200 
                          ? order.workDescription.substring(0, 200) + '...' 
                          : order.workDescription, 
                        searchTerm
                      ) 
                    }} />
                  </p>
                </div>
              )}

              {/* Notes Preview */}
              {order.notes && (
                <div style={{ marginTop: '8px' }}>
                  <strong>Notes:</strong>
                  <p style={{ 
                    margin: '4px 0 0 0', 
                    color: '#374151',
                    lineHeight: '1.4',
                    fontSize: '13px'
                  }}>
                    <span dangerouslySetInnerHTML={{ 
                      __html: highlightText(
                        order.notes.length > 150 
                          ? order.notes.substring(0, 150) + '...' 
                          : order.notes, 
                        searchTerm
                      ) 
                    }} />
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Main component
export default function ManagerDashboard({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Add CSS animation for pulse effect
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  
  // Defensive: handle loading state to prevent crash
  if (!user || !user.token) {
    return <div>Loading dashboard...</div>;
  }

  // WebSocket hooks
  const { connectionStatus } = useWebSocket(user.token);
  const [wsConnected, setWsConnected] = useState(false);

  // Update WebSocket connection status
  useEffect(() => {
    setWsConnected(connectionStatus.connected);
  }, [connectionStatus.connected]);

  // Custom hooks
  const { orders, loading, error, refetch, activeUsers, setActiveUsers } = useWorkOrders(user);
  const { shopFilter, updateShopFilter, setDefaultShop } = useShopFilter();
  const { search, setSearch, closedSearch, setClosedSearch, closedPage, setClosedPage, resetClosedPage } = useSearchFilters();
  const { globalSearchTerm, showSearchResults, searchResults, searchLoading, setSearchLoading, handleGlobalSearch, clearGlobalSearch, performGlobalSearch } = useGlobalSearch();

  // WebSocket event listeners
  useEffect(() => {
    console.log('ManagerDashboard: Setting up WebSocket listeners, user:', !!user?.token, 'refetch:', !!refetch);
    if (user?.token && refetch) {
      // Register the refetch function with the persistent manager
      persistentWSManager.registerManagerDashboard(refetch);

      // Subscribe to user activity updates using persistent manager
      const unsubscribeUserActivity = persistentWSManager.subscribe('user-activity', (data) => {
        console.log('User activity update:', data);
        setActiveUsers(prev => ({
          ...prev,
          [data.workOrderNo]: {
            userId: data.userId,
            userName: data.userName,
            userRole: data.userRole,
            activity: data.activity,
            timestamp: data.timestamp
          }
        }));
      });

      // Subscribe to user leaving work order using persistent manager
      const unsubscribeUserLeft = persistentWSManager.subscribe('user-left', (data) => {
        console.log('User left work order:', data);
        setActiveUsers(prev => {
          const updated = { ...prev };
          if (updated[data.workOrderNo] && updated[data.workOrderNo].userId === data.userId) {
            delete updated[data.workOrderNo];
          }
          return updated;
        });
      });

      return () => {
        // Don't unregister the refetch function - keep it alive for real-time updates
        // The refetch function will be replaced when the component mounts again
        console.log('ManagerDashboard: Keeping refetch function registered for real-time updates');
      };
    }
  }, [user?.token, refetch]);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [workOrderToDelete, setWorkOrderToDelete] = useState(null);

  // Memoized filtered orders
  const filteredOrders = useMemo(() => 
    shopFilter === 'All Shops' 
      ? orders 
      : orders.filter(order => order.shop === shopFilter),
    [orders, shopFilter]
  );

  // Memoized order categories
  const orderCategories = useMemo(() => {
    const pendingReview = filteredOrders.filter(o =>
      o.status && (
        o.status.toLowerCase().includes('pending review') ||
        o.status.toLowerCase().includes('pending approval')
      )
    );

    const regular = filteredOrders.filter(o => 
      !o.status || (
        !o.status.toLowerCase().includes('pending review') &&
        !o.status.toLowerCase().includes('pending approval') &&
        o.status.toLowerCase() !== 'submitted for billing' &&
        o.status.toLowerCase() !== 'customer invoiced' &&
        o.status.toLowerCase() !== 'closed'
      )
    );

    const submittedForBilling = filteredOrders.filter(o => 
      o.status && (o.status.toLowerCase() === 'submitted for billing' || o.status.toLowerCase() === 'customer invoiced')
    );

    const closed = filteredOrders.filter(o => 
      o.status && o.status.toLowerCase() === 'closed'
    );

    return { pendingReview, regular, submittedForBilling, closed };
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

  const filteredActiveWorkOrders = useMemo(() => 
    orderCategories.regular.filter(order => searchFilter(order, search)),
    [orderCategories.regular, searchFilter, search]
  );

  const filteredSubmittedForBilling = useMemo(() => 
    orderCategories.submittedForBilling.filter(order => searchFilter(order, search)),
    [orderCategories.submittedForBilling, searchFilter, search]
  );

  const filteredClosedOrders = useMemo(() => 
    orderCategories.closed.filter(order => searchFilter(order, closedSearch)),
    [orderCategories.closed, searchFilter, closedSearch]
  );

  // Event handlers
  const handleAssignNewWorkOrder = useCallback(() => {
    navigate('/assign');
  }, [navigate]);

  const handleLogout = useCallback(() => {
    window.location.href = '/login';
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleViewEdit = useCallback((workOrderNo) => {
    console.log('ManagerDashboard: Navigating to work order with referrer:', location.pathname + location.search);
    navigate(`/dashboard/workorder/${workOrderNo}`, { 
      state: { 
        from: location.pathname + location.search,
        dashboard: 'manager'
      } 
    });
  }, [navigate, location.pathname, location.search]);

  const handleRework = useCallback(async (order) => {
    try {
      await API.put(`/workorders/${order.workOrderNo}`, {
        ...order,
        status: 'Assigned'
      });
      alert('Sent back to technician for rework!');
      refetch();
    } catch (err) {
      alert('Failed to reassign for rework.');
      console.error(err);
    }
  }, [refetch]);

  const handleSubmitForBilling = useCallback(async (order) => {
    try {
      await API.put(`/workorders/submit-for-billing/${order.workOrderNo}`);
      alert('Work order submitted for billing! Email notification sent.');
      refetch();
    } catch (err) {
      if (err.response?.status === 400) {
        alert(err.response.data.error || 'Work order is already submitted for billing.');
      } else {
        alert('Failed to submit for billing.');
      }
      console.error(err);
    }
  }, [refetch]);

  const handleCloseWorkOrder = useCallback(async (order) => {
    if (!window.confirm("Are you sure you want to close this work order? This cannot be undone.")) return;
    try {
      await API.put(`/workorders/close/${order.id}`);
      alert("Work order closed!");
      refetch();
    } catch (err) {
      alert(
        err?.response?.data?.error ||
        "Failed to close work order. Make sure this work order truly has no parts."
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

  const handleClosedSearchChange = useCallback((e) => {
    setClosedSearch(e.target.value);
    resetClosedPage();
  }, [setClosedSearch, resetClosedPage]);

  const handleGlobalSearchChange = useCallback((e) => {
    handleGlobalSearch(e.target.value);
  }, [handleGlobalSearch]);

  const handleGlobalSearchSubmit = useCallback(() => {
    if (globalSearchTerm.trim()) {
      setSearchLoading(true);
      performGlobalSearch(window.allWorkOrders || [], globalSearchTerm);
      setSearchLoading(false);
    } else {
      setShowSearchResults(false);
      setSearchResults([]);
    }
  }, [globalSearchTerm, performGlobalSearch, setSearchLoading]);

  const handleBackToDashboard = useCallback(() => {
    clearGlobalSearch();
  }, [clearGlobalSearch]);

  // Delete handlers
  const handleDeleteClick = useCallback((workOrderNo) => {
    setWorkOrderToDelete(workOrderNo);
    setDeleteModalOpen(true);
  }, []);

  const handleDeleteSuccess = useCallback((message, deletedWorkOrderNo) => {
    alert(message);
    refetch();
  }, [refetch]);

  const handleDeleteError = useCallback((errorMessage) => {
    console.error('Delete error:', errorMessage);
  }, []);

  const handleDeleteModalClose = useCallback(() => {
    setDeleteModalOpen(false);
    setWorkOrderToDelete(null);
  }, []);

  // Duplicate work order handler
  const handleDuplicateWorkOrder = useCallback(async (order) => {
    if (!window.confirm(`Are you sure you want to duplicate work order ${order.workOrderNo}? This will create a new work order with all the same information except for the work order number.`)) {
      return;
    }

    try {
      // Get the next work order number
      const nextNumberResponse = await API.get('/workorders/next-number', {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      const nextWorkOrderNo = nextNumberResponse.data.nextWorkOrderNo;

      // Create a copy of the work order with the new work order number
      const duplicatedOrder = {
        ...order,
        workOrderNo: nextWorkOrderNo,
        date: new Date().toISOString().slice(0, 10), // Set to today's date
        status: 'Assigned', // Reset status to assigned
        statusHistory: [{ status: 'Assigned', date: new Date().toISOString() }], // Reset status history
        assignedDays: 1, // Reset assigned days
        inProgressDays: 0,
        inProgressPendingPartsDays: 0,
        completedPendingApprovalDays: 0,
        submittedForBillingDays: 0,
        closedDays: 0,
        customerSignature: null, // Clear customer signature
        customerSignaturePrinted: null, // Clear printed signature
        signatureTimestamp: null, // Clear signature timestamp
        // Reset time logs to just the assignment
        timeLogs: order.timeLogs && order.timeLogs.length > 0 ? [{
          technicianAssigned: order.timeLogs[0].technicianAssigned,
          assignDate: new Date().toISOString().slice(0, 10),
          startTime: '',
          finishTime: '',
          travelTime: ''
        }] : [],
        // Clear parts (start fresh)
        parts: []
      };

      // Create the new work order
      await API.post('/workorders', duplicatedOrder, {
        headers: { Authorization: `Bearer ${user.token}` }
      });

      alert(`Work order ${order.workOrderNo} duplicated successfully as work order ${nextWorkOrderNo}!`);
      refetch(); // Refresh the dashboard
    } catch (err) {
      console.error('Failed to duplicate work order:', err);
      alert('Failed to duplicate work order. Please try again.');
    }
  }, [user.token, refetch]);

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

  // Show search results page if search is active
  if (showSearchResults) {
    return (
      <SearchResultsPage
        searchTerm={globalSearchTerm}
        results={searchResults}
        onViewEdit={handleViewEdit}
        onViewPDF={handleViewPDF}
        onDuplicate={handleDuplicateWorkOrder}
        onBackToDashboard={handleBackToDashboard}
      />
    );
  }

  return (
    <div>
      <style>{mobileStyles}</style>
      <Header 
        onAssignNewWorkOrder={handleAssignNewWorkOrder}
        onLogout={handleLogout}
        onRefresh={handleRefresh}
        user={user}
        wsConnected={wsConnected}
      />
      
      <LocationFilter 
        shopFilter={shopFilter}
        onShopFilterChange={updateShopFilter}
        onSetDefault={setDefaultShop}
        globalSearchTerm={globalSearchTerm}
        onGlobalSearchChange={handleGlobalSearchChange}
        onGlobalSearchSubmit={handleGlobalSearchSubmit}
        searchLoading={searchLoading}
      />

      {/* Active Work Orders */}
      <h2 style={{ 
        fontFamily: 'Arial, sans-serif', 
        marginLeft: 30, 
        marginRight: 30,
        fontSize: 'clamp(18px, 4vw, 22px)'
      }}>Active Work Orders</h2>
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
        onDelete={handleDeleteClick}
        onDuplicate={handleDuplicateWorkOrder}
        emptyMessage="No active work orders."
        activeUsers={activeUsers}
      />

      {/* Pending Review Work Orders */}
      <SectionHeader 
        title="Pending Review" 
        count={orderCategories.pendingReview.length}
        highlight={true}
      />
      <WorkOrderTable
        orders={orderCategories.pendingReview}
        onViewEdit={handleViewEdit}
        onRework={handleRework}
        onSubmitForBilling={handleSubmitForBilling}
        onCloseWorkOrder={handleCloseWorkOrder}
        onViewPDF={handleViewPDF}
        onDelete={handleDeleteClick}
        onDuplicate={handleDuplicateWorkOrder}
        showStatus={false}
        emptyMessage="No work orders pending review."
        activeUsers={activeUsers}
      />

      {/* Submitted for Billing Archive */}
      <SectionHeader title="Submitted for Billing / Customer Invoiced" />
      <SearchInput
        value={search}
        onChange={handleSearchChange}
        placeholder="Search by company, order #, serial #, tech, or date..."
        aria-label="Search submitted for billing work orders"
      />
      <WorkOrderTable
        orders={filteredSubmittedForBilling}
        onViewEdit={handleViewEdit}
        onViewPDF={handleViewPDF}
        onDuplicate={handleDuplicateWorkOrder}
        emptyMessage="No submitted for billing work orders found."
        activeUsers={activeUsers}
      />

      {/* Closed Work Orders Archive */}
      <SectionHeader title="Closed Work Orders Archive" />
      <SearchInput
        value={closedSearch}
        onChange={handleClosedSearchChange}
        placeholder="Search by company, order #, serial #, tech, or date..."
        aria-label="Search closed work orders"
      />
      <WorkOrderTable
        orders={filteredClosedOrders.slice((closedPage - 1) * CLOSED_PAGE_SIZE, closedPage * CLOSED_PAGE_SIZE)}
        onViewEdit={handleViewEdit}
        onViewPDF={handleViewPDF}
        onDuplicate={handleDuplicateWorkOrder}
        emptyMessage="No closed work orders found."
        activeUsers={activeUsers}
      />
      
      {filteredClosedOrders.length > CLOSED_PAGE_SIZE && (
        <Pagination
          currentPage={closedPage}
          totalPages={Math.ceil(filteredClosedOrders.length / CLOSED_PAGE_SIZE)}
          onPageChange={setClosedPage}
        />
      )}

      {/* Delete Work Order Modal */}
      <DeleteWorkOrderModal
        isOpen={deleteModalOpen}
        onClose={handleDeleteModalClose}
        workOrderNo={workOrderToDelete}
        onDeleteSuccess={handleDeleteSuccess}
        onDeleteError={handleDeleteError}
      />
    </div>
  );
}

