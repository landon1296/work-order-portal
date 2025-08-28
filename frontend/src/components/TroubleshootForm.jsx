import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api';
import '../index.css';
import { default as SignaturePad } from 'react-signature-canvas';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import GLLSLogo from '../assets/GLLSLogo.png';
import logoBase64 from '../assets/logoBase64';
import NotificationPopup from './NotificationPopup';

// Constants
const REPAIR_TYPES = {
  FIELD_REPAIR: "Field Repair",
  GLLS_MACHINE: "GLLS Machine"
};

const WORK_TYPES = {
  VENDOR_WARRANTY: 'vendorWarranty',
  BILLABLE: 'billable',
  MAINTENANCE: 'maintenance',
  NON_BILLABLE_REPAIR: 'nonBillableRepair'
};

const FIELD_REPAIR_REQUIRED_FIELDS = [
  { key: 'fieldContact', label: 'Field Contact' },
  { key: 'fieldContactNumber', label: 'Field Contact Number' },
  { key: 'fieldStreet', label: 'Field Street' },
  { key: 'fieldCity', label: 'Field City' },
  { key: 'fieldState', label: 'Field State' },
  { key: 'fieldZipcode', label: 'Field Zipcode' }
];

// Utility functions
const toCamelCaseDeep = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCaseDeep);
  } else if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, val]) => [
        key.replace(/_([a-z])/g, g => g[1].toUpperCase()),
        toCamelCaseDeep(val)
      ])
    );
  }
  return obj;
};

const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length >= 7) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length >= 4) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  } else if (digits.length >= 1) {
    return `(${digits}`;
  }
  return digits;
};

const validateForm = (form) => {
  const errors = [];

  if (!form.workDescription?.trim()) {
    errors.push('Problem Description is required.');
  }

  if (!form.companyName?.trim()) {
    errors.push('Company Name is required.');
  }

  return errors;
};

// PDF Generation utility functions
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return isNaN(date) ? "" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

const drawRoundedRect = (doc, x, y, width, height, radius = 3) => {
  doc.roundedRect(x, y, width, height, radius, radius);
};

const generatePDF = (order) => {
  try {
    console.log("Generating PDF for troubleshoot record", order.work_order_no);

    const doc = new jsPDF({ margin: 20 });
    const leftMargin = 20;
    const rightMargin = 20;
    const topMargin = 20;
    const bottomMargin = 20;
    const pageHeight = doc.internal.pageSize.getHeight();

    let y = 20;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`Troubleshooting Record #${order.work_order_no}`, 80, y, { align: "right" });
    y += 10;
    
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 90, 10.5, 93.75, 15);
    }

    // Troubleshoot Information
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    const info = [
      ["Date", formatDate(order.date)],
      ["Company", order.company_name],
      ["Contact", `${order.contact_name || ""} (${order.contact_phone || ""})`],
      ["Contact Email", order.contact_email || ""],
      ["Technician", order.technician_assigned || ""],
      ["Assign Date", formatDate(order.assign_date)],
      ["Make / Model / Serial", `${order.make} / ${order.model} / ${order.serial_number}`]
    ];

    const infoStartY = y + 5;
    let currentInfoY = infoStartY;

    info.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, leftMargin, currentInfoY += 8);
      doc.setFont("helvetica", "normal");
      doc.text(value || "", leftMargin + 60, currentInfoY);
    });
    
    drawRoundedRect(doc, leftMargin - 5, infoStartY - 0, 180, currentInfoY - infoStartY + 5, 4);
    y = currentInfoY + 4;

    // Work Description
    const estimatedWorkDescHeight = doc.splitTextToSize(order.work_description || "", 170).length * 6 + 16;
    if (y + estimatedWorkDescHeight > pageHeight - bottomMargin) {
      doc.addPage();
      y = topMargin;
    }

    doc.setFont("helvetica", "bold");
    const workDescStartY = y + 10;
    doc.text("Troubleshooting Description:", leftMargin, workDescStartY);
    doc.setFont("helvetica", "normal");
    const workDescText = doc.splitTextToSize(order.work_description || "", 170);
    doc.text(workDescText, leftMargin, workDescStartY + 6);
    drawRoundedRect(doc, leftMargin - 5, workDescStartY - 5, 180, workDescText.length * 6 + 16, 4);
    y = workDescStartY + workDescText.length * 6 + 20;

    // Notes
    if (order.notes) {
      const estimatedNotesHeight = doc.splitTextToSize(order.notes || "", 170).length * 6 + 16;
      if (y + estimatedNotesHeight > pageHeight - bottomMargin) {
        doc.addPage();
        y = topMargin;
      }

      doc.setFont("helvetica", "bold");
      const notesStartY = y;
      doc.text("Additional Notes:", leftMargin, notesStartY);
      doc.setFont("helvetica", "normal");
      const notesText = doc.splitTextToSize(order.notes || "", 170);
      doc.text(notesText, leftMargin, notesStartY + 6);
      drawRoundedRect(doc, leftMargin - 5, notesStartY - 5, 180, notesText.length * 6 + 16, 4);
      y = notesStartY + notesText.length * 6 + 20;
    }

    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');

  } catch (err) {
    console.error("PDF generation failed:", err);
    alert('Failed to generate PDF. Please try again.');
  }
};

export default function TroubleshootForm({ token, user, editMode = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: '',
    companyStreet: '',
    companyCity: '',
    companyState: '',
    companyZip: '',
    fieldContact: '',
    fieldContactNumber: '',
    fieldStreet: '',
    fieldCity: '',
    fieldState: '',
    fieldZipcode: '',
    poNumber: '',
    make: '',
    model: '',
    serialNumber: '',
    date: new Date().toISOString().slice(0,10),
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    vendorWarranty: false,
    billable: false,
    maintenance: false,
    nonBillableRepair: false,
    timeLogs: [
      { technicianAssigned: '', assignDate: new Date().toISOString().slice(0,10), startTime: '', finishTime: '', travelTime: '' }
    ],
    shop: '',
    repairType: '',
    salesName: '',
    shippingCost: '',
    shippingComments: '',
    workDescription: '',
    notes: '',
    parts: [{ description: '', partNumber: '', quantity: '', waiting: false }],
    status: 'Active',
    statusHistory: [],
    customerSignature: null,
    signatureTimestamp: null
  });

  const [printedName, setPrintedName] = useState('');
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [makeModelMap, setMakeModelMap] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const prevMakeRef = useRef();
  const [partsMemory, setPartsMemory] = useState([]);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const sigPadRef = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Notification popup state
  const [showNotificationPopup, setShowNotificationPopup] = useState(false);
  const [createdWorkOrderData, setCreatedWorkOrderData] = useState(null);

  // Load existing troubleshoot record if in edit mode
  useEffect(() => {
    if (editMode && id) {
      setLoading(true);
      API.get(`/api/troubleshoot/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        const troubleshootRecord = res.data;
        
        // Helper function to format date for HTML date input
        const formatDateForInput = (dateString) => {
          if (!dateString) return new Date().toISOString().slice(0, 10);
          const date = new Date(dateString);
          return date.toISOString().slice(0, 10);
        };
        
                 // Map the database fields back to form fields
         setForm(prev => ({
           ...prev,
           companyName: troubleshootRecord.company_name || '',
           date: formatDateForInput(troubleshootRecord.date),
           contactName: troubleshootRecord.contact_name || '',
           contactPhone: troubleshootRecord.contact_phone || '',
           contactEmail: troubleshootRecord.contact_email || '',
           make: troubleshootRecord.make || '',
           model: troubleshootRecord.model || '',
           serialNumber: troubleshootRecord.serial_number || '',
           workDescription: troubleshootRecord.work_description || '',
           notes: troubleshootRecord.notes || '',
           status: troubleshootRecord.status || 'Active',
           timeLogs: [{
             technicianAssigned: troubleshootRecord.technician_assigned || '',
             assignDate: formatDateForInput(troubleshootRecord.assign_date),
             startTime: '',
             finishTime: '',
             travelTime: ''
           }]
         }));
      })
      .catch(err => {
        console.error('Failed to load troubleshoot record:', err);
        setError('Failed to load troubleshoot record. Please try again.');
      })
      .finally(() => setLoading(false));
    }
  }, [editMode, id, token]);

  // Load makes and models
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [makesModelsRes, techniciansRes] = await Promise.all([
          API.get('/api/masters/makes-models'),
          API.get('/api/masters/technicians')
        ]);
        
        // Process makes/models exactly like AssignWorkOrderForm
        const map = {};
        makesModelsRes.data.forEach(([make, model]) => {
          if (!map[make]) map[make] = [];
          map[make].push(model);
        });
        setMakeModelMap(map);
        setMakes(Object.keys(map));
        
        // Set technicians
        setTechnicians(techniciansRes.data || []);
      } catch (err) {
        console.error('Failed to fetch master data:', err);
      }
    };

    fetchMasterData();
  }, []);

  // Load parts memory
  useEffect(() => {
    API.get('/api/parts/memory')
      .then(res => setPartsMemory(res.data))
      .catch(err => console.error('Failed to load parts memory:', err));
  }, []);

  // Update models when make changes
  useEffect(() => {
    if (form.make && makeModelMap[form.make]) {
      setModels(makeModelMap[form.make]);
      if (prevMakeRef.current !== undefined && prevMakeRef.current !== form.make) {
        setForm(prev => ({ ...prev, model: '' }));
      }
      prevMakeRef.current = form.make;
    } else {
      setModels([]);
    }
  }, [form.make, makeModelMap, setModels, setForm]);

  const handleInputChange = (field, value) => {
    if (field === 'contactPhone' || field === 'fieldContactNumber') {
      value = formatPhoneNumber(value);
    }
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleTimeLogChange = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      timeLogs: prev.timeLogs.map((log, i) => 
        i === index ? { ...log, [field]: value } : log
      )
    }));
  };

  const addTimeLog = () => {
    setForm(prev => ({
      ...prev,
      timeLogs: [...prev.timeLogs, {
        technicianAssigned: '',
        assignDate: new Date().toISOString().slice(0,10),
        startTime: '',
        finishTime: '',
        travelTime: ''
      }]
    }));
  };

  const removeTimeLog = (index) => {
    setForm(prev => ({
      ...prev,
      timeLogs: prev.timeLogs.filter((_, i) => i !== index)
    }));
  };

  const handlePartChange = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      parts: prev.parts.map((part, i) => 
        i === index ? { ...part, [field]: value } : part
      )
    }));
  };

  const addPart = () => {
    setForm(prev => ({
      ...prev,
      parts: [...prev.parts, { description: '', partNumber: '', quantity: '', waiting: false }]
    }));
  };

  const removePart = (index) => {
    setForm(prev => ({
      ...prev,
      parts: prev.parts.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const errors = validateForm(form);
    if (errors.length > 0) {
      alert('Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
             // Prepare data for troubleshoot table
       const troubleshootData = {
         workOrderNo: null, // Let the database handle work order number generation
         companyName: form.companyName,
        date: form.date,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        make: form.make,
        model: form.model,
        serialNumber: form.serialNumber,
        workDescription: form.workDescription,
        notes: form.notes,
        technicianAssigned: form.timeLogs[0]?.technicianAssigned || '',
        assignDate: form.timeLogs[0]?.assignDate || form.date,
        status: form.status
      };

      if (editMode) {
        await API.put(`/api/troubleshoot/${id}`, troubleshootData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Troubleshoot record updated successfully!');
             } else {
         const res = await API.post('/api/troubleshoot', troubleshootData, {
           headers: { Authorization: `Bearer ${token}` }
         });
         alert('Troubleshooting record created successfully!');
       }
      
      navigate('/reception-dashboard');
    } catch (err) {
      console.error('Failed to save troubleshoot record:', err);
      setError('Failed to save troubleshoot record. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseOrder = async () => {
    if (!editMode || !id) {
      alert('Cannot close order - not in edit mode');
      return;
    }

    if (!confirm('Are you sure you want to mark this troubleshooting order as successful and close it?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await API.patch(`/api/troubleshoot/${id}/status`, 
        { status: 'Closed' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Troubleshooting order closed successfully!');
      navigate('/reception-dashboard');
    } catch (err) {
      console.error('Failed to close troubleshoot order:', err);
      setError('Failed to close troubleshoot order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkOrder = async () => {
    if (!editMode || !id) {
      alert('Cannot create work order - not in edit mode');
      return;
    }

    if (!form.timeLogs[0]?.technicianAssigned) {
      alert('No technician assigned to this troubleshooting order. Please assign a technician first.');
      return;
    }

    if (!confirm('Are you sure you want to create a work order for the assigned technician? This will create a new work order based on this troubleshooting information.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get the next work order number
      const nextNumberResponse = await API.get('/workorders/next-number', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const nextWorkOrderNo = nextNumberResponse.data.nextWorkOrderNo;

      // Create work order data based on troubleshooting information
      const workOrderData = {
        workOrderNo: nextWorkOrderNo,
        date: form.date,
        companyName: form.companyName,
        companyStreet: '',
        companyCity: '',
        companyState: '',
        companyZip: '',
        fieldContact: form.contactName,
        fieldContactNumber: form.contactPhone,
        fieldStreet: '',
        fieldCity: '',
        fieldState: '',
        fieldZipcode: '',
        make: form.make,
        model: form.model,
        otherDesc: '',
        serialNumber: form.serialNumber,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        vendorWarranty: false,
        billable: true, // Default to billable since troubleshooting failed
        maintenance: false,
        nonBillableRepair: false,
        shop: 'Shop Repair', // Default shop type
        repairType: 'Field Repair',
        salesName: '',
        shippingCost: 0,
        shippingComments: '',
        workDescription: `Troubleshooting failed - ${form.workDescription}`,
        poNumber: '',
        notes: `Created from troubleshooting order. Original troubleshooting notes: ${form.notes || 'No additional notes'}`,
        status: 'Assigned',
        parts: [], // Empty parts array
        timeLogs: [{
          technicianAssigned: form.timeLogs[0].technicianAssigned,
          assignDate: form.timeLogs[0].assignDate,
          startTime: '',
          finishTime: '',
          travelTime: ''
        }]
      };

      // Create the work order
      const response = await API.post('/workorders', workOrderData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Show notification popup for new work order
      setCreatedWorkOrderData({
        workOrderNo: response.data.work_order_no,
        companyName: form.companyName,
        ...workOrderData
      });
      setShowNotificationPopup(true);
      
      // Update the troubleshooting order with the work order number and close it
      await API.put(`/api/troubleshoot/${id}`, {
        workOrderNo: nextWorkOrderNo,
        companyName: form.companyName,
        date: form.date,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        make: form.make,
        model: form.model,
        serialNumber: form.serialNumber,
        workDescription: form.workDescription,
        notes: form.notes,
        technicianAssigned: form.timeLogs[0]?.technicianAssigned || '',
        assignDate: form.timeLogs[0]?.assignDate || form.date,
        status: 'Closed'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Don't navigate here - let the popup handle navigation
    } catch (err) {
      console.error('Failed to create work order:', err);
      setError('Failed to create work order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignatureSave = () => {
    if (sigPadRef.current) {
      const signatureData = sigPadRef.current.toDataURL();
      setForm(prev => ({
        ...prev,
        customerSignature: signatureData,
        signatureTimestamp: new Date().toISOString()
      }));
      setSignatureModalOpen(false);
    }
  };

  const handleSignatureClear = () => {
    if (sigPadRef.current) {
      sigPadRef.current.clear();
    }
  };

  if (loading && editMode) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Loading troubleshoot record...</div>;
  }

  if (error) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'red' }}>{error}</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '20px'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', color: '#1f2937' }}>
          {editMode ? 'Edit Troubleshooting Work Order' : 'Create New Troubleshooting Work Order'}
        </h1>
        <button
          onClick={() => navigate('/reception-dashboard')}
          style={{
            padding: '8px 16px',
            background: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: '1200px', margin: '0 auto' }}>
                          {/* Company Information */}
         <div style={{ 
           border: '1px solid #e5e7eb', 
           borderRadius: '8px', 
           padding: '20px', 
           marginBottom: '20px',
           backgroundColor: '#f9fafb'
         }}>
                       <h2 style={{ margin: 0, marginBottom: '20px', color: '#374151' }}>Company Information</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
              <div>  
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Company Name *</label>
                <input 
                  type="text"
                  value={form.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  style={{ 
                    width: '99%',
                    padding: '6px', 
                    border: '1px solid #d1d5db', 
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>
         </div>

        {/* Contact Information */}
        <div style={{ 
          border: '1px solid #e5e7eb', 
          borderRadius: '8px', 
          padding: '20px', 
          marginBottom: '20px',
          backgroundColor: '#f9fafb'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#374151' }}>Contact Information</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Contact Name</label>
              <input
                type="text"
                value={form.contactName}
                onChange={(e) => handleInputChange('contactName', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Contact Phone</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => handleInputChange('contactPhone', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Contact Email</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => handleInputChange('contactEmail', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>

                 {/* Equipment Information */}
         <div style={{ 
           border: '1px solid #e5e7eb', 
           borderRadius: '8px', 
           padding: '20px', 
           marginBottom: '20px',
           backgroundColor: '#f9fafb'
         }}>
           <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#374151' }}>Equipment Information</h2>
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
             <div>
               <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Make</label>
               <select
                 value={form.make}
                 onChange={(e) => handleInputChange('make', e.target.value)}
                 style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
               >
                 <option value="">Select Make</option>
                 {makes.map(make => (
                   <option key={make} value={make}>{make}</option>
                 ))}
               </select>
             </div>
             <div>
               <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Model</label>
               <select
                 value={form.model}
                 onChange={(e) => handleInputChange('model', e.target.value)}
                 style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                 disabled={!form.make}
               >
                 <option value="">Select Model</option>
                 {models.map(model => (
                   <option key={model} value={model}>{model}</option>
                 ))}
               </select>
             </div>
             <div>
               <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Serial Number</label>
               <input
                 type="text"
                 value={form.serialNumber}
                 onChange={(e) => handleInputChange('serialNumber', e.target.value)}
                 style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
               />
             </div>
           </div>
         </div>

        
        {/* Troubleshooting Description */}
        <div style={{ 
          border: '1px solid #e5e7eb', 
          borderRadius: '8px', 
          padding: '20px', 
          marginBottom: '20px',
          backgroundColor: '#f9fafb'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#374151' }}>Troubleshooting Details</h2>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Problem Description *</label>
            <textarea
              value={form.workDescription}
              onChange={(e) => handleInputChange('workDescription', e.target.value)}
              style={{ 
                width: '100%', 
                padding: '8px', 
                border: '1px solid #d1d5db', 
                borderRadius: '4px',
                minHeight: '100px',
                resize: 'vertical'
              }}
              placeholder="Describe the troubleshooting issue, symptoms, and any relevant details..."
              required
            />
          </div>
          <div style={{ marginTop: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Solution Description</label>
            <textarea
              value={form.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              style={{ 
                width: '100%', 
                padding: '8px', 
                border: '1px solid #d1d5db', 
                borderRadius: '4px',
                minHeight: '80px',
                resize: 'vertical'
              }}
              placeholder="List the solution steps and any additional notes or comments..."
            />
          </div>
        </div>

        {/* Technician Assignment */}
        <div style={{ 
          border: '1px solid #e5e7eb', 
          borderRadius: '8px', 
          padding: '20px', 
          marginBottom: '20px',
          backgroundColor: '#f9fafb'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#374151' }}>Technician Assignment</h2>
          {form.timeLogs.map((log, index) => (
            <div key={index} style={{ 
              border: '1px solid #e1e5e9', 
              borderRadius: '6px', 
              padding: '15px', 
              marginBottom: '10px',
              backgroundColor: 'white'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '25px' }}>
                                 <div>
                   <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Technician</label>
                   <select
                     value={log.technicianAssigned}
                     onChange={(e) => handleTimeLogChange(index, 'technicianAssigned', e.target.value)}
                     style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                   >
                     <option value="">Select Technician</option>
                     {technicians.map(technician => (
                       <option key={technician} value={technician}>{technician}</option>
                     ))}
                   </select>
                 </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', }}>Assign Date</label>
                  <input
                    type="date"
                    value={log.assignDate}
                    onChange={(e) => handleTimeLogChange(index, 'assignDate', e.target.value)}
                    style={{ width: '100%', padding: '7px', border: '1px solid #d1d5db', borderRadius: '4px', marginBottom: '10px', }}
                  />
                </div>
               
                {form.timeLogs.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'end' }}>
                    <button
                      type="button"
                      onClick={() => removeTimeLog(index)}
                      style={{
                        padding: '8px 12px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addTimeLog}
            style={{
              padding: '8px 16px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Add Technician
          </button>
        </div>

                 {/* Submit Button */}
         <div style={{ 
           display: 'flex', 
           justifyContent: 'center', 
           gap: '15px',
           marginTop: '30px',
           padding: '20px',
           borderTop: '1px solid #e5e7eb'
         }}>
           <button
             type="submit"
             disabled={loading}
             style={{
               padding: '12px 24px',
               background: loading ? '#9ca3af' : '#2563eb',
               color: 'white',
               border: 'none',
               borderRadius: '6px',
               cursor: loading ? 'not-allowed' : 'pointer',
               fontSize: '16px',
               fontWeight: '600'
             }}
           >
             {loading ? 'Saving...' : (editMode ? 'Update Work Order' : 'Create Troubleshooting Work Order')}
           </button>
           {editMode && form.status !== 'Closed' && (
             <>
               <button
                 type="button"
                 onClick={handleCloseOrder}
                 disabled={loading}
                 style={{
                   padding: '12px 24px',
                   background: loading ? '#9ca3af' : '#10b981',
                   color: 'white',
                   border: 'none',
                   borderRadius: '6px',
                   cursor: loading ? 'not-allowed' : 'pointer',
                   fontSize: '16px',
                   fontWeight: '600',
                   marginRight: '10px'
                 }}
               >
                 Troubleshoot Successful
               </button>
               <button
                 type="button"
                 onClick={handleCreateWorkOrder}
                 disabled={loading}
                 style={{
                   padding: '12px 24px',
                   background: loading ? '#9ca3af' : '#ef4444',
                   color: 'white',
                   border: 'none',
                   borderRadius: '6px',
                   cursor: loading ? 'not-allowed' : 'pointer',
                   fontSize: '16px',
                   fontWeight: '600',
                   marginRight: '10px'
                 }}
               >
                 Troubleshooting Failed, Create Work Order
               </button>
             </>
           )}
           <button
             type="button"
             onClick={() => navigate('/reception-dashboard')}
             style={{
               padding: '12px 24px',
               background: '#6b7280',
               color: 'white',
               border: 'none',
               borderRadius: '6px',
               cursor: 'pointer',
               fontSize: '16px',
               fontWeight: '600'
             }}
           >
             Cancel
           </button>
         </div>
      </form>

      {/* Signature Modal */}
      {signatureModalOpen && (
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
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3 style={{ marginTop: 0 }}>Customer Signature</h3>
            <div style={{ border: '1px solid #d1d5db', marginBottom: '15px' }}>
              <SignaturePad
                ref={sigPadRef}
                canvasProps={{
                  style: { width: '100%', height: '200px' }
                }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Printed Name</label>
              <input
                type="text"
                value={printedName}
                onChange={(e) => setPrintedName(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleSignatureClear}
                style={{
                  padding: '8px 16px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
              <button
                onClick={() => setSignatureModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSignatureSave}
                style={{
                  padding: '8px 16px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Popup */}
      <NotificationPopup
        isOpen={showNotificationPopup}
        onClose={() => {
          setShowNotificationPopup(false);
          setCreatedWorkOrderData(null);
          navigate('/reception-dashboard');
        }}
        workOrderNo={createdWorkOrderData?.workOrderNo}
        workOrderData={createdWorkOrderData}
        createdBy={user?.username || user?.email || 'Unknown'}
        onNotificationSent={() => {
          console.log('Notification sent successfully');
        }}
      />
    </div>
  );
}
