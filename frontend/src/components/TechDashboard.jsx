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

  // Only show work orders that are NOT "submitted"
  const visibleWorkOrders = workOrders.filter(
    wo => !wo.status || wo.status.toLowerCase() !== 'submitted for billing'
  );

  const handleOpenEdit = (workOrderNo, isPreview = false) => {
    navigate(`/tech-dashboard/workorder/${workOrderNo}${isPreview ? '?preview=true' : ''}`);
  };

  useEffect(() => {
    API.get(`/workorders/assigned/${username}`)
      .then(res => {
        setWorkOrders(res.data.map(toCamelCaseDeep));
      })
      .catch(() => setWorkOrders([]));
  }, [username]);

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 8
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: 30 }}>
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
              cursor: 'pointer'
            }}
          >
            Log Out
          </button>
          <h1 style={{ margin: 0 }}>Technician Dashboard</h1>
        </div>
        <img src={GLLSLogo} alt="Company Logo" style={{ height: 100, marginRight: 20 }} />
      </div>

      <h2 style={{ textAlign: 'center' }}>Your Assigned Work Orders</h2>
      <table className="assign-table" style={{ width: '100%', marginTop: 8 }}>
        <thead>
          <tr>
            <th>Work Order #</th>
            <th>Company</th>
            <th>Status</th>
            <th>Date Assigned</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {visibleWorkOrders.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center' }}>No assigned work orders.</td>
            </tr>
          )}
          {visibleWorkOrders.map(wo => {
            return (
              <tr key={wo.id}>
                <td>{String(wo.workOrderNo)}</td>
                <td>{String(wo.companyName)}</td>
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
                          borderRadius: 4
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
                          borderRadius: 4
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
                        borderRadius: 4
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
  );
}
