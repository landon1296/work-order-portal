import React, { useEffect, useState } from 'react';
import API from '../api';
import { useNavigate } from 'react-router-dom';
import GLLSLogo from '../assets/GLLSLogo.png';

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

export default function TechDashboard({ username }) {
  const [workOrders, setWorkOrders] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);



  // Only show work orders that are NOT "submitted"
  const visibleWorkOrders = workOrders.filter(
    wo => !wo.status || wo.status.toLowerCase() !== 'submitted for billing'
  );

  const handleOpenEdit = (workOrderNo, isPreview = false) => {
    navigate(`/tech-dashboard/workorder/${workOrderNo}${isPreview ? '?preview=true' : ''}`);
  };

useEffect(() => {
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
                <td>{String(wo.serialNumber) || ''}</td>
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
