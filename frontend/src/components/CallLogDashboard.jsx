import React, { useState, useEffect, useMemo } from 'react';
import API from '../api';
import GLLSLogo from '../assets/GLLSLogo.png';
import CallLogModal from './CallLogModal';

const CallLogDashboard = ({ user }) => {
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCallLog, setSelectedCallLog] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Fetch call logs for the current month
  useEffect(() => {
    fetchCallLogs();
  }, [currentMonth]);

  const fetchCallLogs = async () => {
    try {
      setLoading(true);
      const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
        .toISOString().split('T')[0];
      const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
        .toISOString().split('T')[0];

      const response = await API.get(`/api/calllogs/date-range?startDate=${startDate}&endDate=${endDate}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      
      setCallLogs(response.data);
      setError('');
    } catch (err) {
      console.error('Error fetching call logs:', err);
      setError('Failed to load call logs');
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const findNextCustomDate = (fromDate, selectedDays) => {
    const current = new Date(fromDate);
    
    // Check next 14 days for selected days
    for (let i = 1; i <= 14; i++) {
      current.setDate(current.getDate() + 1);
      const dayOfWeek = (current.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
      
      if (selectedDays.includes(dayOfWeek)) {
        return new Date(current);
      }
    }
    
    return null;
  };

  const generateRecurringDates = (callLog) => {
    const dates = [];
    // Parse date string directly to avoid timezone issues
    let startDate;
    if (typeof callLog.date === 'string' && callLog.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = callLog.date.split('-').map(Number);
      startDate = new Date(year, month - 1, day); // month is 0-indexed
    } else {
      startDate = new Date(callLog.date);
    }
    
    const endDate = callLog.schedule_end_date ? new Date(callLog.schedule_end_date) : new Date(startDate.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year default
    
    let current = new Date(startDate);
    const interval = callLog.schedule_interval || 1;
    
    // Generate up to 50 recurring dates
    let count = 0;
    while (current <= endDate && count < 50) {
      current = new Date(current);
      
      switch (callLog.schedule_frequency) {
        case 'daily':
          current.setDate(current.getDate() + interval);
          break;
        case 'weekly':
          current.setDate(current.getDate() + (7 * interval));
          break;
        case 'monthly':
          current.setMonth(current.getMonth() + interval);
          break;
        case 'annually':
          current.setFullYear(current.getFullYear() + interval);
          break;
        case 'custom':
          if (callLog.schedule_custom_days && callLog.schedule_custom_days.length > 0) {
            const nextCustomDate = findNextCustomDate(current, callLog.schedule_custom_days);
            if (nextCustomDate) {
              current = nextCustomDate;
            } else {
              return dates; // No more custom dates possible
            }
          } else {
            return dates; // No custom days selected
          }
          break;
        default:
          return dates; // Unknown frequency
      }
      
      if (current <= endDate) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
        count++;
      }
    }
    
    return dates;
  };

  const callLogsByDate = useMemo(() => {
    const grouped = {};
    
    callLogs.forEach(log => {
      // Parse date string directly to avoid timezone issues
      // If log.date is already in YYYY-MM-DD format, use it directly
      let dateKey;
      if (typeof log.date === 'string' && log.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        dateKey = log.date;
      } else {
        // Fallback for other date formats
        const originalDate = new Date(log.date);
        const year = originalDate.getFullYear();
        const month = String(originalDate.getMonth() + 1).padStart(2, '0');
        const day = String(originalDate.getDate()).padStart(2, '0');
        dateKey = `${year}-${month}-${day}`;
      }
      
      if (!grouped[dateKey]) grouped[dateKey] = [];
      // Create a copy of the log with date-specific completion status
      const logForDate = {
        ...log,
        isCompletedForThisDate: log.completed_dates && log.completed_dates.includes(dateKey)
      };
      grouped[dateKey].push(logForDate);
      
      // If this call log has a schedule, add recurring dates
      if (log.schedule_frequency) {
        const recurringDates = generateRecurringDates(log);
        recurringDates.forEach(recurringDate => {
          const recurringDateKey = recurringDate;
          if (!grouped[recurringDateKey]) grouped[recurringDateKey] = [];
          // For recurring dates, check if this specific date was completed
          const logForRecurringDate = {
            ...log,
            isCompletedForThisDate: log.completed_dates && log.completed_dates.includes(recurringDateKey)
          };
          grouped[recurringDateKey].push(logForRecurringDate);
        });
      }
    });
    
    return grouped;
  }, [callLogs]);

  const navigateMonth = (direction) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const handleDayClick = (day) => {
    if (!day) return;
    // Create local date string to avoid timezone issues
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const date = String(day.getDate()).padStart(2, '0');
    const localDateString = `${year}-${month}-${date}`;
    console.log('Clicked day:', day.getDate(), 'Setting selectedDate to:', localDateString);
    setSelectedDate(localDateString);
    setSelectedCallLog(null);
    setModalOpen(true);
  };

  const handleCallLogClick = (callLog, dateKey, e) => {
    e.stopPropagation();
    setSelectedCallLog(callLog);
    // Use the clicked cell's local date string so completion is per-day
    setSelectedDate(dateKey);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedCallLog(null);
  };

  const handleModalSave = () => {
    fetchCallLogs(); // Refresh the call logs
  };

  // Optimistically update completion for a specific date of a call log
  const handleToggleCompleteDate = (callLogId, dateKey, isCompleted) => {
    setCallLogs(prev => prev.map(log => {
      if (log.id !== callLogId) return log;
      const prevDates = Array.isArray(log.completed_dates) ? log.completed_dates : [];
      const hasDate = prevDates.includes(dateKey);
      if (isCompleted) {
        return hasDate ? log : { ...log, completed_dates: [...prevDates, dateKey] };
      } else {
        return hasDate ? { ...log, completed_dates: prevDates.filter(d => d !== dateKey) } : log;
      }
    }));
  };

  // Optimistically update lead potential for a call log
  const handleUpdateLeadPotential = (callLogId, newValue) => {
    setCallLogs(prev => prev.map(log => (
      log.id === callLogId ? { ...log, lead_potential: newValue } : log
    )));
  };

  // Optimistically update converted for a specific date of a call log
  const handleToggleConvertedDate = (callLogId, dateKey, isConverted) => {
    setCallLogs(prev => prev.map(log => {
      if (log.id !== callLogId) return log;
      const prevDates = Array.isArray(log.converted_dates) ? log.converted_dates : [];
      const hasDate = prevDates.includes(dateKey);
      if (isConverted) {
        return hasDate ? log : { ...log, converted_dates: [...prevDates, dateKey] };
      } else {
        return hasDate ? { ...log, converted_dates: prevDates.filter(d => d !== dateKey) } : log;
      }
    }));
  };

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  const days = getDaysInMonth(currentMonth);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Call Log / Follow-up</h2>
        <p>Loading call logs...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', position: 'relative' }}>
      <img
        src={GLLSLogo}
        alt="Company Logo"
        style={{
          position: 'absolute',
          top: 0,
          right: 16,
          height: 84,
          opacity: 0.9
        }}
      />
      <h2 style={{ marginBottom: '20px' }}>Call Log / Follow-up</h2>
      
      {error && (
        <div style={{
          backgroundColor: '#fee',
          color: '#c33',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <button
          onClick={() => navigateMonth(-1)}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          ← Previous
        </button>
        <h3 style={{ margin: 0, fontSize: '24px' }}>
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <button
          onClick={() => navigateMonth(1)}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          Next →
        </button>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(7, 1fr)', 
        gap: '1px',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden'
      }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} style={{
            background: '#f3f4f6',
            padding: '12px',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            {day}
          </div>
        ))}
        
        {days.map((day, index) => {
          if (!day) {
            return <div key={index} style={{ minHeight: '120px' }} />;
          }
          
          // Create local date string to avoid timezone issues
          const year = day.getFullYear();
          const month = String(day.getMonth() + 1).padStart(2, '0');
          const date = String(day.getDate()).padStart(2, '0');
          const dateKey = `${year}-${month}-${date}`;
          const dayCallLogs = (callLogsByDate[dateKey] || []).map(l => ({
            ...l,
            isConvertedForThisDate: Array.isArray(l.converted_dates) && l.converted_dates.includes(dateKey)
          }));
          const isToday = day.toDateString() === new Date().toDateString();
          
          return (
            <div
              key={index}
              style={{
                minHeight: '120px',
                border: '1px solid #e5e7eb',
                background: isToday ? '#fef3c7' : 'white',
                padding: '8px',
                cursor: 'pointer',
                position: 'relative'
              }}
              onClick={() => handleDayClick(day)}
            >
              <div style={{
                fontWeight: 'bold',
                marginBottom: '4px',
                color: isToday ? '#92400e' : 'inherit'
              }}>
                {day.getDate()}
              </div>
              
              {dayCallLogs.map((callLog, idx) => (
                <div
                  key={idx}
                  onClick={(e) => handleCallLogClick(callLog, dateKey, e)}
                  style={{
                    background: callLog.isConvertedForThisDate
                      ? '#22c55e' // green if converted
                      : (callLog.isCompletedForThisDate ? '#6b7280' : '#3b82f6'),
                    color: 'white',
                    padding: '2px 6px',
                    margin: '2px 0',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    opacity: callLog.isCompletedForThisDate ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title={`${callLog.company_name} - ${callLog.contact_name}${callLog.isCompletedForThisDate ? ' (Completed)' : ''} (Click to edit)`}
                >
                  <span style={{ flex: 1 }}>
                    {callLog.company_name}
                  </span>
                  <span aria-label="lead potential" title="Lead potential">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <span key={i} style={{
                        color: i < (callLog.lead_potential || 0) ? '#ffd700' : 'rgba(255,255,255,0.4)'
                      }}>★</span>
                    ))}
                  </span>
                </div>
              ))}
              
              {dayCallLogs.length === 0 && (
                <div style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  textAlign: 'center',
                  marginTop: '20px'
                }}>
                  Click to add call
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CallLogModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        selectedDate={selectedDate}
        callLog={selectedCallLog}
        onSave={handleModalSave}
        onToggleCompleteDate={handleToggleCompleteDate}
        onUpdateLeadPotential={handleUpdateLeadPotential}
        onToggleConvertedDate={handleToggleConvertedDate}
        user={user}
      />
    </div>
  );
};

export default CallLogDashboard;
