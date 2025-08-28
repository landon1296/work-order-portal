import React, { useState } from 'react';
import API from '../api';

const DeleteWorkOrderModal = ({ 
  isOpen, 
  onClose, 
  workOrderNo, 
  onDeleteSuccess,
  onDeleteError 
}) => {
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!password.trim()) {
      setError('Please enter the deletion password.');
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      const response = await API.delete(`/workorders/${workOrderNo}`, {
        data: { password }
      });

      onDeleteSuccess(response.data.message, workOrderNo);
      setPassword('');
      onClose();
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to delete work order. Please try again.';
      setError(errorMessage);
      onDeleteError?.(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998
        }}
        onClick={handleCancel}
      />
      
      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
        backgroundColor: '#ffffff',
        border: '2px solid #ef4444',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        padding: '24px',
        minWidth: '400px',
        maxWidth: '500px',
        fontFamily: 'Arial, sans-serif'
      }}>
        
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '16px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#fef2f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '12px'
          }}>
            <span style={{ fontSize: '20px', color: '#ef4444' }}>⚠️</span>
          </div>
          <div>
            <h2 style={{ 
              margin: 0, 
              fontSize: '20px', 
              fontWeight: '600',
              color: '#1f2937'
            }}>
              Delete Work Order
            </h2>
            <p style={{ 
              margin: '4px 0 0 0', 
              fontSize: '14px', 
              color: '#6b7280' 
            }}>
              This action cannot be undone
            </p>
          </div>
        </div>

        {/* Warning Message */}
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <p style={{ 
            margin: 0, 
            fontSize: '14px', 
            color: '#991b1b',
            lineHeight: '1.5'
          }}>
            <strong>Warning:</strong> You are about to permanently delete Work Order #{workOrderNo}. 
            This will remove the work order and all associated data including:
          </p>
          <ul style={{ 
            margin: '8px 0 0 20px', 
            fontSize: '14px', 
            color: '#991b1b',
            lineHeight: '1.4'
          }}>
            <li>Time entries</li>
            <li>Line items</li>
            <li>All work order details</li>
          </ul>
        </div>

                 {/* Password Input */}
         <div style={{ marginBottom: '20px' }}>
           {/* Hidden dummy field to trick browser autofill */}
           <input
             type="text"
             style={{ display: 'none' }}
             autoComplete="username"
           />
           <label style={{
             display: 'block',
             marginBottom: '8px',
             fontSize: '14px',
             fontWeight: '600',
             color: '#374151'
           }}>
             Deletion Password:
           </label>
                                                            <input
                       type="password"
                       value={password}
                       onChange={(e) => setPassword(e.target.value)}
                       placeholder="Enter deletion password"
                       autoComplete="new-password"
                       style={{
                         width: '100%',
                         padding: '12px 16px',
                         fontSize: '16px',
                         border: '2px solid #e5e7eb',
                         borderRadius: '8px',
                         fontFamily: 'Arial, sans-serif',
                         boxSizing: 'border-box'
                       }}
                       onKeyPress={(e) => {
                         if (e.key === 'Enter') {
                           handleDelete();
                         }
                       }}
                     />
         </div>

        {/* Error Message */}
        {error && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '20px'
          }}>
            <p style={{ 
              margin: 0, 
              fontSize: '14px', 
              color: '#991b1b' 
            }}>
              {error}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={handleCancel}
            disabled={isDeleting}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              color: '#374151',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.6 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: isDeleting ? '#9ca3af' : '#ef4444',
              color: '#ffffff',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.6 : 1
            }}
          >
            {isDeleting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #ffffff',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Deleting...
              </span>
            ) : (
              'Delete Work Order'
            )}
          </button>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default DeleteWorkOrderModal;
