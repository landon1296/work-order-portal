import React, { useEffect, useState } from 'react';
import API from '../api';
import { useNavigate } from 'react-router-dom';
import GLLSLogo from '../assets/GLLSLogo.png';

export default function TechDashboard({ username }) {
  const [workOrders, setWorkOrders] = useState([]);
  const navigate = useNavigate();

  // Only show work orders that are NOT "submitted"
  const visibleWorkOrders = workOrders.filter(
    wo => !wo.status || wo.status.toLowerCase() !== 'submitted for billing'
  );

  const handleOpenEdit = (workOrderNo) => {
    navigate(`/tech-dashboard/workorder/${workOrderNo}`);
  };

  useEffect(() => {
    if (!username) return;
    API.get(`/workorders/assigned/${username}`)
      .then(res => setWorkOrders(res.data))
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
      <h1 style={{ margin: 30 }}>Technician Dashboard</h1>
      <img src={GLLSLogo} alt="Company Logo" style={{ height: 100, marginRight: 20 }} />
    </div>
      <h2 style={{
        textAlign: 'center'
      }}>Your Assigned Work Orders</h2>
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
          {visibleWorkOrders.map(wo => (
            <tr key={wo.id}>
              <td>{wo.workOrderNo}</td>
              <td>{wo.companyName}</td>
              <td>{wo.status || 'assigned'}</td>
              <td>{wo.timeLogs?.[0]?.assignDate || ''}</td>
              <td>
                <button onClick={() => handleOpenEdit(wo.workOrderNo)}>
                  Open/Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
