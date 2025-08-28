import React, { useState, useEffect } from 'react';
import API from '../api';

const NotificationPopup = ({ 
  isOpen, 
  onClose, 
  workOrderNo, 
  workOrderData, 
  createdBy,
  onNotificationSent 
}) => {
  const [managers, setManagers] = useState([]);
  const [selectedManager, setSelectedManager] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchManagers();
    }
  }, [isOpen]);

  const fetchManagers = async () => {
    try {
      setLoading(true);
      const response = await API.get('/api/masters/managers');
      setManagers(response.data || []);
    } catch (err) {
      console.error('Failed to fetch managers:', err);
      setError('Failed to load managers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendNotification = async () => {
    if (!selectedManager) {
      alert('Please select a manager to notify.');
      return;
    }

    try {
      setLoading(true);
      const manager = managers.find(m => m.username === selectedManager);
      
      const notificationData = {
        recipientId: manager.username,
        recipientRole: manager.role,
        recipientEmail: manager.username, // Using username as email since we don't have actual emails
        recipientName: manager.name,
        workOrderNo: workOrderNo,
        message: `New work order ${workOrderNo} has been created for ${workOrderData.companyName}. Please review and assign as needed.`,
        type: 'work_order_created',
        createdBy: createdBy
      };

      await API.post('/api/notifications', notificationData);
      
      alert(`Notification sent to ${manager.name} successfully!`);
      onNotificationSent();
      onClose();
    } catch (err) {
      console.error('Failed to send notification:', err);
      setError('Failed to send notification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '12px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
      }}>
        <h2 style={{ 
          margin: '0 0 20px 0', 
          color: '#1f2937',
          fontSize: '24px',
          fontWeight: '600'
        }}>
          Notify Manager?
        </h2>
        
        <p style={{ 
          margin: '0 0 20px 0', 
          color: '#6b7280',
          fontSize: '16px',
          lineHeight: '1.5'
        }}>
          Work order <strong>{workOrderNo}</strong> has been created successfully. 
          Would you like to notify a manager to review and assign this work order?
        </p>

        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#dc2626',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600',
            color: '#374151'
          }}>
            Select Manager:
          </label>
          <select
            value={selectedManager}
            onChange={(e) => setSelectedManager(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '16px',
              backgroundColor: 'white'
            }}
            disabled={loading}
          >
            <option value="">Choose a manager...</option>
            {managers.map((manager) => (
              <option key={manager.username} value={manager.username}>
                {manager.name} ({manager.role})
              </option>
            ))}
          </select>
        </div>

        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={handleSkip}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: '500'
            }}
          >
            Skip
          </button>
          <button
            onClick={handleSendNotification}
            disabled={loading || !selectedManager}
            style={{
              padding: '12px 24px',
              background: loading || !selectedManager ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading || !selectedManager ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: '500'
            }}
          >
            {loading ? 'Sending...' : 'Send Notification'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPopup;
