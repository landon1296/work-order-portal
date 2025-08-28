import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import GLLSLogo from '../assets/GLLSLogo.png';
import NotificationBell from './NotificationBell';

// Add responsive styles for mobile
const mobileStyles = `
  @media (max-width: 768px) {
    .reception-table-wrapper {
      margin-left: 15px !important;
      margin-right: 15px !important;
    }
    
    .reception-table {
      font-size: 12px !important;
    }
    
    .reception-table th,
    .reception-table td {
      padding: 8px 4px !important;
      white-space: nowrap;
    }
    
    .reception-table th:first-child,
    .reception-table td:first-child {
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
    .reception-table-wrapper {
      margin-left: 10px !important;
      margin-right: 10px !important;
    }
    
    .reception-table {
      font-size: 11px !important;
    }
    
    .reception-table th,
    .reception-table td {
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

// Utility functions
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return isNaN(date) ? "" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

// Custom hooks
const useTroubleshootOrders = (user) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!user?.token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await API.get('/api/troubleshoot', { 
        headers: { Authorization: `Bearer ${user.token}` } 
      });
      setOrders(res.data);
    } catch (err) {
      console.error('Failed to fetch troubleshoot orders:', err);
      setError('Failed to load troubleshooting orders. Please refresh the page.');
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

const useShopFilter = () => {
  const [shopFilter, setShopFilter] = useState(() => 
    localStorage.getItem('receptionDefaultShopFilter') || 'All Shops'
  );

  const updateShopFilter = useCallback((newFilter) => {
    setShopFilter(newFilter);
  }, []);

  const setDefaultShop = useCallback((filter) => {
    localStorage.setItem('receptionDefaultShopFilter', filter);
    alert(`Default location set to "${filter}"!`);
  }, []);

  return { shopFilter, updateShopFilter, setDefaultShop };
};

const useSearchFilters = () => {
  const [search, setSearch] = useState("");
  const [closedSearch, setClosedSearch] = useState("");

  return {
    search, setSearch,
    closedSearch, setClosedSearch
  };
};

// Sub-components
const Header = ({ onAssignNewWorkOrder, onLogout, onRefresh, user }) => (
  <div className="header-container" style={{
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 8,
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
      <h1 style={{ 
        textAlign: 'left', 
        width: '100%', 
        margin: '0 auto 20px auto', 
        fontFamily: 'Arial, sans-serif',
        fontSize: 'clamp(40px, 4vw, 24px)'
      }}>
        Reception Dashboard
      </h1>
    </div>

    <div className="header-right" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'flex-end',
      flex: '0 1 auto'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '10px'
      }}>
        <NotificationBell user={user} />
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
        aria-label="Create a new troubleshooting work order"
      >
        Troubleshoot By Phone
      </button>
    </div>
  </div>
);

const LocationFilter = ({ shopFilter, onShopFilterChange, onSetDefault }) => (
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
        aria-label="Filter troubleshooting orders by shop location"
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
  </div>
);

const TroubleshootOrderTable = ({ 
  orders, 
  onViewEdit, 
  emptyMessage = "No troubleshooting orders found."
}) => (
  <div className="reception-table-wrapper" style={{ 
    overflowX: 'auto', 
    fontFamily: 'Arial, sans-serif', 
    marginLeft: 30, 
    marginRight: 30,
    WebkitOverflowScrolling: 'touch',
    border: '1px solid #e5e7eb',
    borderRadius: '8px'
  }}>
    <table className='reception-table' style={{ 
      minWidth: 900, 
      marginBottom: 40,
      fontSize: 'clamp(12px, 2.5vw, 14px)',
      width: '100%',
      borderCollapse: 'collapse'
    }}>
      <thead>
        <tr>
          <th>Work Order Number</th>
          <th>Date</th>
          <th>Company Name</th>
          <th>Contact Name</th>
          <th>Contact Phone</th>
          <th>Make / Model / Serial #</th>
          <th>Technician Assigned</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 && (
          <tr>
            <td colSpan={8} style={{ textAlign: 'center' }}>
              {emptyMessage}
            </td>
          </tr>
        )}
        {orders.map(order => (
          <tr key={order.id}>
            <td>{order.work_order_no || 'N/A'}</td>
            <td>
              {order.date
                ? new Date(order.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  })
                : ''}
            </td>
            <td>{order.company_name}</td>
            <td>{order.contact_name || ''}</td>
            <td>{order.contact_phone || ''}</td>
            <td>{`${order.make || ''} / ${order.model || ''} / ${order.serial_number || ''}`}</td>
            <td>{order.technician_assigned || ''}</td>
            <td>
              <button
                onClick={() => onViewEdit(order.id)}
                style={{ 
                  padding: '4px 10px', 
                  background: '#64748b', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 4, 
                  marginRight: 4, 
                  cursor: 'pointer' 
                }}
                aria-label={`View and edit troubleshooting order ${order.work_order_no || order.id}`}
              >
                View / Edit
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Main component
export default function ReceptionDashboard({ user }) {
  const navigate = useNavigate();
  
  // Defensive: handle loading state to prevent crash
  if (!user || !user.token) {
    return <div>Loading dashboard...</div>;
  }

  // Custom hooks
  const { orders, loading, error, refetch } = useTroubleshootOrders(user);
  const { shopFilter, updateShopFilter, setDefaultShop } = useShopFilter();
  const { search, setSearch, closedSearch, setClosedSearch } = useSearchFilters();

  // Memoized filtered orders
  const filteredOrders = useMemo(() => {
    let filtered = orders;
    
    console.log('Filtering orders:', { totalOrders: orders.length, search, shopFilter });
    
    // Apply shop filter (if we have shop data in troubleshoot orders)
    if (shopFilter !== 'All Shops') {
      // Note: troubleshoot orders might not have shop field, so we'll keep all for now
      // filtered = filtered.filter(order => order.shop === shopFilter);
    }
    
    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      const beforeFilter = filtered.length;
      filtered = filtered.filter(order => 
        (order.company_name && order.company_name.toLowerCase().includes(searchLower)) ||
        (order.work_order_no && order.work_order_no.toString().includes(search)) ||
        (order.date && order.date.includes(search)) ||
        (order.serial_number && order.serial_number.toLowerCase().includes(searchLower)) ||
        (order.technician_assigned && order.technician_assigned.toLowerCase().includes(searchLower)) ||
        (order.contact_name && order.contact_name.toLowerCase().includes(searchLower)) ||
        (order.contact_phone && order.contact_phone.includes(search)) ||
        (order.make && order.make.toLowerCase().includes(searchLower)) ||
        (order.model && order.model.toLowerCase().includes(searchLower))
      );
      console.log('Search filter applied:', { beforeFilter, afterFilter: filtered.length, searchTerm: search });
    }
    
    return filtered;
  }, [orders, shopFilter, search]);

  // Separate active and closed orders
  const activeOrders = useMemo(() => 
    filteredOrders.filter(order => !order.status || order.status === 'Active'),
    [filteredOrders]
  );

  const filteredClosedOrders = useMemo(() => {
    let filtered = orders.filter(order => order.status === 'Closed');
    
    console.log('Filtering closed orders:', { totalClosed: filtered.length, closedSearch });
    
    // Apply search filter for closed orders
    if (closedSearch.trim()) {
      const searchLower = closedSearch.toLowerCase();
      const beforeFilter = filtered.length;
      filtered = filtered.filter(order => 
        (order.company_name && order.company_name.toLowerCase().includes(searchLower)) ||
        (order.work_order_no && order.work_order_no.toString().includes(closedSearch)) ||
        (order.date && order.date.includes(closedSearch)) ||
        (order.serial_number && order.serial_number.toLowerCase().includes(searchLower)) ||
        (order.technician_assigned && order.technician_assigned.toLowerCase().includes(searchLower)) ||
        (order.contact_name && order.contact_name.toLowerCase().includes(searchLower)) ||
        (order.contact_phone && order.contact_phone.includes(closedSearch)) ||
        (order.make && order.make.toLowerCase().includes(searchLower)) ||
        (order.model && order.model.toLowerCase().includes(searchLower))
      );
      console.log('Closed search filter applied:', { beforeFilter, afterFilter: filtered.length, searchTerm: closedSearch });
    }
    
    return filtered;
  }, [orders, closedSearch]);

  // Event handlers
  const handleAssignNewWorkOrder = useCallback(() => {
    navigate('/troubleshoot');
  }, [navigate]);

  const handleLogout = useCallback(() => {
    window.location.href = '/login';
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleViewEdit = useCallback((id) => {
    navigate(`/troubleshoot/${id}`);
  }, [navigate]);

  const handleSearchChange = useCallback((e) => {
    console.log('Search input changed:', e.target.value);
    setSearch(e.target.value);
  }, [setSearch]);

  const handleClosedSearchChange = useCallback((e) => {
    console.log('Closed search input changed:', e.target.value);
    setClosedSearch(e.target.value);
  }, [setClosedSearch]);

  // Loading and error states
  if (loading) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: '18px'
      }}>
        Loading troubleshooting orders...
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
      <style>{mobileStyles}</style>
      <Header 
        onAssignNewWorkOrder={handleAssignNewWorkOrder}
        onLogout={handleLogout}
        onRefresh={handleRefresh}
        user={user}
      />
      
      <LocationFilter 
        shopFilter={shopFilter}
        onShopFilterChange={updateShopFilter}
        onSetDefault={setDefaultShop}
      />

      {/* Active Troubleshooting Orders */}
      <h2 style={{ 
        fontFamily: 'Arial, sans-serif', 
        marginLeft: 30, 
        marginRight: 30,
        fontSize: 'clamp(18px, 4vw, 22px)',
        marginBottom: '20px'
      }}>Active Troubleshooting Orders</h2>
      
      {/* Search Bar for Active Orders */}
      <div style={{ 
        marginLeft: 30, 
        marginRight: 30,
        marginBottom: '20px'
      }}>
        <input
          type="text"
          placeholder="Search active troubleshooting orders..."
          value={search}
          onChange={handleSearchChange}
          style={{
            padding: "8px 16px",
            fontSize: 16,
            border: "2px solid #e5e7eb",
            borderRadius: 8,
            width: '100%',
            maxWidth: '600px',
            fontFamily: 'Arial, sans-serif',
          }}
          aria-label="Search active troubleshooting orders"
        />
      </div>
      
      <TroubleshootOrderTable
        orders={activeOrders}
        onViewEdit={handleViewEdit}
        emptyMessage="No active troubleshooting orders found."
      />

      {/* Closed Troubleshooting Orders */}
      <h2 style={{ 
        fontFamily: 'Arial, sans-serif', 
        marginLeft: 30, 
        marginRight: 30,
        fontSize: 'clamp(18px, 4vw, 22px)',
        marginTop: '40px',
        marginBottom: '20px'
      }}>Closed Troubleshooting Orders</h2>
      
      {/* Search Bar for Closed Orders */}
      <div style={{ 
        marginLeft: 30, 
        marginRight: 30,
        marginBottom: '20px'
      }}>
        <input
          type="text"
          placeholder="Search closed troubleshooting orders..."
          value={closedSearch}
          onChange={handleClosedSearchChange}
          style={{
            padding: "8px 16px",
            fontSize: 16,
            border: "2px solid #e5e7eb",
            borderRadius: 8,
            width: '100%',
            maxWidth: '600px',
            fontFamily: 'Arial, sans-serif',
          }}
          aria-label="Search closed troubleshooting orders"
        />
      </div>
      
      <TroubleshootOrderTable
        orders={filteredClosedOrders}
        onViewEdit={handleViewEdit}
        emptyMessage="No closed troubleshooting orders found."
      />
    </div>
  );
}
