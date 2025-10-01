import React from 'react';

const WorkOrderCompletionStatus = ({ workOrder }) => {
  // Debug logging removed - component working correctly
  
  // Check completion status for each field (support both snake_case and camelCase)
  const hasPoNumber = (workOrder?.po_number && workOrder.po_number.trim() !== '') || 
                     (workOrder?.poNumber && workOrder.poNumber.trim() !== '');
  const hasContactInfo = ((workOrder?.contact_name && workOrder.contact_name.trim() !== '') || 
                         (workOrder?.contactName && workOrder.contactName.trim() !== '')) &&
                        ((workOrder?.contact_phone && workOrder.contact_phone.trim() !== '') || 
                         (workOrder?.contactPhone && workOrder.contactPhone.trim() !== ''));
  const hasSerialNumber = (workOrder?.serial_number && workOrder.serial_number.trim() !== '') ||
                         (workOrder?.serialNumber && workOrder.serialNumber.trim() !== '');
  const hasShippingCost = (workOrder?.shipping_cost !== null && workOrder?.shipping_cost !== undefined && 
                          workOrder?.shipping_cost !== '') ||
                         (workOrder?.shippingCost !== null && workOrder?.shippingCost !== undefined && 
                          workOrder?.shippingCost !== '');
  const hasShippingComments = (workOrder?.shipping_comments && workOrder.shipping_comments.trim() !== '') ||
                             (workOrder?.shippingComments && workOrder.shippingComments.trim() !== '');
  
  // Completion status calculated successfully

  const completionItems = [
    { completed: hasPoNumber, label: 'PO Number', field: 'po_number' },
    { completed: hasContactInfo, label: 'Contact Info', field: 'contact_info' },
    { completed: hasSerialNumber, label: 'Serial Number', field: 'serial_number' },
    { completed: hasShippingCost, label: 'Shipping Cost', field: 'shipping_cost' },
    { completed: hasShippingComments, label: 'Shipping Comments', field: 'shipping_comments' }
  ];

  const completedCount = completionItems.filter(item => item.completed).length;
  const totalCount = completionItems.length;
  const completionPercentage = Math.round((completedCount / totalCount) * 100);

  // Color coding based on completion percentage
  const getCompletionColor = () => {
    if (completionPercentage === 100) return '#10b981'; // Green - Complete
    if (completionPercentage >= 75) return '#f59e0b';   // Yellow - Almost complete
    if (completionPercentage >= 50) return '#f97316';   // Orange - Half complete
    return '#ef4444'; // Red - Needs attention
  };

  const completionColor = getCompletionColor();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '14px', fontWeight: 'bold', minWidth: '80px' }}>
        {workOrder?.workOrderNo}
      </span>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {completionItems.map((item, index) => (
          <div
            key={index}
            title={`${item.label}: ${item.completed ? 'Complete ✓' : 'Missing ✗'}`}
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: item.completed ? '#10b981' : '#d1d5db',
              border: `2px solid ${item.completed ? '#059669' : '#9ca3af'}`,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.3)';
              e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
              e.target.style.zIndex = '10';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = 'none';
              e.target.style.zIndex = '1';
            }}
          />
        ))}
        <div style={{ 
          marginLeft: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span 
            style={{ 
              fontSize: '11px', 
              color: completionColor,
              fontWeight: '600',
              padding: '2px 6px',
              borderRadius: '12px',
              backgroundColor: completionPercentage === 100 ? '#dcfce7' : 
                              completionPercentage >= 75 ? '#fef3c7' :
                              completionPercentage >= 50 ? '#fed7aa' : '#fee2e2',
              border: `1px solid ${completionColor}`
            }}
            title={`Completion: ${completedCount}/${totalCount} fields (${completionPercentage}%)`}
          >
            {completedCount}/{totalCount}
          </span>
          {completionPercentage === 100 && (
            <span style={{ color: '#10b981', fontSize: '12px' }} title="Complete!">
              ✓
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkOrderCompletionStatus;
