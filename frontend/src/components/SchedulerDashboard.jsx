import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { getStatusColor } from '../utils/statusColors';
import NotificationBell from './NotificationBell';
import AssignWorkOrderForm from './AssignWorkOrderForm';
import GLLSLogo from '../assets/GLLSLogo.png';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import logoBase64 from '../assets/logoBase64';


// Constants
const SHOP_OPTIONS = [
  { value: 'All Shops', label: 'All Shops' },
  { value: 'Texas Shop', label: 'Texas Shop' },
  { value: 'Florida Shop', label: 'Florida Shop' },
  { value: 'Peotone Shop', label: 'Peotone Shop' }
];

const VIEW_OPTIONS = [
  { value: 'calendar', label: 'Calendar View' },
  { value: 'list', label: 'List View' },
  { value: 'technician', label: 'By Technician' }
];

// Utility functions
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  
  // Handle YYYY-MM-DD format directly to avoid timezone issues
  if (dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(month)}/${parseInt(day)}/${year}`;
  }
  
  // Fallback to original method for other formats
  const date = new Date(dateStr);
  return isNaN(date) ? "" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  return timeStr;
};

const getDateKey = (dateStr) => {
  if (!dateStr) return '';
  
  // Handle YYYY-MM-DD format directly to avoid timezone issues
  if (typeof dateStr === 'string' && dateStr.includes('-') && dateStr.length >= 10) {
    // Extract just the date part (YYYY-MM-DD) from any datetime string
    const datePart = dateStr.split('T')[0].split(' ')[0];
    if (datePart.length === 10) {
      return datePart; // Already in YYYY-MM-DD format
    }
  }
  
  // Fallback to original method for other formats
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Utility functions for PDF generation
const drawRoundedRect = (doc, x, y, width, height, radius = 3) => {
  doc.roundedRect(x, y, width, height, radius, radius);
};

// Professional PDF Generation function matching manager dashboard style
const generatePickupPDF = (formData) => {
  try {
    const doc = new jsPDF({ margin: 20 });
    const leftMargin = 20;
    const rightMargin = 20;
    const topMargin = 20;
    const bottomMargin = 20;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    let y = 20;

    // Header with logo and title
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 13, y - 10, 93.75, 15);
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`Pickup Schedule`, leftMargin, y + 15);
    y += 25;

    // Pickup Information Section
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    const info = [
      ["Scheduled Date", formatDate(formData.pickupDate)],
      ["Company", formData.companyName],
      ["PO Number", formData.poNumber || ""],
      ["Address", formData.address ? `${formData.address}, ${formData.city}, ${formData.state} ${formData.zipcode}` : 'Not provided'],
      ["Contact", `${formData.contactName || ""} (${formData.phoneNumber || ""})`],
      ["Email", formData.email || 'Not provided'],
      ["Make / Model / Serial", `${formData.make} / ${formData.model || 'N/A'} / ${formData.serialNumber || 'N/A'}`],
      ["Shop", formData.shop],
      ["Status", "Scheduled"]
    ];

    const infoStartY = y + 5;
    let currentInfoY = infoStartY;

    info.forEach(([label, value]) => {
      if (currentInfoY > pageHeight - 40) {
        doc.addPage();
        currentInfoY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`${label}:`, leftMargin, currentInfoY);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(value || 'N/A', 120);
      doc.text(lines, leftMargin + 60, currentInfoY);
      
      currentInfoY += Math.max(lines.length * 4, 12);
    });

    // Notes Section
    if (formData.notes) {
      currentInfoY += 10;
      
      if (currentInfoY > pageHeight - 60) {
        doc.addPage();
        currentInfoY = 20;
      }

      // Notes header with rounded rectangle
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Notes:", leftMargin, currentInfoY);
      currentInfoY += 8;

      // Notes content in rounded rectangle
      const notesStartY = currentInfoY;
      const notesLines = doc.splitTextToSize(formData.notes, 160);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(notesLines, leftMargin + 5, currentInfoY);
      
      const notesHeight = Math.max(notesLines.length * 4 + 10, 20);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      drawRoundedRect(doc, leftMargin, notesStartY - 5, 160, notesHeight, 4);
      
      currentInfoY += notesHeight - 5;
    }

    // Pick up Confirmation Section
    currentInfoY += 10;
    
    if (currentInfoY > pageHeight - 50) {
      doc.addPage();
      currentInfoY = 20;
    }

    // Split confirmation boxes
    const confirmationStartY = currentInfoY;
    const confirmationHeight = 45;
    const boxWidth = 75; // Width for each half
    const rightBoxStartX = leftMargin + boxWidth + 10; // 10px gap between boxes
    
    // Left box - Pick up Confirmation
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    drawRoundedRect(doc, leftMargin, confirmationStartY, boxWidth, confirmationHeight, 4);
    
    // Pick up Confirmation title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Pick up Confirmation", leftMargin + 5, confirmationStartY + 8);
    
    // Pick up signature lines
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Signature: ________________________", leftMargin + 5, confirmationStartY + 20);
    doc.text("Printed Name: ____________________", leftMargin + 5, confirmationStartY + 30);
    doc.text("Date: ____________________________", leftMargin + 5, confirmationStartY + 40);
    
    // Right box - Drop off Information
    drawRoundedRect(doc, rightBoxStartX, confirmationStartY, boxWidth, confirmationHeight, 4);
    
    // Drop off Information title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Drop off Confirmation", rightBoxStartX + 5, confirmationStartY + 8);
    
    // Drop off signature lines
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Signature: ________________________", rightBoxStartX + 5, confirmationStartY + 20);
    doc.text("Printed Name: ____________________", rightBoxStartX + 5, confirmationStartY + 30);
    doc.text("Date: ____________________________", rightBoxStartX + 5, confirmationStartY + 40);

    // Footer
    const footerY = pageHeight - 15;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated: ${new Date().toLocaleString()}`, leftMargin, footerY);
    doc.text('GLLS Work Orders System', pageWidth - rightMargin, footerY, { align: "right" });

    return doc;
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw error;
  }
};

// Custom hooks
const useWorkOrders = (user) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!user?.token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await API.get('/workorders', { 
        headers: { Authorization: `Bearer ${user.token}` } 
      });
      setOrders(res.data);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setError('Failed to load work orders. Please refresh the page.');
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

const useScheduledPickups = (user) => {
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPickups = useCallback(async () => {
    if (!user?.token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await API.get('/api/scheduler', { 
        headers: { Authorization: `Bearer ${user.token}` } 
      });
      setPickups(res.data);
    } catch (err) {
      console.error('Failed to fetch scheduled pickups:', err);
      setError('Failed to load scheduled pickups. Please refresh the page.');
      setPickups([]);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    fetchPickups();
  }, [fetchPickups]);

  return { pickups, loading, error, refetch: fetchPickups };
};

const useShopFilter = () => {
  const [shopFilter, setShopFilter] = useState(() => 
    localStorage.getItem('schedulerShopFilter') || 'All Shops'
  );

  const updateShopFilter = useCallback((newFilter) => {
    setShopFilter(newFilter);
    localStorage.setItem('schedulerShopFilter', newFilter);
  }, []);

  return { shopFilter, updateShopFilter };
};

// Schedule Pickup Modal Component
const SchedulePickupModal = ({ isOpen, onClose, onSave, initialDate = null }) => {
  const [form, setForm] = useState({
    companyName: '',
    address: '',
    city: '',
    state: '',
    zipcode: '',
    contactName: '',
    phoneNumber: '',
    email: '',
    poNumber: '',
    make: '',
    model: '',
    serialNumber: '',
    shop: '',
    pickupDate: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [makeModelMap, setMakeModelMap] = useState({});
  const prevMakeRef = useRef();

  // Fetch Make/Model list from backend when component mounts
  useEffect(() => {
    API.get('/api/masters/makes-models')
      .then(res => {
        // Expecting array of [make, model]
        const map = {};
        res.data.forEach(([make, model]) => {
          if (!map[make]) map[make] = [];
          map[make].push(model);
        });
        setMakeModelMap(map);
        setMakes(Object.keys(map));
      })
      .catch(() => setMakes([]));
  }, []);

  // Handle make selection and update models
  useEffect(() => {
    if (form.make && makeModelMap[form.make]) {
      setModels(makeModelMap[form.make]);
      // Only clear the model if the make actually changed (not on mount)
      if (prevMakeRef.current !== undefined && prevMakeRef.current !== form.make) {
        setForm(prev => ({ ...prev, model: '' }));
      }
      prevMakeRef.current = form.make;
    } else {
      setModels([]);
    }
  }, [form.make, makeModelMap]);

  // Set initial date when modal opens
  useEffect(() => {
    if (isOpen && initialDate) {
      // Ensure initialDate is a Date object
      const date = initialDate instanceof Date ? initialDate : new Date(initialDate);
      if (!isNaN(date.getTime())) {
        const dateString = date.toISOString().split('T')[0];
        setForm(prev => ({ ...prev, pickupDate: dateString }));
      }
    }
  }, [isOpen, initialDate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Format phone number
    if (name === 'phoneNumber') {
      const formatted = formatPhoneNumber(value);
      setForm(prev => ({ ...prev, [name]: formatted }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatPhoneNumber = (value) => {
    // Remove all non-numeric characters
    const phoneNumber = value.replace(/\D/g, '');
    
    // Don't format if empty
    if (!phoneNumber) return '';
    
    // Don't format if it's too long
    if (phoneNumber.length > 10) return value;
    
    // Format based on length
    if (phoneNumber.length < 4) {
      return `(${phoneNumber}`;
    } else if (phoneNumber.length < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    } else {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    
    try {
      await onSave(form);
      setForm({
        companyName: '',
        address: '',
        city: '',
        state: '',
        zipcode: '',
        contactName: '',
        phoneNumber: '',
        email: '',
        make: '',
        model: '',
        serialNumber: '',
        shop: '',
        pickupDate: '',
        notes: ''
      });
      onClose();
    } catch (error) {
      console.error('Failed to save pickup schedule:', error);
      alert('Failed to save pickup schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleAndPrint = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Save the pickup first
      await onSave(form);
      
      // Generate and open PDF
      const pdf = generatePickupPDF(form);
      const pdfUrl = pdf.output('bloburl');
      window.open(pdfUrl, '_blank');
      
      // Reset form
      setForm({
        companyName: '',
        address: '',
        city: '',
        state: '',
        zipcode: '',
        contactName: '',
        phoneNumber: '',
        email: '',
        make: '',
        model: '',
        serialNumber: '',
        shop: '',
        pickupDate: '',
        notes: ''
      });
      onClose();
    } catch (error) {
      console.error('Failed to save pickup schedule:', error);
      alert('Failed to save pickup schedule. Please try again.');
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
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: 8,
        padding: 30,
        width: '90%',
        maxWidth: 600,
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 20, textAlign: 'center' }}>
          Schedule Pick-up
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Company Name *
              </label>
              <input
                type="text"
                name="companyName"
                value={form.companyName}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                PO Number *
              </label>
              <input
                type="text"
                name="poNumber"
                value={form.poNumber}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Shop *
              </label>
              <select
                name="shop"
                value={form.shop}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              >
                <option value="">Select Shop</option>
                <option value="Texas Shop">Texas Shop</option>
                <option value="Florida Shop">Florida Shop</option>
                <option value="Peotone Shop">Peotone Shop</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Pick-up Date *
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="date"
                name="pickupDate"
                value={form.pickupDate}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '8px 40px 8px 8px',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
                onClick={(e) => e.target.showPicker && e.target.showPicker()}
              />
              <button
                type="button"
                onClick={(e) => {
                  const dateInput = e.target.previousElementSibling;
                  dateInput.focus();
                  dateInput.showPicker && dateInput.showPicker();
                }}
                style={{
                  position: 'absolute',
                  right: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  fontSize: 16,
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Open calendar"
              >
                📅
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Address
            </label>
            <input
              type="text"
              name="address"
              value={form.address}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                City
              </label>
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                State
              </label>
              <input
                type="text"
                name="state"
                value={form.state}
                onChange={handleChange}
                
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Zipcode 
              </label>
              <input
                type="text"
                name="zipcode"
                value={form.zipcode}
                onChange={handleChange}
                
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Contact Name *
              </label>
              <input
                type="text"
                name="contactName"
                value={form.contactName}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Phone Number *
              </label>
              <input
                type="tel"
                name="phoneNumber"
                value={form.phoneNumber}
                onChange={handleChange}
                placeholder="(555) 123-4567"
                required
                maxLength="14"
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Email 
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Make *
              </label>
              <select
                name="make"
                value={form.make}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              >
                <option value="">-- Select Make --</option>
                {makes.map(make => (
                  <option key={make} value={make}>{make}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Model 
              </label>
              <select
                name="model"
                value={form.model}
                onChange={handleChange}
                
                disabled={!form.make}
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              >
                <option value="">-- Select Model --</option>
                {models.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Serial Number 
            </label>
            <input
              type="text"
              name="serialNumber"
              value={form.serialNumber}
              onChange={handleChange}
              
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Notes
            </label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Additional notes about the pickup..."
              rows={3}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'Arial, sans-serif',
                resize: 'vertical',
                minHeight: '60px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleScheduleAndPrint}
              disabled={loading}
              style={{
                padding: '10px 20px',
                background: loading ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {loading ? 'Saving...' : '📄 Schedule & Print PDF'}
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                background: loading ? '#9ca3af' : '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 14
              }}
            >
              {loading ? 'Saving...' : 'Schedule Pick-up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Edit Pickup Modal Component
const EditPickupModal = ({ isOpen, onClose, onSave, onDelete, onCompleteAndAssign, pickupData }) => {
  const [form, setForm] = useState({
    companyName: '',
    address: '',
    city: '',
    state: '',
    zipcode: '',
    contactName: '',
    phoneNumber: '',
    email: '',
    poNumber: '',
    make: '',
    model: '',
    serialNumber: '',
    shop: '',
    pickupDate: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [makeModelMap, setMakeModelMap] = useState({});
  const prevMakeRef = useRef('');

  // Format phone number utility
  const formatPhoneNumber = (value) => {
    const phoneNumber = value.replace(/[^\d]/g, '');
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength < 4) return phoneNumber;
    if (phoneNumberLength < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  // Load pickup data when modal opens
  useEffect(() => {
    if (isOpen && pickupData) {
      // Format the pickup date for the date input (YYYY-MM-DD format)
      const formatDateForInput = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date)) return '';
        return date.toISOString().split('T')[0];
      };

      setForm({
        companyName: pickupData.company_name || '',
        address: pickupData.address || '',
        city: pickupData.city || '',
        state: pickupData.state || '',
        zipcode: pickupData.zipcode || '',
        contactName: pickupData.contact_name || '',
        phoneNumber: pickupData.phone_number || '',
        email: pickupData.email || '',
        poNumber: pickupData.po_number || '',
        make: pickupData.make || '',
        model: pickupData.model || '',
        serialNumber: pickupData.serial_number || '',
        shop: pickupData.shop || '',
        pickupDate: formatDateForInput(pickupData.pickup_date),
        notes: pickupData.notes || ''
      });
      // Initialize the prevMakeRef to prevent clearing the model on initial load
      prevMakeRef.current = pickupData.make || '';
    }
  }, [isOpen, pickupData]);

  // Fetch makes and models
  useEffect(() => {
    const fetchMakesModels = async () => {
      try {
        const response = await API.get('/api/masters/makes-models');
        // Expecting array of [make, model] pairs
        const map = {};
        response.data.forEach(([make, model]) => {
          if (!map[make]) map[make] = [];
          map[make].push(model);
        });
        setMakeModelMap(map);
        setMakes(Object.keys(map));
      } catch (error) {
        console.error('Failed to fetch makes and models:', error);
      }
    };

    if (isOpen) {
      fetchMakesModels();
    }
  }, [isOpen]);

  // Update models when make changes
  useEffect(() => {
    if (form.make && makeModelMap && makeModelMap[form.make]) {
      setModels(makeModelMap[form.make]);
      // Clear model if make changed
      if (prevMakeRef.current !== form.make) {
        setForm(prev => ({ ...prev, model: '' }));
        prevMakeRef.current = form.make;
      }
    } else {
      setModels([]);
    }
  }, [form.make, makeModelMap]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'phoneNumber') {
      const formatted = formatPhoneNumber(value);
      setForm(prev => ({ ...prev, [name]: formatted }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await onSave(pickupData.id, form);
      setForm({
        companyName: '', address: '', city: '', state: '', zipcode: '',
        contactName: '', phoneNumber: '', email: '', poNumber: '', make: '', model: '',
        serialNumber: '', shop: '', pickupDate: ''
      });
    } catch (error) {
      console.error('Failed to update pickup:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to cancel this pickup? This action cannot be undone.')) {
      setLoading(true);
      try {
        await onDelete(pickupData.id);
        setForm({
          companyName: '', address: '', city: '', state: '', zipcode: '',
          contactName: '', phoneNumber: '', email: '', make: '', model: '',
          serialNumber: '', shop: '', pickupDate: ''
        });
      } catch (error) {
        console.error('Failed to delete pickup:', error);
      } finally {
        setLoading(false);
      }
    } else {
    }
  };

  const handleCompleteAndAssign = () => {
    onCompleteAndAssign(pickupData);
  };

  const handlePrintPDF = () => {
    // Generate and open PDF
    const pdf = generatePickupPDF(form);
    const pdfUrl = pdf.output('bloburl');
    window.open(pdfUrl, '_blank');
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
        padding: 24,
        borderRadius: 8,
        width: '90%',
        maxWidth: 600,
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 20 }}>Edit Pick-up</h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Company Name *
              </label>
              <input
                type="text"
                name="companyName"
                value={form.companyName}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                PO Number *
              </label>
              <input
                type="text"
                name="poNumber"
                value={form.poNumber}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Shop *
              </label>
              <select
                name="shop"
                value={form.shop}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              >
                <option value="">Select Shop</option>
                <option value="Texas Shop">Texas Shop</option>
                <option value="Florida Shop">Florida Shop</option>
                <option value="Peotone Shop">Peotone Shop</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Pick-up Date *
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="date"
                name="pickupDate"
                value={form.pickupDate}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '8px 40px 8px 8px',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
                onClick={(e) => e.target.showPicker && e.target.showPicker()}
              />
              <button
                type="button"
                onClick={(e) => {
                  const dateInput = e.target.previousElementSibling;
                  dateInput.focus();
                  dateInput.showPicker && dateInput.showPicker();
                }}
                style={{
                  position: 'absolute',
                  right: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  fontSize: 16,
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Open calendar"
              >
                📅
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Address
            </label>
            <input
              type="text"
              name="address"
              value={form.address}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                City
              </label>
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}

                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                State
              </label>
              <input
                type="text"
                name="state"
                value={form.state}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Zipcode
              </label>
              <input
                type="text"
                name="zipcode"
                value={form.zipcode}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Contact Name *
              </label>
              <input
                type="text"
                name="contactName"
                value={form.contactName}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Phone Number *
              </label>
              <input
                type="tel"
                name="phoneNumber"
                value={form.phoneNumber}
                onChange={handleChange}
                placeholder="(555) 123-4567"
                required
                maxLength="14"
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Email
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Make *
              </label>
              <select
                name="make"
                value={form.make}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              >
                <option value="">-- Select Make --</option>
                {makes && makes.map(make => (
                  <option key={make} value={make}>{make}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Model
              </label>
              <select
                name="model"
                value={form.model}
                onChange={handleChange}
                disabled={!form.make}
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              >
                <option value="">-- Select Model --</option>
                {models && models.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Serial Number
            </label>
            <input
              type="text"
              name="serialNumber"
              value={form.serialNumber}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Notes
            </label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Additional notes about the pickup..."
              rows={3}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'Arial, sans-serif',
                resize: 'vertical',
                minHeight: '60px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 4,
                  backgroundColor: '#ef4444',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                {loading ? 'Deleting...' : 'Cancel Pick-up'}
              </button>
              <button
                type="button"
                onClick={handleCompleteAndAssign}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 4,
                  backgroundColor: '#2563eb',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                Complete Pick-up & Assign
              </button>
              <button
                type="button"
                onClick={handlePrintPDF}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 4,
                  backgroundColor: '#059669',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                📄 Print PDF
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 4,
                  backgroundColor: '#10b981',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 14
                }}
              >
                {loading ? 'Updating...' : 'Update Pick-up'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// Advanced Filter Modal Component
const AdvancedFilterModal = ({ isOpen, onClose, onApply, orders, pickups }) => {
  const [filters, setFilters] = useState({
    technician: '',
    make: '',
    model: '',
    status: '',
    company: '',
    shop: 'All Shops',
    workOrderNo: ''
  });

  // Get unique values for dropdowns
  const technicians = useMemo(() => {
    const techs = new Set();
    orders.forEach(order => {
      if (order.timeLogs && order.timeLogs.length > 0) {
        order.timeLogs.forEach(log => {
          if (log.technicianAssigned) {
            techs.add(log.technicianAssigned);
          }
        });
      }
    });
    return Array.from(techs).sort();
  }, [orders]);

  const makes = useMemo(() => {
    const makeSet = new Set();
    orders.forEach(order => {
      if (order.make) makeSet.add(order.make);
    });
    pickups.forEach(pickup => {
      if (pickup.make) makeSet.add(pickup.make);
    });
    return Array.from(makeSet).sort();
  }, [orders, pickups]);

  const models = useMemo(() => {
    const modelSet = new Set();
    orders.forEach(order => {
      if (order.model) modelSet.add(order.model);
    });
    pickups.forEach(pickup => {
      if (pickup.model) modelSet.add(pickup.model);
    });
    return Array.from(modelSet).sort();
  }, [orders, pickups]);

  const statuses = useMemo(() => {
    const statusSet = new Set();
    orders.forEach(order => {
      if (order.status) statusSet.add(order.status);
      if (order.statusHistory && Array.isArray(order.statusHistory)) {
        order.statusHistory.forEach(entry => {
          if (entry.status) statusSet.add(entry.status);
        });
      }
    });
    return Array.from(statusSet).sort();
  }, [orders]);

  const companies = useMemo(() => {
    const companySet = new Set();
    orders.forEach(order => {
      if (order.companyName) companySet.add(order.companyName);
    });
    pickups.forEach(pickup => {
      if (pickup.company_name) companySet.add(pickup.company_name);
    });
    return Array.from(companySet).sort();
  }, [orders, pickups]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleClear = () => {
    setFilters({
      technician: '',
      make: '',
      model: '',
      status: '',
      company: '',
      shop: 'All Shops',
      workOrderNo: ''
    });
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
        padding: 24,
        borderRadius: 8,
        width: '90%',
        maxWidth: 600,
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 20 }}>Advanced Filter</h2>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            Work Order #
          </label>
          <input
            type="text"
            value={filters.workOrderNo}
            onChange={(e) => handleFilterChange('workOrderNo', e.target.value)}
            placeholder="Enter work order number..."
            style={{
              width: '100%',
              padding: 8,
              border: '1px solid #ccc',
              borderRadius: 4,
              fontSize: 14
            }}
          />
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Technician
            </label>
            <select
              value={filters.technician}
              onChange={(e) => handleFilterChange('technician', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            >
              <option value="">All Technicians</option>
              {technicians.map(tech => (
                <option key={tech} value={tech}>{tech}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Shop
            </label>
            <select
              value={filters.shop}
              onChange={(e) => handleFilterChange('shop', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            >
              <option value="All Shops">All Shops</option>
              <option value="Texas Shop">Texas Shop</option>
              <option value="Florida Shop">Florida Shop</option>
              <option value="Peotone Shop">Peotone Shop</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Make
            </label>
            <select
              value={filters.make}
              onChange={(e) => handleFilterChange('make', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            >
              <option value="">All Makes</option>
              {makes.map(make => (
                <option key={make} value={make}>{make}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Model
            </label>
            <select
              value={filters.model}
              onChange={(e) => handleFilterChange('model', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            >
              <option value="">All Models</option>
              {models.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            >
              <option value="">All Statuses</option>
              {statuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Company
            </label>
            <select
              value={filters.company}
              onChange={(e) => handleFilterChange('company', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            >
              <option value="">All Companies</option>
              {companies.map(company => (
                <option key={company} value={company}>{company}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: '8px 16px',
              border: '1px solid #ccc',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid #ccc',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 4,
              backgroundColor: '#2563eb',
              color: 'white',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

// Sub-components
const Header = ({ onLogout, onRefresh, user, onSchedulePickup }) => (
  <div className="header-container" style={{
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
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
        marginTop: 10,
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
      
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        width: '100%', 
        margin: '0 auto 20px auto'
      }}>
        <h1 style={{ 
          textAlign: 'left', 
          marginTop: '50px', 
          fontFamily: 'Arial, sans-serif',
          fontSize: 'clamp(40px, 4vw, 24px)',
          whiteSpace: 'nowrap'
        }}>
          Scheduler Dashboard
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', marginTop: '25px', justifyContent: 'center', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <span style={{ fontSize: '20px', fontWeight: 'bold' }}>Notifications</span>
          <NotificationBell user={user}/>
        </div>
        
        {/* Color Legend */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: '8px', 
          marginTop: '25px', 
          position: 'absolute', 
          right: '26%',
          transform: 'translateX(-50%)'
        }}>
          <span style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>Status Legend</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: '#2563eb', borderRadius: '2px' }}></div>
              <span>Assigned</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: '#10b981', borderRadius: '2px' }}></div>
              <span>In Progress</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: '#8b5cf6', borderRadius: '2px' }}></div>
              <span>Completed, Pending Approval</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: '#facc15', borderRadius: '2px' }}></div>
              <span>Submitted for Billing</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: '#dc2626', borderRadius: '2px' }}></div>
              <span>In Progress,Pending Parts</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: '#f97316', borderRadius: '2px' }}></div>
              <span>Scheduled Pickup</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: '#f97316', borderRadius: '2px', opacity: 0.7, textDecoration: 'line-through' }}></div>
              <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>Completed Pickup</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: '#94a3b8', borderRadius: '2px' }}></div>
              <span>Closed</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="header-right" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'stretch',
      flex: '0 1 auto'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '10px',
        marginTop: '10px'
      }}>
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
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '10px'
      }}>
        <button
          style={{
            background: '#f97316',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '16px',
            padding: '10px 20px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
          onClick={() => onSchedulePickup(new Date())}
          aria-label="Schedule a pick-up"
        >
          Schedule Service
        </button>
      </div>
    </div>
  </div>
);

const FilterControls = ({ shopFilter, onShopFilterChange, viewType, onViewTypeChange, onAdvancedFilter, onAtAGlance }) => (
  <div style={{ 
    marginBottom: 28, 
    marginLeft: 30, 
    marginRight: 30,
    display: "flex", 
    flexDirection: 'row',
    gap: 16, 
    fontFamily: 'Arial, sans-serif',
    flexWrap: 'wrap',
    alignItems: 'center'
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
      aria-label="Filter work orders by shop location"
    >
      {SHOP_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>

    <label style={{ 
      fontWeight: 700, 
      fontSize: 'clamp(14px, 3vw, 18px)', 
      marginLeft: 20,
      marginRight: 12,
      whiteSpace: 'nowrap'
    }} htmlFor="view-type">
      View:
    </label>
    <select
      id="view-type"
      value={viewType}
      onChange={e => onViewTypeChange(e.target.value)}
      style={{ 
        fontSize: 'clamp(14px, 3vw, 18px)', 
        padding: "6px 16px", 
        borderRadius: 8, 
        minWidth: 150,
        maxWidth: '180px'
      }}
      aria-label="Select view type"
    >
      {VIEW_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>

    <button
      onClick={onAdvancedFilter}
      style={{
        fontSize: 'clamp(14px, 3vw, 18px)',
        padding: "6px 16px",
        borderRadius: 8,
        backgroundColor: '#2563eb',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 600,
        marginLeft: 20,
        whiteSpace: 'nowrap'
      }}
      aria-label="Open advanced filter options"
    >
      Advanced Filter
    </button>
    <button
      onClick={onAtAGlance}
      style={{
        padding: '8px 16px',
        backgroundColor: '#10b981',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        marginLeft: '10px'
      }}
      aria-label="View pickup summary"
    >
      At a Glance
    </button>
  </div>
);

// At a Glance Modal Component
const AtAGlanceModal = ({ isOpen, onClose, data }) => {
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
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            color: '#6b7280'
          }}
        >
          ×
        </button>
        
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '20px', 
          color: '#1e293b',
          fontSize: '20px',
          fontWeight: '600'
        }}>
          📊 At a Glance
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Today */}
          <div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginBottom: '12px',
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              borderRadius: '8px',
              border: '1px solid #fecaca'
            }}>
              <span style={{ fontSize: '20px' }}>🔥</span>
              <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '16px' }}>Today ({data.today.length})</span>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {data.today.length === 0 ? (
                <div style={{ 
                  padding: '16px', 
                  textAlign: 'center', 
                  color: '#6b7280',
                  fontStyle: 'italic'
                }}>
                  No pickups scheduled for today
                </div>
              ) : (
                data.today.map((pickup, index) => (
                  <div key={pickup.id} style={{
                    padding: '12px 16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                      {pickup.company_name}
                    </div>
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>
                      {pickup.make} {pickup.model && `- ${pickup.model}`}
                      {pickup.serial_number && ` (${pickup.serial_number})`}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                      {pickup.contact_name} • {pickup.phone_number}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* This Week */}
          <div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginBottom: '12px',
              padding: '12px 16px',
              backgroundColor: '#fffbeb',
              borderRadius: '8px',
              border: '1px solid #fed7aa'
            }}>
              <span style={{ fontSize: '20px' }}>📅</span>
              <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '16px' }}>This Week ({data.thisWeek.length})</span>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {data.thisWeek.length === 0 ? (
                <div style={{ 
                  padding: '16px', 
                  textAlign: 'center', 
                  color: '#6b7280',
                  fontStyle: 'italic'
                }}>
                  No pickups scheduled this week
                </div>
              ) : (
                data.thisWeek.map((pickup, index) => (
                  <div key={pickup.id} style={{
                    padding: '12px 16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                      {pickup.company_name}
                    </div>
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>
                      {pickup.make} {pickup.model && `- ${pickup.model}`}
                      {pickup.serial_number && ` (${pickup.serial_number})`}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                      {pickup.contact_name} • {pickup.phone_number}
                    </div>
                    <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px', fontWeight: '500' }}>
                      {new Date(pickup.pickup_date).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* This Month */}
          <div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginBottom: '12px',
              padding: '12px 16px',
              backgroundColor: '#eff6ff',
              borderRadius: '8px',
              border: '1px solid #bfdbfe'
            }}>
              <span style={{ fontSize: '20px' }}>📆</span>
              <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '16px' }}>This Month ({data.thisMonth.length})</span>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {data.thisMonth.length === 0 ? (
                <div style={{ 
                  padding: '16px', 
                  textAlign: 'center', 
                  color: '#6b7280',
                  fontStyle: 'italic'
                }}>
                  No pickups scheduled this month
                </div>
              ) : (
                data.thisMonth.map((pickup, index) => (
                  <div key={pickup.id} style={{
                    padding: '12px 16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                      {pickup.company_name}
                    </div>
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>
                      {pickup.make} {pickup.model && `- ${pickup.model}`}
                      {pickup.serial_number && ` (${pickup.serial_number})`}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                      {pickup.contact_name} • {pickup.phone_number}
                    </div>
                    <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '4px', fontWeight: '500' }}>
                      {new Date(pickup.pickup_date).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CalendarView = ({ orders, pickups, onViewEdit, onEditPickup, onSchedulePickup }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState(null);
  
  const ordersByDate = useMemo(() => {
    const grouped = {};
    
    // Add work orders based on status history dates
    orders.forEach(order => {
      if (order.statusHistory && Array.isArray(order.statusHistory)) {
        order.statusHistory.forEach(statusEntry => {
          if (statusEntry.date) {
            const dateKey = getDateKey(statusEntry.date);
            if (!grouped[dateKey]) grouped[dateKey] = [];
            // Get the most recent technician assignment
            const mostRecentTech = order.timeLogs && order.timeLogs.length > 0 
              ? order.timeLogs[order.timeLogs.length - 1].technicianAssigned 
              : 'Unknown';

            grouped[dateKey].push({ 
              ...order, 
              statusEntry: statusEntry, 
              type: 'workorder',
              displayStatus: statusEntry.status,
              technicianAssigned: mostRecentTech
            });
          }
        });
      }
    });
    
    // Add scheduled pickups
    pickups.forEach(pickup => {
      if (pickup.pickup_date) {
        const dateKey = getDateKey(pickup.pickup_date);
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push({ ...pickup, type: 'pickup' });
      }
    });
    
    return grouped;
  }, [orders, pickups]);

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

  const days = getDaysInMonth(selectedDate);
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  const navigateMonth = (direction) => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  return (
    <div style={{ margin: '0 30px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 20
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
        <h2 style={{ margin: 0, fontSize: '24px' }}>
          {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
        </h2>
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
          
          const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          const dayOrders = ordersByDate[dateKey] || [];
          const isToday = day.toDateString() === new Date().toDateString();
          
          const isHovered = hoveredDate === dateKey;
          
          return (
            <div
              key={index}
              style={{
                minHeight: '120px',
                maxHeight: '200px',
                border: '1px solid #e5e7eb',
                background: isToday ? '#fef3c7' : 'white',
                padding: '8px',
                overflowY: 'auto',
                position: 'relative',
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e1 #f1f5f9'
              }}
              onMouseEnter={() => setHoveredDate(dateKey)}
              onMouseLeave={() => setHoveredDate(null)}
            >
              <div style={{
                fontWeight: 'bold',
                marginBottom: '4px',
                color: isToday ? '#92400e' : 'inherit',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{day.getDate()}</span>
                {isHovered && onSchedulePickup && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSchedulePickup(day);
                    }}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#2563eb';
                      e.target.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = '#3b82f6';
                      e.target.style.transform = 'scale(1)';
                    }}
                    title={`Schedule pickup for ${day.toLocaleDateString()}`}
                  >
                    + Schedule
                  </button>
                )}
              </div>
              {dayOrders.map((item, idx) => {
                const isCompleted = item.type === 'pickup' && item.status === 'Completed';
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (item.type === 'workorder') {
                        onViewEdit(item.workOrderNo);
                      } else if (item.type === 'pickup') {
                        onEditPickup(item);
                      }
                    }}
                    style={{
                      background: item.type === 'pickup' ? '#f97316' : getStatusColor(item.displayStatus || item.status),
                      color: 'white',
                      padding: '2px 6px',
                      margin: '2px 0',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: isCompleted ? 'line-through' : 'none',
                      opacity: isCompleted ? 0.7 : 1
                    }}
                  title={item.type === 'pickup' 
                    ? `${isCompleted ? 'COMPLETED - ' : ''}Pickup - ${item.company_name} - ${item.make} / ${item.model || 'N/A'} / ${item.serial_number || 'N/A'} (Click to edit)`
                    : `${item.workOrderNo} - ${item.displayStatus || item.status} - ${item.shop} - ${item.make} / ${item.model} / ${item.serialNumber}`
                  }
                >
                  {item.type === 'pickup' 
                    ? `📦 ${item.company_name} - ${item.make}`
                    : `${item.workOrderNo} - ${item.technicianAssigned} - ${item.companyName}`
                  }
                </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ListView = ({ orders, onViewEdit }) => {
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aDate = a.timeLogs?.[0]?.assignDate || a.date || '';
      const bDate = b.timeLogs?.[0]?.assignDate || b.date || '';
      return new Date(bDate) - new Date(aDate);
    });
  }, [orders]);

  return (
    <div style={{ margin: '0 30px' }}>
      <h2 style={{ marginBottom: 20 }}>Scheduled Work Orders</h2>
      <div style={{ 
        border: '1px solid #e5e7eb', 
        borderRadius: 8,
        overflow: 'hidden'
      }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif'
        }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Work Order</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Company</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Technician</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Time</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Shop</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedOrders.map(order => {
              const timeLog = order.timeLogs?.[0];
              return (
                <tr 
                  key={order.workOrderNo}
                  style={{ 
                    cursor: 'pointer',
                    borderBottom: '1px solid #f3f4f6',
                    background: 'white'
                  }}
                  onClick={() => onViewEdit(order.workOrderNo)}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ padding: '12px' }}>
                    {formatDate(timeLog?.assignDate || order.date)}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>
                    {order.workOrderNo}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {order.companyName}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {timeLog?.technicianAssigned || 'Unassigned'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {timeLog?.startTime && timeLog?.finishTime 
                      ? `${formatTime(timeLog.startTime)} - ${formatTime(timeLog.finishTime)}`
                      : timeLog?.startTime || 'Not started'
                    }
                  </td>
                  <td style={{ padding: '12px' }}>
                    {order.shop}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      background: getStatusColor(order.status || 'Assigned'),
                      color: "#fff"
                    }}>
                      {order.status || 'Assigned'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TechnicianView = ({ orders, onViewEdit }) => {
  const ordersByTechnician = useMemo(() => {
    const grouped = {};
    orders.forEach(order => {
      if (order.timeLogs && order.timeLogs.length > 0) {
        order.timeLogs.forEach(log => {
          const tech = log.technicianAssigned || 'Unassigned';
          if (!grouped[tech]) grouped[tech] = [];
          grouped[tech].push({ ...order, timeLog: log });
        });
      }
    });
    return grouped;
  }, [orders]);

  return (
    <div style={{ margin: '0 30px' }}>
      <h2 style={{ marginBottom: 20 }}>Work Orders by Technician</h2>
      {Object.entries(ordersByTechnician).map(([technician, techOrders]) => (
        <div key={technician} style={{ marginBottom: 30 }}>
          <h3 style={{ 
            background: '#f3f4f6', 
            padding: '12px', 
            margin: 0,
            borderRadius: '8px 8px 0 0',
            border: '1px solid #e5e7eb',
            borderBottom: 'none'
          }}>
            {technician} ({techOrders.length} orders)
          </h3>
          <div style={{ 
            border: '1px solid #e5e7eb',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            overflow: 'hidden'
          }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontFamily: 'Arial, sans-serif'
            }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Work Order</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Company</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Time</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {techOrders.map(order => (
                  <tr 
                    key={order.workOrderNo}
                    style={{ 
                      cursor: 'pointer',
                      background: 'white'
                    }}
                    onClick={() => onViewEdit(order.workOrderNo)}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <td style={{ padding: '8px 12px' }}>
                      {formatDate(order.timeLog?.assignDate || order.date)}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 'bold' }}>
                      {order.workOrderNo}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {order.companyName}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {order.timeLog?.startTime && order.timeLog?.finishTime 
                        ? `${formatTime(order.timeLog.startTime)} - ${formatTime(order.timeLog.finishTime)}`
                        : order.timeLog?.startTime || 'Not started'
                      }
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        background: getStatusColor(order.status || 'Assigned'),
                        color: "#fff"
                      }}>
                        {order.status || 'Assigned'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

// Main component
export default function SchedulerDashboard({ user }) {
  const navigate = useNavigate();
  
  // Defensive: handle loading state to prevent crash
  if (!user || !user.token) {
    return <div>Loading dashboard...</div>;
  }

  // Custom hooks
  const { orders, loading, error, refetch } = useWorkOrders(user);
  const { pickups, loading: pickupsLoading, error: pickupsError, refetch: refetchPickups } = useScheduledPickups(user);
  
  const { shopFilter, updateShopFilter } = useShopFilter();
  const [viewType, setViewType] = useState('calendar');
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedPickup, setSelectedPickup] = useState(null);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [atAGlanceOpen, setAtAGlanceOpen] = useState(false);
  const [assignWorkOrderOpen, setAssignWorkOrderOpen] = useState(false);
  const [prefilledWorkOrderData, setPrefilledWorkOrderData] = useState(null);
  const [selectedDateForPickup, setSelectedDateForPickup] = useState(null);
  const [advancedFilters, setAdvancedFilters] = useState({
    technician: '',
    make: '',
    model: '',
    status: '',
    company: '',
    shop: 'All Shops',
    workOrderNo: ''
  });

  // Memoized filtered orders and pickups
  const filteredOrders = useMemo(() => {
    let filtered = orders;
    
    // Apply shop filter
    if (shopFilter !== 'All Shops') {
      filtered = filtered.filter(order => order.shop === shopFilter);
    }
    
    // Apply advanced filters
    if (advancedFilters.technician) {
      filtered = filtered.filter(order => 
        order.timeLogs && order.timeLogs.some(log => 
          log.technicianAssigned === advancedFilters.technician
        )
      );
    }
    
    if (advancedFilters.make) {
      filtered = filtered.filter(order => order.make === advancedFilters.make);
    }
    
    if (advancedFilters.model) {
      filtered = filtered.filter(order => order.model === advancedFilters.model);
    }
    
    if (advancedFilters.status) {
      filtered = filtered.filter(order => order.status === advancedFilters.status);
    }
    
    if (advancedFilters.company) {
      filtered = filtered.filter(order => order.companyName === advancedFilters.company);
    }
    
    if (advancedFilters.workOrderNo) {
      filtered = filtered.filter(order => 
        order.workOrderNo && order.workOrderNo.toLowerCase().includes(advancedFilters.workOrderNo.toLowerCase())
      );
    }
    
    return filtered;
  }, [orders, shopFilter, advancedFilters]);

  const filteredPickups = useMemo(() => {
    let filtered = pickups;
    
    // Apply shop filter
    if (shopFilter !== 'All Shops') {
      filtered = filtered.filter(pickup => pickup.shop === shopFilter);
    }
    
    // Apply advanced filters
    if (advancedFilters.make) {
      filtered = filtered.filter(pickup => pickup.make === advancedFilters.make);
    }
    
    if (advancedFilters.model) {
      filtered = filtered.filter(pickup => pickup.model === advancedFilters.model);
    }
    
    if (advancedFilters.company) {
      filtered = filtered.filter(pickup => pickup.company_name === advancedFilters.company);
    }
    
    return filtered;
  }, [pickups, shopFilter, advancedFilters]);

  // At a Glance calculations
  const atAGlanceData = useMemo(() => {
    if (!pickups) return { today: [], thisWeek: [], thisMonth: [] };
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekFromNow = new Date(today.getTime() + (7 * 24 * 60 * 60 * 1000));
    const monthFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    let todayPickups = [];
    let thisWeekPickups = [];
    let thisMonthPickups = [];
    
    pickups.forEach(pickup => {
      if (!pickup.pickup_date) return;
      
      const pickupDate = new Date(pickup.pickup_date);
      const pickupDateOnly = new Date(pickupDate.getFullYear(), pickupDate.getMonth(), pickupDate.getDate());
      
      // Today
      if (pickupDateOnly.getTime() === today.getTime()) {
        todayPickups.push(pickup);
      }
      
      // This week (next 7 days)
      if (pickupDateOnly >= today && pickupDateOnly < weekFromNow) {
        thisWeekPickups.push(pickup);
      }
      
      // This month (next 30 days)
      if (pickupDateOnly >= today && pickupDateOnly < monthFromNow) {
        thisMonthPickups.push(pickup);
      }
    });
    
    return { today: todayPickups, thisWeek: thisWeekPickups, thisMonth: thisMonthPickups };
  }, [pickups]);

  // Event handlers
  const handleLogout = useCallback(() => {
    window.location.href = '/login';
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleViewEdit = useCallback((workOrderNo) => {
    navigate(`/dashboard/workorder/${workOrderNo}`);
  }, [navigate]);

  const handleViewTypeChange = useCallback((newViewType) => {
    setViewType(newViewType);
  }, []);

  const handleSchedulePickup = useCallback((date = null) => {
    setSelectedDateForPickup(date);
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setSelectedDateForPickup(null);
  }, []);

  const handleSavePickup = useCallback(async (formData) => {
    try {
      await API.post('/api/scheduler', formData, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      alert('Pick-up scheduled successfully!');
      refetchPickups(); // Refresh the pickups list
    } catch (error) {
      console.error('Failed to save pickup schedule:', error);
      throw error;
    }
  }, [user.token, refetchPickups]);

  const handleEditPickup = useCallback((pickup) => {
    setSelectedPickup(pickup);
    setEditModalOpen(true);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setEditModalOpen(false);
    setSelectedPickup(null);
  }, []);

  const handleUpdatePickup = useCallback(async (pickupId, formData) => {
    try {
      await API.put(`/api/scheduler/${pickupId}`, formData, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      alert('Pick-up updated successfully!');
      refetchPickups(); // Refresh the pickups list
      setEditModalOpen(false);
      setSelectedPickup(null);
    } catch (error) {
      console.error('Failed to update pickup schedule:', error);
      throw error;
    }
  }, [user.token, refetchPickups]);

  const handleDeletePickup = useCallback(async (pickupId) => {
    try {
      const response = await API.delete(`/api/scheduler/${pickupId}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      alert('Pick-up cancelled successfully!');
      refetchPickups(); // Refresh the pickups list
      setEditModalOpen(false);
      setSelectedPickup(null);
    } catch (error) {
      console.error('Failed to delete pickup:', error);
      console.error('Error details:', error.response?.data || error.message);
      alert(`Failed to cancel pickup: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }, [user.token, refetchPickups]);

  const handleAdvancedFilter = useCallback(() => {
    setAdvancedFilterOpen(true);
  }, []);

  const handleAtAGlance = useCallback(() => {
    setAtAGlanceOpen(true);
  }, []);

  const handleCloseAtAGlance = useCallback(() => {
    setAtAGlanceOpen(false);
  }, []);

  const handleCloseAdvancedFilter = useCallback(() => {
    setAdvancedFilterOpen(false);
  }, []);

  const handleApplyAdvancedFilter = useCallback((filters) => {
    setAdvancedFilters(filters);
  }, []);

  const handleCompleteAndAssign = useCallback(async (pickupData) => {
    // Mark pickup as completed in database
    try {
      await API.patch(`/api/scheduler/${pickupData.id}/complete`, {}, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
    } catch (error) {
      console.error('Failed to mark pickup as completed:', error);
      alert('Failed to mark pickup as completed. Please try again.');
      return;
    }
    
    // Generate next work order number
    const nextWorkOrderNo = `WO${Date.now()}`;
    
    // Prepare pre-filled data for work order form
    const workOrderData = {
      workOrderNo: nextWorkOrderNo,
      companyName: pickupData.company_name || '',
      address: pickupData.address || '',
      city: pickupData.city || '',
      state: pickupData.state || '',
      zipcode: pickupData.zipcode || '',
      contactName: pickupData.contact_name || '',
      phoneNumber: pickupData.phone_number || '',
      email: pickupData.email || '',
      poNumber: pickupData.po_number || '',
      make: pickupData.make || '',
      model: pickupData.model || '',
      serialNumber: pickupData.serial_number || '',
      shop: pickupData.shop || '',
      notes: pickupData.notes || '',
      status: 'Assigned',
      date: new Date().toISOString().split('T')[0]
    };
    
    
    setPrefilledWorkOrderData(workOrderData);
    setAssignWorkOrderOpen(true);
    setEditModalOpen(false);
    setSelectedPickup(null);
    
    // Refresh pickups to show the updated completed status
    refetchPickups();
  }, [user.token, refetchPickups]);

  const handleCloseAssignWorkOrder = useCallback(() => {
    setAssignWorkOrderOpen(false);
    setPrefilledWorkOrderData(null);
  }, []);

  const handleWorkOrderSuccess = useCallback((workOrderData) => {
    // Show confirmation notification
    alert(`Work Order #${workOrderData.workOrderNo} has been successfully created and assigned!`);
    
    // Close the assign work order form
    setAssignWorkOrderOpen(false);
    setPrefilledWorkOrderData(null);
    
    // Optionally refresh any relevant data
    // You could add refetchWorkOrders() here if you have that function
  }, []);

  // Loading and error states
  if (loading) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: '18px'
      }}>
        Loading work orders...
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
      <Header 
        onLogout={handleLogout}
        onRefresh={handleRefresh}
        onSchedulePickup={handleSchedulePickup}
        user={user}
      />
      
      <FilterControls 
        shopFilter={shopFilter}
        onShopFilterChange={updateShopFilter}
        viewType={viewType}
        onViewTypeChange={handleViewTypeChange}
        onAdvancedFilter={handleAdvancedFilter}
        onAtAGlance={handleAtAGlance}
      />

      {viewType === 'calendar' && (
        <CalendarView 
          orders={filteredOrders}
          pickups={filteredPickups}
          onViewEdit={handleViewEdit}
          onEditPickup={handleEditPickup}
          onSchedulePickup={handleSchedulePickup}
        />
      )}

      {viewType === 'list' && (
        <ListView 
          orders={filteredOrders}
          onViewEdit={handleViewEdit}
        />
      )}

      {viewType === 'technician' && (
        <TechnicianView 
          orders={filteredOrders}
          onViewEdit={handleViewEdit}
        />
      )}

      <SchedulePickupModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSavePickup}
        initialDate={selectedDateForPickup}
      />

      <EditPickupModal
        isOpen={editModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleUpdatePickup}
        onDelete={handleDeletePickup}
        onCompleteAndAssign={handleCompleteAndAssign}
        pickupData={selectedPickup}
      />

      <AdvancedFilterModal
        isOpen={advancedFilterOpen}
        onClose={handleCloseAdvancedFilter}
        onApply={handleApplyAdvancedFilter}
        orders={orders}
        pickups={pickups}
      />

      <AtAGlanceModal
        isOpen={atAGlanceOpen}
        onClose={handleCloseAtAGlance}
        data={atAGlanceData}
      />

      {assignWorkOrderOpen && (
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
            borderRadius: 8,
            width: '95%',
            maxWidth: '1200px',
            maxHeight: '95vh',
            overflow: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={handleCloseAssignWorkOrder}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: 30,
                height: 30,
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 'bold',
                zIndex: 1001
              }}
            >
              ×
            </button>
            <AssignWorkOrderForm
              token={user.token}
              user={user}
              prefilledData={prefilledWorkOrderData}
              onSuccess={handleWorkOrderSuccess}
            />
          </div>
        </div>
      )}
    </div>
  );
}

