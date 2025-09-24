import React, { useState, useEffect } from 'react';
import API from '../api';

const CallLogModal = ({ isOpen, onClose, selectedDate, callLog, onSave, onToggleCompleteDate, onUpdateLeadPotential, onToggleConvertedDate, user }) => {
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone_number: '',
    notes: ''
  });
  const [callCompleted, setCallCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    frequency: 'weekly',
    interval: 1,
    endDate: '',
    customDays: []
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  const [leadPotential, setLeadPotential] = useState(0);
  const [converted, setConverted] = useState(false);

  const formatPhoneNumber = (value) => {
    // Remove all non-numeric characters
    const phoneNumber = value.replace(/\D/g, '');
    
    // Format as (###) ###-####
    if (phoneNumber.length === 0) return '';
    if (phoneNumber.length <= 3) return `(${phoneNumber}`;
    if (phoneNumber.length <= 6) return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  const fetchNotes = async (callLogId) => {
    try {
      const response = await API.get(`/api/calllognotes/call-log/${callLogId}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      const sorted = Array.isArray(response.data)
        ? [...response.data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        : [];
      setNotes(sorted);
    } catch (err) {
      console.error('Error fetching notes:', err);
      setNotes([]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (callLog) {
        // Viewing existing call log - start in view mode
        setFormData({
          company_name: callLog.company_name || '',
          contact_name: callLog.contact_name || '',
          email: callLog.email || '',
          phone_number: callLog.phone_number ? formatPhoneNumber(callLog.phone_number) : '',
          notes: callLog.notes || ''
        });
        // Check if this specific date is completed
        const currentDateKey = new Date(selectedDate).toISOString().split('T')[0];
        const isCompletedForThisDate = callLog.completed_dates && callLog.completed_dates.includes(currentDateKey);
        setCallCompleted(isCompletedForThisDate || false);
        setLeadPotential(callLog.lead_potential || 0);
        const isConvertedForThisDate = callLog.converted_dates && callLog.converted_dates.includes(currentDateKey);
        setConverted(!!isConvertedForThisDate);
        setIsEditMode(false); // Start in view mode for existing calls
        fetchNotes(callLog.id); // Fetch notes for this call log
      } else {
        // Creating new call log - start in edit mode
        setFormData({
          company_name: '',
          contact_name: '',
          email: '',
          phone_number: '',
          notes: ''
        });
        setCallCompleted(false);
        setLeadPotential(0);
        setIsEditMode(true); // Start in edit mode for new calls
        setNotes([]); // Clear notes for new call
      }
      setError('');
      setShowSchedule(false); // Reset schedule when opening
      setShowAddNote(false); // Reset add note form
      setNewNote(''); // Clear new note
    }
  }, [isOpen, callLog]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Special handling for phone number formatting
    if (name === 'phone_number') {
      const formattedValue = formatPhoneNumber(value);
      setFormData(prev => ({
        ...prev,
        [name]: formattedValue
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const callLogData = {
        date: selectedDate,
        ...formData
      };

      // Add schedule data if scheduling is enabled
      if (showSchedule && scheduleData.frequency) {
        callLogData.schedule_frequency = scheduleData.frequency;
        callLogData.schedule_interval = scheduleData.interval;
        callLogData.schedule_end_date = scheduleData.endDate || null;
        callLogData.schedule_custom_days = scheduleData.frequency === 'custom' ? scheduleData.customDays : null;
      }

      if (callLog) {
        // Update existing call log
        await API.put(`/api/calllogs/${callLog.id}`, callLogData, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
      } else {
        // Create new call log
        await API.post('/api/calllogs', callLogData, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
      }

      onSave();
      onClose();
    } catch (err) {
      console.error('Error saving call log:', err);
      setError(err.response?.data?.error || 'Failed to save call log');
    } finally {
      setLoading(false);
    }
  };


  const handleAddNote = async () => {
    if (!newNote.trim() || !callLog) return;

    setLoading(true);
    try {
      await API.post('/api/calllognotes', {
        call_log_id: callLog.id,
        note: newNote.trim()
      }, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      
      setNewNote('');
      setShowAddNote(false);
      fetchNotes(callLog.id); // Refresh notes
    } catch (err) {
      console.error('Error adding note:', err);
      setError(err.response?.data?.error || 'Failed to add note');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }

    setLoading(true);
    try {
      await API.delete(`/api/calllognotes/${noteId}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      
      fetchNotes(callLog.id); // Refresh notes
    } catch (err) {
      console.error('Error deleting note:', err);
      setError(err.response?.data?.error || 'Failed to delete note');
    } finally {
      setLoading(false);
    }
  };

  const handleCallCompletedToggle = async () => {
    if (!callLog) return;

    const newCompletedStatus = !callCompleted;
    
    // Update the state immediately for responsive UI
    setCallCompleted(newCompletedStatus);
    setLoading(true);
    
    try {
      // Create date key for the current date being viewed
      const currentDateKey = new Date(selectedDate).toISOString().split('T')[0];
      
      let response;
      if (newCompletedStatus) {
        // Mark this specific date as completed
        response = await API.post(`/api/calllogs/${callLog.id}/complete-date`, 
          { date: currentDateKey },
          { headers: { Authorization: `Bearer ${user.token}` } }
        );
      } else {
        // Unmark this specific date as completed
        response = await API.post(`/api/calllogs/${callLog.id}/uncomplete-date`, 
          { date: currentDateKey },
          { headers: { Authorization: `Bearer ${user.token}` } }
        );
      }

      // Verify the state matches the server response
      const updatedCallLog = response.data;
      const isCompletedForThisDate = updatedCallLog.completed_dates && updatedCallLog.completed_dates.includes(currentDateKey);
      
      // Only update if there's a mismatch (server error or race condition)
      if (isCompletedForThisDate !== newCompletedStatus) {
        setCallCompleted(isCompletedForThisDate);
      }
      
      // Optimistically update parent calendar state
      if (typeof onToggleCompleteDate === 'function') {
        onToggleCompleteDate(callLog.id, currentDateKey, newCompletedStatus);
      }

      // Show success message briefly
      setError(''); // Clear any previous errors
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000); // Hide after 2 seconds
      
      // Avoid parent refresh to prevent flash; drift is handled on page/month change
      
    } catch (err) {
      console.error('Error updating call completed status:', err);
      // Revert the state on error
      setCallCompleted(!newCompletedStatus);
      setError(err.response?.data?.error || 'Failed to update call status');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllFollowUps = async () => {
    if (!window.confirm('Are you sure you want to cancel ALL future follow-up calls for this contact? This will remove the schedule but keep the current call log.')) {
      return;
    }

    setLoading(true);
    try {
      // Clear the schedule by updating the call log
      const updateData = {
        date: callLog.date,
        company_name: callLog.company_name,
        contact_name: callLog.contact_name,
        email: callLog.email,
        phone_number: callLog.phone_number,
        notes: callLog.notes,
        schedule_frequency: null,
        schedule_interval: null,
        schedule_end_date: null,
        schedule_custom_days: null,
        call_completed: callCompleted
      };

      await API.put(`/api/calllogs/${callLog.id}`, updateData, {
        headers: { Authorization: `Bearer ${user.token}` }
      });

      // Refresh the parent component to update the calendar
      onSave();
      
      // Show success message
      alert(`Successfully cancelled all future follow-up calls for ${callLog.company_name}.`);
      
    } catch (err) {
      console.error('Error cancelling follow-ups:', err);
      setError(err.response?.data?.error || 'Failed to cancel follow-up calls');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!callLog || !window.confirm('Are you sure you want to delete this call log?')) {
      return;
    }

    setLoading(true);
    try {
      await API.delete(`/api/calllogs/${callLog.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      onSave();
      onClose();
    } catch (err) {
      console.error('Error deleting call log:', err);
      setError(err.response?.data?.error || 'Failed to delete call log');
    } finally {
      setLoading(false);
    }
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
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '24px',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0 }}>
            {callLog ? (isEditMode ? 'Edit Call Log' : 'Call Log') : 'Add Call Log'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: '16px', color: '#666' }}>
          <strong>Date:</strong> {selectedDate ? (() => {
            const [year, month, day] = selectedDate.split('-');
            return new Date(year, month - 1, day).toLocaleDateString();
          })() : ''}
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee',
            color: '#c33',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}

        {isEditMode ? (
          <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Company Name 
            </label>
            <input
              type="text"
              name="company_name"
              value={formData.company_name}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Contact Name 
            </label>
            <input
              type="text"
              name="contact_name"
              value={formData.contact_name}
              onChange={handleChange}
              
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Phone Number
            </label>
            <input
              type="tel"
              name="phone_number"
              value={formData.phone_number}
              onChange={handleChange}
              placeholder="(555) 123-4567"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="4"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Schedule Follow-up Section */}
          {showSchedule && (
            <div style={{
              marginTop: '20px',
              padding: '16px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <h4 style={{ margin: '0 0 16px 0', color: '#495057' }}>Schedule Follow-up</h4>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Frequency
                </label>
                <select
                  value={scheduleData.frequency}
                  onChange={(e) => setScheduleData({...scheduleData, frequency: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annually">Annually</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {scheduleData.frequency !== 'custom' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                    Every {scheduleData.frequency === 'daily' ? 'day(s)' : 
                           scheduleData.frequency === 'weekly' ? 'week(s)' :
                           scheduleData.frequency === 'monthly' ? 'month(s)' : 'year(s)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={scheduleData.interval}
                    onChange={(e) => setScheduleData({...scheduleData, interval: parseInt(e.target.value) || 1})}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              )}

              {scheduleData.frequency === 'custom' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    Select Days of Week
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => (
                      <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={scheduleData.customDays.includes(index)}
                          onChange={(e) => {
                            const newDays = e.target.checked 
                              ? [...scheduleData.customDays, index]
                              : scheduleData.customDays.filter(d => d !== index);
                            setScheduleData({...scheduleData, customDays: newDays});
                          }}
                        />
                        <span style={{ fontSize: '14px' }}>{day}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  value={scheduleData.endDate}
                  onChange={(e) => setScheduleData({...scheduleData, endDate: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ 
                padding: '12px', 
                backgroundColor: '#e7f3ff', 
                borderRadius: '4px',
                fontSize: '14px',
                color: '#0066cc'
              }}>
                <strong>Preview:</strong> This will create follow-up call logs based on your schedule. 
                {scheduleData.frequency === 'daily' && ` Every ${scheduleData.interval} day(s).`}
                {scheduleData.frequency === 'weekly' && ` Every ${scheduleData.interval} week(s).`}
                {scheduleData.frequency === 'monthly' && ` Every ${scheduleData.interval} month(s).`}
                {scheduleData.frequency === 'annually' && ` Every ${scheduleData.interval} year(s).`}
                {scheduleData.frequency === 'custom' && ` On selected days: ${scheduleData.customDays.map(d => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d]).join(', ')}.`}
                {scheduleData.endDate && ` Until ${new Date(scheduleData.endDate).toLocaleDateString()}.`}
              </div>
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}>
            {callLog && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setShowSchedule(!showSchedule)}
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                marginRight: '8px'
              }}
            >
              {showSchedule ? 'Hide Schedule' : 'Schedule'}
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Saving...' : (callLog ? 'Update' : 'Save')}
            </button>
          </div>
        </form>
        ) : (
          // View Mode - Call Log Format
          <div>
            {/* Company Info Header */}
            <div style={{
              backgroundColor: '#f8f9fa',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid #e9ecef'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', color: '#212529', fontSize: '20px' }}>
                    {formData.company_name || 'No Company Name'}
                  </h3>
                  <p style={{ margin: '0 0 4px 0', color: '#6c757d', fontSize: '16px' }}>
                    {formData.contact_name || 'No Contact Name'}
                  </p>
                </div>
                <button
                  onClick={() => setIsEditMode(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '4px',
                    color: '#6c757d',
                    fontSize: '16px'
                  }}
                  title="Edit call log"
                >
                  ✏️
                </button>
              </div>
              
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {formData.email && (
                  <div>
                    <strong style={{ color: '#495057', fontSize: '14px' }}>Email:</strong>
                    <a href={`mailto:${formData.email}`} style={{ 
                      color: '#007bff', 
                      textDecoration: 'none', 
                      marginLeft: '8px',
                      fontSize: '14px'
                    }}>
                      {formData.email}
                    </a>
                  </div>
                )}
                {formData.phone_number && (
                  <div>
                    <strong style={{ color: '#495057', fontSize: '14px' }}>Phone:</strong>
                    <a href={`tel:${formData.phone_number}`} style={{ 
                      color: '#007bff', 
                      textDecoration: 'none', 
                      marginLeft: '8px',
                      fontSize: '14px'
                    }}>
                      {formData.phone_number}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Call Completed Checkbox */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px',
              padding: '12px',
              backgroundColor: callCompleted ? '#d4edda' : '#fff3cd',
              border: `1px solid ${callCompleted ? '#c3e6cb' : '#ffeaa7'}`,
              borderRadius: '8px',
              opacity: loading ? 0.6 : 1
            }}>
              <input
                type="checkbox"
                id="callCompleted"
                checked={callCompleted}
                onChange={handleCallCompletedToggle}
                disabled={loading}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              />
              <label 
                htmlFor="callCompleted" 
                style={{
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  color: callCompleted ? '#155724' : '#856404',
                  fontSize: '16px',
                  margin: 0
                }}
              >
                {loading ? '⏳ Updating...' : (callCompleted ? '✅ Call Completed' : '📞 Call Pending')}
                {saveSuccess && (
                  <span style={{ 
                    fontSize: '12px', 
                    marginLeft: '8px', 
                    color: '#28a745',
                    fontWeight: 'bold'
                  }}>
                    ✓ Saved
                  </span>
                )}
              </label>
            </div>

            {/* Converted Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px',
              padding: '12px',
              backgroundColor: converted ? '#d1fae5' : '#f8f9fa',
              border: `1px solid ${converted ? '#a7f3d0' : '#e9ecef'}`,
              borderRadius: '8px',
              opacity: loading ? 0.6 : 1
            }}>
              <button
                type="button"
                onClick={async () => {
                  if (!callLog) return;
                  const newVal = !converted;
                  setConverted(newVal);
                  const currentDateKey = new Date(selectedDate).toISOString().split('T')[0];
                  // Optimistic calendar update
                  if (typeof onToggleCompleteDate === 'function') {
                    // completion callback is separate; here we only affect converted state via server + manual UI
                  }
                  try {
                    const response = await API.post(`/api/calllogs/${callLog.id}/convert-date`, {
                      date: currentDateKey,
                      converted: newVal
                    }, {
                      headers: { Authorization: `Bearer ${user.token}` }
                    });
                    if (typeof onToggleConvertedDate === 'function') {
                      onToggleConvertedDate(callLog.id, currentDateKey, newVal);
                    }
                  } catch (e) {
                    setConverted(!newVal);
                  }
                }}
                style={{
                  backgroundColor: converted ? '#22c55e' : '#e5e7eb',
                  color: converted ? 'white' : '#374151',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {converted ? 'Converted ✔' : 'Converted to Sales/Service'}
              </button>
              <span style={{ color: '#6b7280', fontSize: 13 }}>
                Turns this day’s pill green.
              </span>
            </div>

            {/* Lead Potential Selector */}
            <div style={{
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '14px', color: '#495057' }}>Lead potential:</span>
              {[1,2,3].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const newVal = val;
                    setLeadPotential(newVal);
                    if (!callLog) return;
                    try {
                      // Optimistic update in calendar pills
                      if (typeof onUpdateLeadPotential === 'function') {
                        onUpdateLeadPotential(callLog.id, newVal);
                      }
                      await API.put(`/api/calllogs/${callLog.id}`, {
                        date: callLog.date,
                        company_name: callLog.company_name,
                        contact_name: callLog.contact_name,
                        email: callLog.email,
                        phone_number: callLog.phone_number,
                        notes: callLog.notes,
                        schedule_frequency: callLog.schedule_frequency,
                        schedule_interval: callLog.schedule_interval,
                        schedule_end_date: callLog.schedule_end_date,
                        schedule_custom_days: callLog.schedule_custom_days,
                        call_completed: callCompleted,
                        completed_dates: callLog.completed_dates || [],
                        lead_potential: newVal
                      }, {
                        headers: { Authorization: `Bearer ${user.token}` }
                      });
                      // No full refresh to avoid flash
                    } catch (err) {
                      console.error('Error updating lead potential:', err);
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '16px',
                    color: val <= (leadPotential || 0) ? '#f5c518' : '#dee2e6'
                  }}
                  title={`${val} star${val>1?'s':''}`}
                >
                  ★
                </button>
              ))}
            </div>

            {/* Call Log Notes */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <h4 style={{ margin: 0, color: '#495057' }}>Call Log</h4>
                <button
                  onClick={() => setShowAddNote(!showAddNote)}
                  style={{
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Add new note"
                >
                  +
                </button>
              </div>

              {/* Add Note Form */}
              {showAddNote && (
                <div style={{
                  backgroundColor: '#f8f9fa',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  border: '1px solid #e9ecef'
                }}>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a new note about this call..."
                    rows="3"
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px',
                      resize: 'vertical',
                      marginBottom: '12px'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        setShowAddNote(false);
                        setNewNote('');
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || loading}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: newNote.trim() && !loading ? 'pointer' : 'not-allowed',
                        opacity: newNote.trim() && !loading ? 1 : 0.6
                      }}
                    >
                      {loading ? 'Adding...' : 'Add Note'}
                    </button>
                  </div>
                </div>
              )}

              {/* Notes List */}
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {notes.length === 0 && !formData.notes ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '20px',
                    color: '#6c757d',
                    fontStyle: 'italic'
                  }}>
                    No notes yet. Click the + button to add your first note.
                  </div>
                ) : (
                  <>
                    {/* Show additional notes (most recent first) */}
                    {notes.map((note, index) => (
                      <div key={note.id} style={{
                        backgroundColor: 'white',
                        border: '1px solid #e9ecef',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '12px',
                        position: 'relative'
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '8px'
                        }}>
                          <div style={{
                            fontSize: '12px',
                            color: '#6c757d',
                            fontWeight: 'bold'
                          }}>
                            {new Date(note.created_at).toLocaleString()}
                            {note.created_by && (
                              <span style={{ marginLeft: '8px' }}>
                                by {note.created_by}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            disabled={loading}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              padding: '4px',
                              borderRadius: '4px',
                              color: '#dc3545',
                              fontSize: '14px',
                              opacity: loading ? 0.6 : 1
                            }}
                            title="Delete note"
                          >
                            🗑️
                          </button>
                        </div>
                        <div style={{
                          fontSize: '14px',
                          color: '#495057',
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {note.note}
                        </div>
                      </div>
                    ))}

                    {/* Show initial note from call log at the bottom if it exists */}
                    {formData.notes && (
                      <div style={{
                        backgroundColor: 'white',
                        border: '1px solid #e9ecef',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '12px',
                        position: 'relative'
                      }}>
                        <div style={{
                          fontSize: '12px',
                          color: '#6c757d',
                          marginBottom: '8px',
                          fontWeight: 'bold'
                        }}>
                          {callLog?.created_at ? new Date(callLog.created_at).toLocaleString() : 'Initial call'}
                          {callLog?.created_by && (
                            <span style={{ marginLeft: '8px' }}>
                              by {callLog.created_by}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: '14px',
                          color: '#495057',
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {formData.notes}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Action buttons for view mode */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              marginTop: '20px'
            }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDeleteAllFollowUps}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#fd7e14',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
                title="Delete all future follow-up calls for this contact"
              >
                {loading ? 'Deleting...' : 'Delete All Follow-ups'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallLogModal;
