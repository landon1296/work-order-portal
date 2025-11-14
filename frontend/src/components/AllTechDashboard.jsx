import React, { useEffect, useState, useCallback } from 'react';
import API from '../api';
import { useNavigate } from 'react-router-dom';
import GLLSLogo from '../assets/GLLSLogo.png';
import { getStatusColor } from '../utils/statusColors';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import logoBase64 from '../assets/logoBase64';
import { usePaginatedWorkOrders } from '../hooks/usePaginatedWorkOrders';
import { useServerSideSearch } from '../hooks/useServerSideSearch';

// Utility functions
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return isNaN(date) ? "" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

function toCamelCaseDeep(obj) {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCaseDeep);
  } else if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, val]) => [
        key.replace(/_([a-z])/g, g => g[1].toUpperCase()),
        toCamelCaseDeep(val)
      ])
    );
  }
  return obj;
}

const drawRoundedRect = (doc, x, y, width, height, radius = 3) => {
  doc.roundedRect(x, y, width, height, radius, radius);
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
      ["PO Number", order.poNumber || ""],
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
      ["Status", order.status],
      ["Inbound Shipping", order.shippingCost || ""],
      ["Outbound Shipping", order.shipFromGllsCost || ""],
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
      doc.setFont("helvetica", "bold");
      const partsStartY = y;
      doc.text("Parts Used", leftMargin, partsStartY);
      y += 6;

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

      console.log(`AllTechDashboard PDF: Original parts count: ${order.parts.length}, Valid parts: ${validParts.length}, Unique parts: ${uniqueParts.length}`);

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

// Global search functionality
const useGlobalSearch = (user) => {
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  const {
    searchResults,
    searchLoading,
    searchError,
    performSearch,
    searchBySerialNumber,
    clearSearch
  } = useServerSideSearch(user);

  const handleGlobalSearch = useCallback((searchTerm) => {
    setGlobalSearchTerm(searchTerm);
  }, []);

  const performGlobalSearch = useCallback(async (searchTerm) => {
    if (!searchTerm.trim()) {
      setShowSearchResults(false);
      clearSearch();
      return;
    }
    
    await performSearch(searchTerm);
    setShowSearchResults(true);
  }, [performSearch, clearSearch]);

  const clearGlobalSearch = useCallback(() => {
    setGlobalSearchTerm('');
    setShowSearchResults(false);
    clearSearch();
  }, [clearSearch]);

  return {
    globalSearchTerm,
    showSearchResults,
    searchResults,
    searchLoading,
    searchError,
    handleGlobalSearch,
    clearGlobalSearch,
    performGlobalSearch,
    searchBySerialNumber,
    setShowSearchResults,
    setSearchResults: clearSearch // For compatibility
  };
};

// History Check Component
const HistoryCheck = ({ workOrder, onShowHistory }) => {
  const [hasHistory, setHasHistory] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (workOrder.serialNumber) {
      setIsChecking(true);
      // Fetch all work orders to check for history
      API.get('/workorders')
        .then(res => {
          const allOrders = res.data.map(toCamelCaseDeep);
          const historyCount = allOrders.filter(order => 
            order.serialNumber && 
            order.serialNumber.toLowerCase() === workOrder.serialNumber.toLowerCase() &&
            order.workOrderNo !== workOrder.workOrderNo
          ).length;
          
          setHasHistory(historyCount > 0);
        })
        .catch(err => {
          console.error('Failed to check history:', err);
        })
        .finally(() => {
          setIsChecking(false);
        });
    }
  }, [workOrder.serialNumber, workOrder.workOrderNo]);

  const checkHistory = () => {
    console.log('History check clicked for serial number:', workOrder.serialNumber);
    console.log('Has history:', hasHistory);
    if (hasHistory) {
      setShowPopup(true);
    }
  };

  const handleShowHistory = () => {
    console.log('Show history button clicked for serial number:', workOrder.serialNumber);
    setShowPopup(false);
    onShowHistory(workOrder.serialNumber);
  };

  const handleDismiss = () => {
    setShowPopup(false);
  };

  // Don't show anything while checking or if no serial number
  if (!workOrder.serialNumber || isChecking) {
    console.log('HistoryCheck: Not showing - no serial number or checking');
    return null;
  }

  // Only show the icon if there's history
  if (!hasHistory) {
    console.log('HistoryCheck: Not showing - no history for serial number:', workOrder.serialNumber);
    return null;
  }

  console.log('HistoryCheck: Showing icon for serial number:', workOrder.serialNumber);

  return (
    <>
      {/* History Icon */}
      <span 
        style={{
          display: 'inline-block',
          marginLeft: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          color: '#2563eb',
          position: 'relative'
        }}
        title="This serial number has previous work orders"
        onClick={checkHistory}
      >
        📋
      </span>

             {/* Popup */}
       {showPopup && (
         <>
           {/* Backdrop */}
           <div style={{
             position: 'fixed',
             top: 0,
             left: 0,
             right: 0,
             bottom: 0,
             backgroundColor: 'rgba(0, 0, 0, 0.5)',
             zIndex: 9998
           }} onClick={handleDismiss} />
           
           {/* Modal */}
           <div style={{
             position: 'fixed',
             top: '50%',
             left: '50%',
             transform: 'translate(-50%, -50%)',
             zIndex: 9999,
             backgroundColor: '#f4f3f2',
             border: '1px solid rgb(0, 0, 255)',
             borderRadius: '8px',
             boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
             padding: '16px',
             minWidth: '280px',
             maxWidth: '320px',
             fontFamily: 'Arial, sans-serif',
             fontSize: '14px',
             whiteSpace: 'nowrap'
           }}>
          
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '12px',
            
          }}>
            <span style={{ fontSize: '16px', marginRight: '8px' }}>📋</span>
            <span style={{ fontWeight: '600', color: '#1f2937' }}>History Available</span>
          </div>
          
          <p style={{ 
            margin: '0 0 12px 0', 
            color: '#374151',
            lineHeight: '1.4',
            fontSize: '13px'
          }}>
            Serial number <strong>{workOrder.serialNumber}</strong> has previous work orders.
          </p>
          
          <div style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={handleDismiss}
              style={{
                padding: '6px 12px',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500'
              }}
            >
              No, thanks
            </button>
            <button
              onClick={handleShowHistory}
              style={{
                padding: '6px 12px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500'
              }}
            >
              Show History
            </button>
                       </div>
           </div>
         </>
       )}
     </>
   );
 };

// Search Results Page Component
const SearchResultsPage = ({ searchTerm, results, onViewEdit, onViewPDF, onBackToDashboard }) => {
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
                    Open
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

export default function AllTechDashboard({ user }) {
  const navigate = useNavigate();
  const [troubleshootOrders, setTroubleshootOrders] = useState([]);
  const [closedTroubleshootOrders, setClosedTroubleshootOrders] = useState([]);
  const [troubleshootLoading, setTroubleshootLoading] = useState(true);
  const [closedTroubleshootLoading, setClosedTroubleshootLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  // Use paginated work orders hook
  const {
    orders: workOrders,
    loading,
    total,
    hasMore,
    loadMore,
    refresh: refetchWorkOrders
  } = usePaginatedWorkOrders(user, { pageSize: 50 });
  const { globalSearchTerm, showSearchResults, searchResults, searchLoading, searchError, handleGlobalSearch, clearGlobalSearch, performGlobalSearch, searchBySerialNumber, setShowSearchResults, setSearchResults } = useGlobalSearch(user);

  // Show all work orders except closed ones and submitted for billing
  const visibleWorkOrders = workOrders.filter(
    wo => {
      const status = (wo.status || '').toLowerCase();
      return status !== 'submitted for billing' && status !== 'closed';
    }
  );

  // Show only closed work orders
  const closedWorkOrders = workOrders.filter(
    wo => {
      const status = (wo.status || '').toLowerCase();
      return status === 'closed';
    }
  );

  // Pagination logic for closed work orders
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentClosedOrders = closedWorkOrders.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(closedWorkOrders.length / itemsPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handleOpenEdit = (workOrderNo, isPreview = false) => {
    navigate(`/dashboard/workorder/${workOrderNo}${isPreview ? '?preview=true' : ''}`);
  };

  const handleViewPDF = useCallback((order) => {
    generatePDF(order);
  }, []);

  const handleGlobalSearchChange = useCallback((e) => {
    handleGlobalSearch(e.target.value);
  }, [handleGlobalSearch]);

  const handleGlobalSearchSubmit = useCallback(async () => {
    if (globalSearchTerm.trim()) {
      await performGlobalSearch(globalSearchTerm);
    } else {
      clearGlobalSearch();
    }
  }, [globalSearchTerm, performGlobalSearch, clearGlobalSearch]);

  const handleBackToDashboard = useCallback(() => {
    clearGlobalSearch();
  }, [clearGlobalSearch]);

  const handleShowHistory = useCallback(async (serialNumber) => {
    console.log('Main handleShowHistory called with serial number:', serialNumber);
    // Set the search term to the serial number and perform search
    handleGlobalSearch(serialNumber);
    await searchBySerialNumber(serialNumber);
    setShowSearchResults(true);
  }, [handleGlobalSearch, searchBySerialNumber, setShowSearchResults]);

  useEffect(() => {
    // Fetch ALL troubleshooting orders instead of just assigned ones
    setTroubleshootLoading(true);
    API.get('/api/troubleshoot')
      .then(res => {
        const troubleshootData = res.data || [];
        // Show all active troubleshooting orders, not just assigned ones
        const activeTroubleshoot = troubleshootData.filter(order => 
          order.status !== 'Closed'
        );
        setTroubleshootOrders(activeTroubleshoot);
        setTroubleshootLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch troubleshooting orders:', err);
        setTroubleshootOrders([]);
        setTroubleshootLoading(false);
      });

    // Fetch closed troubleshooting orders
    setClosedTroubleshootLoading(true);
    API.get('/api/troubleshoot')
      .then(res => {
        const troubleshootData = res.data || [];
        // Filter for closed troubleshooting orders
        const closedTroubleshoot = troubleshootData.filter(order => 
          order.status === 'Closed'
        );
        setClosedTroubleshootOrders(closedTroubleshoot);
        setClosedTroubleshootLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch closed troubleshooting orders:', err);
        setClosedTroubleshootOrders([]);
        setClosedTroubleshootLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: '18px'
      }}>
        Loading all work orders...
      </div>
    );
  }

  // Show search results page if search is active
  if (showSearchResults) {
    return (
      <SearchResultsPage
        searchTerm={globalSearchTerm}
        results={searchResults}
        onViewEdit={handleOpenEdit}
        onViewPDF={handleViewPDF}
        onBackToDashboard={handleBackToDashboard}
      />
    );
  }

  return (
    <div style={{ paddingBottom: '60px' }}>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 8,
        fontFamily: 'Arial, Sans-Serif'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: 30, fontFamily: 'Arial, Sans-Serif' }}>
          <h1 style={{ margin: 0, fontFamily: 'Arial, Sans-Serif' }}>All Technician Work Orders</h1>
        </div>
        <img src={GLLSLogo} alt="Company Logo" style={{ height: 100, marginRight: 0, marginTop:10 }} />
      </div>

      {/* Global Search Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        margin: '20px 30px',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          maxWidth: '600px',
          width: '100%'
        }}>
          <input
            type="text"
            placeholder="Search all work orders..."
            value={globalSearchTerm}
            onChange={handleGlobalSearchChange}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleGlobalSearchSubmit();
              }
            }}
            style={{
              flex: 1,
              padding: "8px 16px",
              fontSize: 16,
              border: "2px solid #e5e7eb",
              borderRadius: 8,
              fontFamily: 'Arial, sans-serif',
            }}
            aria-label="Search all work orders"
          />
                     <button
             onClick={handleGlobalSearchSubmit}
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
               display: "flex",
               alignItems: "center",
               gap: "8px"
             }}
             aria-label="Search work orders"
           >
             {searchLoading ? (
               <>
                 <div style={{
                   width: "16px",
                   height: "16px",
                   border: "2px solid #ffffff",
                   borderTop: "2px solid transparent",
                   borderRadius: "50%",
                   animation: "spin 1s linear infinite"
                 }} />
                 Searching...
               </>
             ) : (
               "Search"
             )}
           </button>
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        margin: '20px 30px 10px 30px',
        fontFamily: 'Arial, Sans-Serif'
      }}>
        <div style={{ flex: 1 }}>
          <button
            onClick={() => {
              refetchWorkOrders();
            }}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Refresh Work Orders
          </button>
        </div>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <h2 style={{ margin: 0 }}>
            All Work Orders
          </h2>
        </div>

        <div style={{ flex: 1 }} />
      </div>

      <div className="manager-table-wrapper" style={{ overflowX: 'auto', fontFamily: 'Arial, sans-serif', margin: '20px 30px 10px 30px',}}>
        <table className="manager-table" style={{ width: '100%', marginTop: 0, fontFamily: 'Arial, Sans-Serif'}}>
          <thead>
            <tr>
              <th>Work Order #</th>
              <th>Company</th>
              <th>Make / Model / Serial#</th>
              <th>Status</th>
              <th>Date Assigned</th>
              <th>Days Open</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleWorkOrders.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>No work orders found.</td>
              </tr>
            )}
            {visibleWorkOrders.map(wo => {
              return (
                <tr key={wo.id}>
                  <td>{String(wo.workOrderNo)}</td>
                  <td>{String(wo.companyName)}</td>
                  <td style={{ position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                    {`${wo.make || ''} / ${wo.model || ''} / ${wo.serialNumber || ''}`}
                    <HistoryCheck workOrder={wo} onShowHistory={handleShowHistory} />
                  </td>
                  <td>{String(wo.status || 'Assigned')}</td>
                  <td>
                    {wo.timeLogs?.[0]?.assignDate
                      ? (
                        typeof wo.timeLogs[0].assignDate === 'string'
                          ? wo.timeLogs[0].assignDate.slice(0, 10)
                          : (
                            wo.timeLogs[0].assignDate instanceof Date
                              ? wo.timeLogs[0].assignDate.toLocaleDateString()
                              : ''
                          )
                      )
                      : ''
                    }
                  </td>
                  <td>
                    {(() => {
                      const assignedDate = wo.timeLogs?.[0]?.assignDate;
                      if (!assignedDate) return '';
                      const assigned = new Date(assignedDate);
                      const now = new Date();
                      const daysOpen = Math.floor((now - assigned) / (1000 * 60 * 60 * 24));
                      return daysOpen;
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const status = (wo.status || '').toLowerCase().trim();
                      const isAssigned = !status || status === 'assigned';
                      return isAssigned;
                    })() ? (
                      <>
                        <button
                          onClick={() => handleOpenEdit(wo.workOrderNo, true)}
                          style={{
                            marginRight: 8,
                            padding: '4px 10px',
                            border: '1px solid #ccc',
                            background: '#eee',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => handleOpenEdit(wo.workOrderNo)}
                          style={{
                            marginRight: 8,
                            padding: '4px 10px',
                            background: '#1d4ed8',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          Start Work
                        </button>
                        <button
                          onClick={() => handleViewPDF(wo)}
                          style={{
                            padding: '4px 10px',
                            background: 'white',
                            color: '#2563eb',
                            border: '1px solid #2563eb',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          PDF
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleOpenEdit(wo.workOrderNo)}
                          style={{
                            marginRight: 8,
                            padding: '4px 10px',
                            background: '#1d4ed8',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          Open
                        </button>
                        <button
                          onClick={() => handleViewPDF(wo)}
                          style={{
                            padding: '4px 10px',
                            background: 'white',
                            color: '#2563eb',
                            border: '1px solid #2563eb',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          PDF
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls for Active Work Orders */}
      {hasMore && (
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <button
            onClick={loadMore}
            disabled={loading}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {loading ? 'Loading...' : `Load More (${workOrders.length} of ${total})`}
          </button>
        </div>
      )}

      {/* Troubleshooting Orders Section */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        margin: '40px 30px 10px 30px',
        fontFamily: 'Arial, Sans-Serif'
      }}>
        <div style={{ flex: 1 }}>
          <button
            onClick={() => {
              setTroubleshootLoading(true);
              API.get('/api/troubleshoot')
                .then(res => {
                  const troubleshootData = res.data || [];
                  setTroubleshootOrders(troubleshootData);
                  setTroubleshootLoading(false);
                })
                .catch(err => {
                  console.error('Failed to fetch troubleshooting orders:', err);
                  setTroubleshootOrders([]);
                  setTroubleshootLoading(false);
                });
            }}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Refresh Troubleshooting Orders
          </button>
        </div>

                 <div style={{ flex: 1, textAlign: 'center' }}>
           <h2 style={{ margin: 0 }}>
             Active Troubleshooting Orders
           </h2>
         </div>

        <div style={{ flex: 1 }} />
      </div>

      <div className="manager-table-wrapper" style={{ overflowX: 'auto', fontFamily: 'Arial, sans-serif', margin: '20px 30px 40px 30px',}}>
        <table className="manager-table" style={{ width: '100%', marginTop: 0, fontFamily: 'Arial, Sans-Serif' }}>
          <thead>
            <tr>
              <th>Company Name</th>
              <th>Date</th>
              <th>Technician</th>
              <th>Make / Model / Serial#</th>
              <th>Work Description</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {troubleshootLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>Loading troubleshooting orders...</td>
              </tr>
            ) : troubleshootOrders.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>No troubleshooting orders found.</td>
              </tr>
            ) : (
              troubleshootOrders.map(order => (
                <tr key={order.id}>
                  <td>{order.company_name || 'N/A'}</td>
                  <td>
                    {order.date 
                      ? new Date(order.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })
                      : 'N/A'
                    }
                  </td>
                  <td>{order.technician_assigned || 'N/A'}</td>
                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                    {`${order.make || ''} / ${order.model || ''} / ${order.serial_number || ''}`}
                  </td>
                  <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {order.work_description || 'N/A'}
                  </td>
                  <td>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      borderRadius: "12px",
                      fontSize: "13px",
                      background: order.status === 'Active' ? '#10b981' : '#6b7280',
                      color: "#fff"
                    }}>
                      {order.status || 'Active'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => navigate(`/troubleshoot/${order.id}`)}
                      style={{
                        padding: '4px 10px',
                        background: '#1d4ed8',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                    >
                      View/Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
             </div>

       {/* Closed Work Orders Section */}
       <div style={{ 
         display: 'flex', 
         justifyContent: 'space-between', 
         alignItems: 'center', 
         margin: '40px 30px 10px 30px',
         fontFamily: 'Arial, Sans-Serif'
       }}>
         <div style={{ flex: 1 }}>
           <button
             onClick={() => {
               refetchWorkOrders();
             }}
             style={{
               background: '#2563eb',
               color: 'white',
               border: 'none',
               padding: '6px 16px',
               borderRadius: 6,
               fontSize: 14,
               fontWeight: 'bold',
               cursor: 'pointer'
             }}
           >
             Refresh Closed Work Orders
           </button>
         </div>

         <div style={{ flex: 1, textAlign: 'center' }}>
           <h2 style={{ margin: 0 }}>
             Closed Work Orders
           </h2>
         </div>

         <div style={{ flex: 1 }} />
       </div>

       <div className="manager-table-wrapper" style={{ overflowX: 'auto', fontFamily: 'Arial, sans-serif', margin: '20px 30px 40px 30px',}}>
         <table className="manager-table" style={{ width: '100%', marginTop: 0, fontFamily: 'Arial, Sans-Serif' }}>
           <thead>
             <tr>
               <th>Work Order #</th>
               <th>Company</th>
               <th>Make / Model / Serial#</th>
               <th>Status</th>
               <th>Date Assigned</th>
               <th>Days Open</th>
               <th>Action</th>
             </tr>
           </thead>
                       <tbody>
              {currentClosedOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center' }}>No closed work orders found.</td>
                </tr>
              ) : (
                currentClosedOrders.map(wo => {
                 return (
                   <tr key={wo.id}>
                     <td>{String(wo.workOrderNo)}</td>
                     <td>{String(wo.companyName)}</td>
                     <td style={{ position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                       {`${wo.make || ''} / ${wo.model || ''} / ${wo.serialNumber || ''}`}
                       <HistoryCheck workOrder={wo} onShowHistory={handleShowHistory} />
                     </td>
                     <td>{String(wo.status || 'Closed')}</td>
                     <td>
                       {wo.timeLogs?.[0]?.assignDate
                         ? (
                           typeof wo.timeLogs[0].assignDate === 'string'
                             ? wo.timeLogs[0].assignDate.slice(0, 10)
                             : (
                               wo.timeLogs[0].assignDate instanceof Date
                                 ? wo.timeLogs[0].assignDate.toLocaleDateString()
                                 : ''
                             )
                         )
                         : ''
                       }
                     </td>
                     <td>
                       {(() => {
                         const assignedDate = wo.timeLogs?.[0]?.assignDate;
                         if (!assignedDate) return '';
                         const assigned = new Date(assignedDate);
                         const now = new Date();
                         const daysOpen = Math.floor((now - assigned) / (1000 * 60 * 60 * 24));
                         return daysOpen;
                       })()}
                     </td>
                     <td>
                       <button
                         onClick={() => handleOpenEdit(wo.workOrderNo)}
                         style={{
                           marginRight: 8,
                           padding: '4px 10px',
                           background: '#1d4ed8',
                           color: '#fff',
                           border: 'none',
                           borderRadius: 4,
                           cursor: 'pointer'
                         }}
                       >
                         View
                       </button>
                       <button
                         onClick={() => handleViewPDF(wo)}
                         style={{
                           padding: '4px 10px',
                           background: 'white',
                           color: '#2563eb',
                           border: '1px solid #2563eb',
                           borderRadius: 4,
                           cursor: 'pointer'
                         }}
                       >
                         PDF
                       </button>
                     </td>
                   </tr>
                 );
               })
             )}
                       </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {closedWorkOrders.length > 0 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            margin: '20px 0',
            fontFamily: 'Arial, sans-serif'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px'
            }}>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                style={{
                  padding: '8px 12px',
                  background: currentPage === 1 ? '#e5e7eb' : '#2563eb',
                  color: currentPage === 1 ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                Previous
              </button>

              <span style={{ fontSize: '14px', color: '#374151' }}>
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{
                  padding: '8px 12px',
                  background: currentPage === totalPages ? '#e5e7eb' : '#2563eb',
                  color: currentPage === totalPages ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                Next
              </button>
            </div>

            <div style={{ 
              marginLeft: '20px',
              fontSize: '14px',
              color: '#6b7280'
            }}>
              Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, closedWorkOrders.length)} of {closedWorkOrders.length} closed work orders
            </div>
          </div>
        )}

        {/* Closed Troubleshooting Orders Section */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '40px 30px 10px 30px',
          fontFamily: 'Arial, Sans-Serif'
        }}>
          <div style={{ flex: 1 }}>
            <button
              onClick={() => {
                setClosedTroubleshootLoading(true);
                API.get('/api/troubleshoot')
                  .then(res => {
                    const troubleshootData = res.data || [];
                    const closedTroubleshoot = troubleshootData.filter(order => 
                      order.status === 'Closed'
                    );
                    setClosedTroubleshootOrders(closedTroubleshoot);
                    setClosedTroubleshootLoading(false);
                  })
                  .catch(err => {
                    console.error('Failed to fetch closed troubleshooting orders:', err);
                    setClosedTroubleshootOrders([]);
                    setClosedTroubleshootLoading(false);
                  });
              }}
              style={{
                background: '#2563eb',
                color: 'white',
                border: 'none',
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Refresh Closed Troubleshooting Orders
            </button>
          </div>

          <div style={{ flex: 1, textAlign: 'center' }}>
            <h2 style={{ margin: 0 }}>
              Closed Troubleshooting Orders
            </h2>
          </div>

          <div style={{ flex: 1 }} />
        </div>

        <div className="manager-table-wrapper" style={{ overflowX: 'auto', fontFamily: 'Arial, sans-serif', margin: '20px 30px 40px 30px',}}>
          <table className="manager-table" style={{ width: '100%', marginTop: 0, fontFamily: 'Arial, Sans-Serif' }}>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Date</th>
                <th>Technician</th>
                <th>Make / Model / Serial#</th>
                <th>Work Description</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {closedTroubleshootLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center' }}>Loading closed troubleshooting orders...</td>
                </tr>
              ) : closedTroubleshootOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center' }}>No closed troubleshooting orders.</td>
                </tr>
              ) : (
                closedTroubleshootOrders.map(order => (
                  <tr key={order.id}>
                    <td>{order.company_name || 'N/A'}</td>
                    <td>
                      {order.date 
                        ? new Date(order.date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })
                        : 'N/A'
                      }
                    </td>
                    <td>{order.technician_assigned || 'N/A'}</td>
                    <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                      {`${order.make || ''} / ${order.model || ''} / ${order.serial_number || ''}`}
                    </td>
                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {order.work_description || 'N/A'}
                    </td>
                    <td>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: "12px",
                        fontSize: "13px",
                        background: '#6b7280',
                        color: "#fff"
                      }}>
                        {order.status || 'Closed'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => navigate(`/troubleshoot/${order.id}`)}
                        style={{
                          padding: '4px 10px',
                          background: '#1d4ed8',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer'
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
