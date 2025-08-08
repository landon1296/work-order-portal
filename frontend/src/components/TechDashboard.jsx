import React, { useEffect, useState, useCallback } from 'react';
import API from '../api';
import { useNavigate } from 'react-router-dom';
import GLLSLogo from '../assets/GLLSLogo.png';
import { getStatusColor } from '../utils/statusColors';

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

// Global search functionality
const useGlobalSearch = () => {
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

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
    handleGlobalSearch,
    clearGlobalSearch,
    performGlobalSearch,
    setShowSearchResults,
    setSearchResults
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
          if (historyCount > 0) {
            setShowPopup(true);
          }
        })
        .catch(err => {
          console.error('Failed to check history:', err);
        })
        .finally(() => {
          setIsChecking(false);
        });
    }
  }, [workOrder.serialNumber, workOrder.workOrderNo]);

  const handleShowHistory = () => {
    setShowPopup(false);
    onShowHistory(workOrder.serialNumber);
  };

  const handleDismiss = () => {
    setShowPopup(false);
  };

  if (!workOrder.serialNumber || !hasHistory) {
    return null;
  }

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
        onClick={() => setShowPopup(true)}
      >
        📋
      </span>

             {/* Popup */}
       {showPopup && (
         <div style={{
           position: 'absolute',
           top: '100%',
           left: '50%',
           transform: 'translateX(-50%)',
           marginTop: '8px',
           zIndex: 1000,
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
          {/* Arrow pointing up */}
          <div style={{
            position: 'absolute',
            top: '-6px',
            left: '33.3%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: '6px solid rgb(0, 0, 255)'
          }} />
          
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
      )}
    </>
  );
};

// Search Results Page Component
const SearchResultsPage = ({ searchTerm, results, onViewEdit, onBackToDashboard }) => {
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

export default function TechDashboard({ username }) {
  const [workOrders, setWorkOrders] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const { globalSearchTerm, showSearchResults, searchResults, handleGlobalSearch, clearGlobalSearch, performGlobalSearch, setShowSearchResults, setSearchResults } = useGlobalSearch();

  // Only show work orders that are NOT "submitted"
  const visibleWorkOrders = workOrders.filter(
    wo => !wo.status || wo.status.toLowerCase() !== 'submitted for billing'
  );

  const handleOpenEdit = (workOrderNo, isPreview = false) => {
    navigate(`/tech-dashboard/workorder/${workOrderNo}${isPreview ? '?preview=true' : ''}`);
  };

  const handleGlobalSearchChange = useCallback((e) => {
    handleGlobalSearch(e.target.value);
  }, [handleGlobalSearch]);

  const handleGlobalSearchSubmit = useCallback(() => {
    if (globalSearchTerm.trim()) {
      // Fetch all work orders for global search
      API.get('/workorders')
        .then(res => {
          const allOrders = res.data.map(toCamelCaseDeep);
          performGlobalSearch(allOrders, globalSearchTerm);
        })
        .catch(err => {
          console.error('Failed to fetch all work orders for search:', err);
          // Fallback to searching assigned work orders
          performGlobalSearch(workOrders, globalSearchTerm);
        });
    } else {
      setShowSearchResults(false);
      setSearchResults([]);
    }
  }, [globalSearchTerm, performGlobalSearch, workOrders]);

  const handleBackToDashboard = useCallback(() => {
    clearGlobalSearch();
  }, [clearGlobalSearch]);

  const handleShowHistory = useCallback((serialNumber) => {
    // Set the search term to the serial number and perform search
    handleGlobalSearch(serialNumber);
    // Trigger the search immediately
    API.get('/workorders')
      .then(res => {
        const allOrders = res.data.map(toCamelCaseDeep);
        performGlobalSearch(allOrders, serialNumber);
      })
      .catch(err => {
        console.error('Failed to fetch all work orders for search:', err);
        // Fallback to searching assigned work orders
        performGlobalSearch(workOrders, serialNumber);
      });
  }, [handleGlobalSearch, performGlobalSearch, workOrders]);

  useEffect(() => {
    setLoading(true);
    API.get(`/workorders/assigned/${username}`)
      .then(res => {
        const orders = res.data.map(toCamelCaseDeep);
        setWorkOrders(orders);
        setLoading(false);
      })
      .catch(() => {
        setWorkOrders([]);
        setLoading(false);
      });
  }, [username]);

  if (loading) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: '18px'
      }}>
        Loading your assigned work orders...
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
        onBackToDashboard={handleBackToDashboard}
      />
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 8,
        fontFamily: 'Arial, Sans-Serif'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: 30, fontFamily: 'Arial, Sans-Serif' }}>
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
              marginTop: 10,
              cursor: 'pointer'
            }}
          >
            Log Out
          </button>
          <h1 style={{ margin: 0, fontFamily: 'Arial, Sans-Serif' }}>Technician Dashboard</h1>
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
            style={{
              padding: "8px 16px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 16
            }}
            aria-label="Search work orders"
          >
            Search
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
        setLoading(true);
        API.get(`/workorders/assigned/${username}`)
          .then(res => {
            setWorkOrders(res.data.map(toCamelCaseDeep));
            setLoading(false);
          })
          .catch(() => {
            setWorkOrders([]);
            setLoading(false);
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
      Refresh Work Orders
    </button>
  </div>

  <div style={{ flex: 1, textAlign: 'center' }}>
    <h2 style={{ margin: 0 }}>
      Your Assigned Work Orders
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
            <th>Serial #</th>
            <th>Status</th>
            <th>Date Assigned</th>
            <th>Days Open</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {visibleWorkOrders.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center' }}>No assigned work orders.</td>
            </tr>
          )}
          {visibleWorkOrders.map(wo => {

            return (
              <tr key={wo.id}>
                <td>{String(wo.workOrderNo)}</td>
                <td>{String(wo.companyName)}</td>
                                 <td style={{ position: 'relative' }}>
                   {String(wo.serialNumber) || ''}
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
                    </>
                  ) : (
                    <button
                      onClick={() => handleOpenEdit(wo.workOrderNo)}
                      style={{
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
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
