import React, { useState, useEffect } from 'react';
import API from '../api';

const NotificationBell = ({ user }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      // Poll for new notifications every 30 seconds
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Auto-open dropdown when there are unread notifications
  useEffect(() => {
    if (unreadCount > 0 && !showDropdown) {
      setShowDropdown(true);
    }
  }, [unreadCount, showDropdown]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await API.get('/api/notifications', {
        params: {
          userId: user.username || user.email, // Use username if available, fallback to email
          role: user.role
        }
      });
      
      const fetchedNotifications = response.data || [];
      setNotifications(fetchedNotifications);
      setUnreadCount(fetchedNotifications.filter(n => !n.read_at).length);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await API.patch(`/api/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await API.delete(`/api/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => {
        const notification = notifications.find(n => n.id === notificationId);
        return notification && !notification.read_at ? Math.max(0, prev - 1) : prev;
      });
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Notification Bell Icon */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '50px',
          color: '#6b7280',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '0',
            right: '0',
            background: '#ef4444',
            color: 'white',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '400px',
          maxHeight: '500px',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: '16px', 
              fontWeight: '600',
              color: '#374151'
            }}>
              Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
            </h3>
          </div>

          {/* Notifications List */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: notification.read_at ? 'white' : '#f0f9ff',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = notification.read_at ? '#f9fafb' : '#e0f2fe'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = notification.read_at ? 'white' : '#f0f9ff'}
                  onClick={() => !notification.read_at && markAsRead(notification.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: notification.read_at ? '400' : '600',
                        color: '#374151',
                        marginBottom: '4px'
                      }}>
                        {notification.message}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        marginBottom: '8px'
                      }}>
                        {formatDate(notification.created_at)}
                      </div>
                      {notification.work_order_no && (
                        <div style={{
                          fontSize: '12px',
                          color: '#2563eb',
                          fontWeight: '500'
                        }}>
                          Work Order: {notification.work_order_no}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9ca3af',
                        fontSize: '16px',
                        padding: '4px',
                        borderRadius: '4px',
                        marginLeft: '8px'
                      }}
                      onMouseEnter={(e) => e.target.style.color = '#ef4444'}
                      onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showDropdown && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
          }}
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};

export default NotificationBell;
