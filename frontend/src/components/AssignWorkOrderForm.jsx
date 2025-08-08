import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api';
import '../index.css';
import { default as SignaturePad } from 'react-signature-canvas';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import GLLSLogo from '../assets/GLLSLogo.png';
import logoBase64 from '../assets/logoBase64';

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
    errors.push('Work Description is required.');
  }

  const hasWorkType = Object.values(WORK_TYPES).some(type => form[type]);
  if (!hasWorkType) {
    errors.push('At least one Work Type must be selected.');
  }

  if (form.repairType === REPAIR_TYPES.FIELD_REPAIR) {
    const missingFields = FIELD_REPAIR_REQUIRED_FIELDS.filter(field => !form[field.key]);
    if (missingFields.length > 0) {
      errors.push(`Please fill out the following Field Repair info: ${missingFields.map(f => f.label).join(', ')}`);
    }
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
    console.log("Generating PDF for work order", order.workOrderNo);

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
    doc.text(`Work Order #${order.workOrderNo}`, 80, y, { align: "right" });
    y += 10;
    
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 90, 10.5, 93.75, 15);
    }

    // Work Order Information
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    const info = [
      ["Date", formatDate(order.date)],
      ["Company", order.companyName],
      ["Address", `${order.companyStreet}, ${order.companyCity}, ${order.companyState} ${order.companyZip}`],
      ["Contact", `${order.contactName || ""} (${order.contactPhone || ""})`],
      ["Technician(s)", [...new Set((order.timeLogs || []).map(t => t.technicianAssigned).filter(Boolean))].join(", ")],
      ["Make / Model / Serial", `${order.make} / ${order.model} / ${order.serialNumber}`],
      ["Repair Type", order.repairType],
      ["Work Type", [
        order.vendorWarranty ? "Vendor Warranty" : "",
        order.billable ? "Billable" : "",
        order.maintenance ? "Maintenance" : "",
        order.nonBillableRepair ? "Non-billable Repair" : ""
      ].filter(Boolean).join(", ")],
      ["Shop", order.shop],
      ["Status", order.status]
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
    const estimatedWorkDescHeight = doc.splitTextToSize(order.workDescription || "", 170).length * 6 + 16;
    if (y + estimatedWorkDescHeight > pageHeight - bottomMargin) {
      doc.addPage();
      y = topMargin;
    }

    doc.setFont("helvetica", "bold");
    const workDescStartY = y + 10;
    doc.text("Work Description:", leftMargin, workDescStartY);
    doc.setFont("helvetica", "normal");
    const workDescText = doc.splitTextToSize(order.workDescription || "", 170);
    doc.text(workDescText, leftMargin, workDescStartY + 6);
    drawRoundedRect(doc, leftMargin - 5, workDescStartY - 5, 180, workDescText.length * 6 + 16, 4);
    y = workDescStartY + workDescText.length * 6 + 20;

    // Tech Summary / Notes
    const estimatedNotesHeight = doc.splitTextToSize(order.notes || "", 170).length * 6 + 16;
    if (y + estimatedNotesHeight > pageHeight - bottomMargin) {
      doc.addPage();
      y = topMargin;
    }

    doc.setFont("helvetica", "bold");
    const notesStartY = y;
    doc.text("Tech Summary / Notes:", leftMargin, notesStartY);
    doc.setFont("helvetica", "normal");
    const notesText = doc.splitTextToSize(order.notes || "", 170);
    doc.text(notesText, leftMargin, notesStartY + 6);
    drawRoundedRect(doc, leftMargin - 5, notesStartY - 5, 180, notesText.length * 6 + 16, 4);
    y = notesStartY + notesText.length * 6 + 20;

    // Parts Table
    if (order.parts && order.parts.length > 0) {
      doc.setFont("helvetica", "bold");
      const partsStartY = y;
      doc.text("Parts Used", leftMargin, partsStartY);
      y += 6;

      doc.autoTable({
        startY: y,
        head: [["Part #", "Description", "Qty"]],
        body: order.parts.map(p => [p.partNumber || "", p.description || "", p.quantity || ""]),
        margin: { top: 20, bottom: 20, left: leftMargin, right: rightMargin },
        styles: {
          fontSize: 10,
          overflow: 'linebreak',
          cellPadding: 3,
          lineWidth: 0
        },
        alternateRowStyles: {
          fillColor: [230, 230, 230]
        },
        tableWidth: doc.internal.pageSize.getWidth() - leftMargin - rightMargin,
        pageBreak: 'auto',
        headStyles: { fillColor: [0, 102, 204], textColor: 255 }
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    // Time Logs Table
    if (order.timeLogs && order.timeLogs.length > 0) {
      doc.setFont("helvetica", "bold");
      const timeLogsStartY = y;
      doc.text("Time Logs", leftMargin, timeLogsStartY);
      y += 6;

      // Store the starting Y position for the rectangle
      const timeLogsTableStartY = y;

      doc.autoTable({
        startY: y,
        head: [["Tech", "Date", "Start", "Finish", "Travel"]],
        body: order.timeLogs.map(log => [
          log.technicianAssigned || "",
          formatDate(log.assignDate),
          log.startTime || "",
          log.finishTime || "",
          log.travelTime || ""
        ]),
        margin: { top: 10, bottom: 30, left: leftMargin, right: rightMargin },
        styles: {
          fontSize: 10,
          overflow: 'linebreak',
          cellPadding: 3,
          lineWidth: 0
        },
        alternateRowStyles: {
          fillColor: [230, 230, 230]
        },
        tableWidth: doc.internal.pageSize.getWidth() - leftMargin - rightMargin,
        pageBreak: 'auto',
        headStyles: { fillColor: [0, 102, 204], textColor: 255 },
        didDrawPage: function(data) {
          // Draw rectangle around time logs table on each page it appears
          const currentPage = doc.getCurrentPageInfo().pageNumber;
          
          // Only draw rectangle if this is the first page of the time logs table
          if (currentPage === Math.floor(timeLogsTableStartY / pageHeight) + 1) {
            const rectHeight = Math.min(pageHeight - timeLogsTableStartY - 20, data.cursor.y - timeLogsTableStartY + 10);
            drawRoundedRect(doc, leftMargin - 5, timeLogsTableStartY - 5, 180, rectHeight, 4);
          }
        }
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    // Signature
    if (order.customerSignature) {
      const pageHeight = doc.internal.pageSize.getHeight();
      const signatureBlockHeight = 60;

      if (y + signatureBlockHeight > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }

      const signatureStartY = y;
      doc.setFont("helvetica", "bold");
      doc.text("Customer Acknowledgement Signature:", leftMargin, signatureStartY);

      const sigImgHeight = 25;
      const sigImgWidth = 100;
      doc.addImage(order.customerSignature, "PNG", leftMargin, signatureStartY + 5, sigImgWidth, sigImgHeight);

      let printedY = signatureStartY + sigImgHeight + 15;

      doc.setFontSize(9);
      if (order.signatureTimestamp) {
        doc.text(`Signed on: ${new Date(order.signatureTimestamp).toLocaleString()}`, leftMargin, printedY);
        printedY += 10;
      }

      if (order.customerSignaturePrinted) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Printed Signature: ${order.customerSignaturePrinted}`, leftMargin, printedY);
        printedY += 10;
      }

      const sectionHeight = printedY - signatureStartY + 5;
      doc.setDrawColor(0);
      drawRoundedRect(doc, leftMargin - 5, signatureStartY - 5, 180, sectionHeight, 4);
    }

    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');

  } catch (err) {
    console.error("PDF generation failed:", err);
    alert('Failed to generate PDF. Please try again.');
  }
};

// Custom hooks
const useFormData = (id) => {
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
    date: new Date().toISOString().slice(0, 10),
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    vendorWarranty: false,
    billable: false,
    maintenance: false,
    nonBillableRepair: false,
    timeLogs: [
      { technicianAssigned: '', assignDate: new Date().toISOString().slice(0, 10), startTime: '', finishTime: '', travelTime: '' }
    ],
    shop: '',
    repairType: '',
    salesName: '',
    shippingCost: '',
    notes: '',
    parts: [{ partNumber: '', description: '', quantity: '', waiting: false }],
    otherDesc: '',
    workDescription: '',
    customerSignature: null,
    signatureTimestamp: null
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateForm = useCallback((updates) => {
    setForm(prev => ({ ...prev, ...updates }));
  }, []);

  const updateFormField = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  return { form, setForm, updateForm, updateFormField, loading, setLoading, error, setError };
};

const useMasterData = () => {
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [makeModelMap, setMakeModelMap] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const [shops, setShops] = useState([]);
  const [repairTypes, setRepairTypes] = useState([]);
  const [salesNames, setSalesNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMasterData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          makesModelsRes,
          techniciansRes,
          shopsRes,
          repairTypesRes,
          salesNamesRes
        ] = await Promise.all([
          API.get('/api/masters/makes-models'),
          API.get('/api/masters/technicians'),
          API.get('/api/masters/shops'),
          API.get('/api/masters/repairTypes'),
          API.get('/api/masters/salesnames')
        ]);

        // Process makes/models
        const map = {};
        makesModelsRes.data.forEach(([make, model]) => {
          if (!map[make]) map[make] = [];
          map[make].push(model);
        });
        setMakeModelMap(map);
        setMakes(Object.keys(map));

        setTechnicians(techniciansRes.data || []);
        setShops(shopsRes.data || []);
        setRepairTypes(repairTypesRes.data || []);
        setSalesNames(salesNamesRes.data || []);
      } catch (err) {
        console.error('Failed to fetch master data:', err);
        setError('Failed to load form data. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };

    fetchMasterData();
  }, []);

  return {
    makes, models, setModels, makeModelMap,
    technicians, shops, repairTypes, salesNames,
    loading, error
  };
};

// Main component
export default function AssignWorkOrderForm({ token }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nextWorkOrderNo, setNextWorkOrderNo] = useState('');
  const [workOrderPhotos, setWorkOrderPhotos] = useState([]);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const sigPadRef = useRef();
  const prevMakeRef = useRef();

  const { form, setForm, updateForm, updateFormField, loading: formLoading, setLoading: setFormLoading, error: formError } = useFormData(id);
  const { makes, models, setModels, makeModelMap, technicians, shops, repairTypes, salesNames, loading: masterLoading, error: masterError } = useMasterData();

  // Memoized values
  const isInHouseRepair = useMemo(() => form.repairType === REPAIR_TYPES.GLLS_MACHINE, [form.repairType]);
  const disabledIfInHouse = useMemo(() => isInHouseRepair ? { disabled: true } : {}, [isInHouseRepair]);

  // Effects
  useEffect(() => {
    if (form.make && makeModelMap[form.make]) {
      setModels(makeModelMap[form.make]);
      if (prevMakeRef.current !== undefined && prevMakeRef.current !== form.make) {
        updateFormField('model', '');
      }
      prevMakeRef.current = form.make;
    } else {
      setModels([]);
    }
  }, [form.make, makeModelMap, setModels, updateFormField]);

  useEffect(() => {
    if (id) return; // Only run if NOT editing!
    
    const fetchNextWorkOrderNo = async () => {
      try {
        const res = await API.get('/workorders/next-number');
        setNextWorkOrderNo(res.data.nextWorkOrderNo);
        updateFormField('workOrderNo', String(res.data.nextWorkOrderNo));
      } catch (err) {
        console.error('Failed to fetch next work order number:', err);
        setNextWorkOrderNo('');
        updateFormField('workOrderNo', '');
      }
    };

    fetchNextWorkOrderNo();
  }, [id, updateFormField]);

  useEffect(() => {
    if (!id) return;

    const fetchWorkOrder = async () => {
      setFormLoading(true);
      try {
        const res = await API.get(`/workorders/${id}`);
        if (res.data) {
          let formObj = toCamelCaseDeep(res.data);
          
          // Format dates
          if (formObj.date) formObj.date = String(formObj.date).slice(0, 10);
          
          // Handle field contact fallback
          if (!formObj.fieldContact && formObj.fieldContactName) {
            formObj.fieldContact = formObj.fieldContactName;
          }
          
          // Ensure arrays exist
          formObj.parts = Array.isArray(formObj.parts) ? formObj.parts : [{ partNumber: '', description: '', quantity: '', waiting: false }];
          formObj.timeLogs = Array.isArray(formObj.timeLogs) ? formObj.timeLogs : [{ technicianAssigned: '', assignDate: '', startTime: '', finishTime: '', travelTime: '' }];
          
          // Format time log dates
          formObj.timeLogs = formObj.timeLogs.map(log => ({
            ...log,
            assignDate: log.assignDate ? String(log.assignDate).slice(0, 10) : new Date().toISOString().slice(0, 10)
          }));

          // Set default values for required fields
          const requiredFields = [
            'companyName', 'companyStreet', 'companyCity', 'companyState', 'companyZip',
            'fieldContact', 'fieldContactNumber', 'fieldStreet', 'fieldCity', 'fieldState', 'fieldZipcode',
            'poNumber', 'make', 'model', 'serialNumber', 'date',
            'contactName', 'contactPhone', 'contactEmail', 'salesName', 'shippingCost', 'notes', 'otherDesc', 'workDescription'
          ];
          
          requiredFields.forEach(field => {
            if (formObj[field] === undefined || formObj[field] === null) formObj[field] = '';
          });

          setForm(formObj);

          // Fetch photos
          try {
            const photoRes = await API.get(`/api/photos/${formObj.workOrderNo}`);
            setWorkOrderPhotos(photoRes.data || []);
          } catch (err) {
            console.error('Failed to fetch photos:', err);
            setWorkOrderPhotos([]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch work order:', err);
        // Handle not found or other errors
      } finally {
        setFormLoading(false);
      }
    };

    fetchWorkOrder();
  }, [id, setForm, setFormLoading]);

  // Event handlers
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    let newValue = value;

    // Auto-format phone numbers
    if (name === 'contactPhone' || name === 'fieldContactNumber') {
      newValue = formatPhoneNumber(value);
    }

    updateFormField(name, type === 'checkbox' ? checked : newValue);
  }, [updateFormField]);

  const addPart = useCallback(() => {
    setForm(prev => ({
      ...prev,
      parts: [...prev.parts, { description: '', partNumber: '', quantity: '', waiting: false }]
    }));
  }, [setForm]);

  const handlePartWaitingChange = useCallback((idx, checked) => {
    setForm(prev => {
      const updated = [...prev.parts];
      updated[idx] = { ...updated[idx], waiting: checked };
      return { ...prev, parts: updated };
    });
  }, [setForm]);

  const handlePartChange = useCallback((idx, field, value) => {
    setForm(prev => {
      const updated = [...prev.parts];
      updated[idx][field] = value;
      return { ...prev, parts: updated };
    });
  }, [setForm]);

  const removePart = useCallback((idx) => {
    setForm(prev => {
      if (prev.parts.length === 1) return prev; // Keep at least one
      const updated = prev.parts.filter((_, i) => i !== idx);
      return { ...prev, parts: updated };
    });
  }, [setForm]);

  const handleDeletePhoto = useCallback(async (photoId) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return;

    try {
      await API.delete(`/api/photos/${photoId}`);
      const refreshed = await API.get(`/api/photos/${form.workOrderNo}`);
      setWorkOrderPhotos(refreshed.data || []);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete photo.');
    }
  }, [form.workOrderNo]);

  const addTimeLog = useCallback(() => {
    setForm(prev => {
      const prevLogs = prev.timeLogs;
      const lastTech = prevLogs.length > 0 ? prevLogs[prevLogs.length - 1].technicianAssigned : '';
      return {
        ...prev,
        timeLogs: [
          ...prevLogs,
          {
            technicianAssigned: lastTech,
            assignDate: new Date().toISOString().slice(0, 10),
            startTime: '',
            finishTime: '',
            travelTime: ''
          }
        ]
      };
    });
  }, [setForm]);

  const handleTimeLogChange = useCallback((idx, e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const updated = [...prev.timeLogs];
      updated[idx][name] = value;
      return { ...prev, timeLogs: updated };
    });
  }, [setForm]);

  const removeTimeLog = useCallback((idx) => {
    setForm(prev => {
      if (prev.timeLogs.length === 1) return prev;
      const updated = prev.timeLogs.filter((_, i) => i !== idx);
      return { ...prev, timeLogs: updated };
    });
  }, [setForm]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    // Validation
    const errors = validateForm(form);
    if (errors.length > 0) {
      alert(errors.join('\n'));
      return;
    }

    setFormLoading(true);
    
    try {
      const cleanedParts = (form.parts || []).filter(part => {
        const partNumber = (part.partNumber || '').trim();
        const description = (part.description || '').trim();
        const quantity = Number(part.quantity || 0);
        return partNumber || description || quantity !== 0;
      });

      const cleanedForm = { ...form, parts: cleanedParts };

      if (id) {
        console.log('EDIT MODE: sending to API:', cleanedForm);
        await API.put(`/workorders/${form.workOrderNo}`, cleanedForm);
      } else {
        const assignedTimestamp = new Date().toISOString();
        const newForm = {
          ...cleanedForm,
          status: "Assigned",
          statusHistory: [{ status: "Assigned", date: assignedTimestamp }],
          assignedDays: 1
        };

        console.log('NEW MODE: sending to API:', newForm);
        await API.post('/workorders', newForm);
      }

      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to save work order:', err);
      alert('Failed to save work order. Please try again.');
    } finally {
      setFormLoading(false);
    }
  }, [form, id, navigate, setFormLoading]);

  const handleAssignAndPrintPDF = useCallback(async (e) => {
    e.preventDefault();
    
    // Validation
    const errors = validateForm(form);
    if (errors.length > 0) {
      alert(errors.join('\n'));
      return;
    }

    setFormLoading(true);
    
    try {
      const cleanedParts = (form.parts || []).filter(part => {
        const partNumber = (part.partNumber || '').trim();
        const description = (part.description || '').trim();
        const quantity = Number(part.quantity || 0);
        return partNumber || description || quantity !== 0;
      });

      const cleanedForm = { ...form, parts: cleanedParts };

      if (id) {
        console.log('EDIT MODE: sending to API:', cleanedForm);
        await API.put(`/workorders/${form.workOrderNo}`, cleanedForm);
      } else {
        const assignedTimestamp = new Date().toISOString();
        const newForm = {
          ...cleanedForm,
          status: "Assigned",
          statusHistory: [{ status: "Assigned", date: assignedTimestamp }],
          assignedDays: 1
        };

        console.log('NEW MODE: sending to API:', newForm);
        await API.post('/workorders', newForm);
      }

      // Generate PDF after successful assignment
      generatePDF(cleanedForm);

      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to save work order:', err);
      alert('Failed to save work order. Please try again.');
    } finally {
      setFormLoading(false);
    }
  }, [form, id, navigate, setFormLoading]);

  // Loading and error states
  if (masterLoading) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: '18px'
      }}>
        Loading form data...
      </div>
    );
  }

  if (masterError) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        color: '#ef4444'
      }}>
        {masterError}
      </div>
    );
  }

  if (formLoading) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: '18px'
      }}>
        Loading work order...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '8px', fontFamily: 'Arial' }}>
      <NavigationButton onBack={() => navigate(-1)} />
      
      <FormTable
        form={form}
        makes={makes}
        models={models}
        technicians={technicians}
        shops={shops}
        repairTypes={repairTypes}
        salesNames={salesNames}
        isInHouseRepair={isInHouseRepair}
        disabledIfInHouse={disabledIfInHouse}
        onChange={handleChange}
        onAddPart={addPart}
        onRemovePart={removePart}
        onPartChange={handlePartChange}
        onPartWaitingChange={handlePartWaitingChange}
        onAddTimeLog={addTimeLog}
        onRemoveTimeLog={removeTimeLog}
        onTimeLogChange={handleTimeLogChange}
        onSubmit={handleSubmit}
        onAssignAndPrintPDF={handleAssignAndPrintPDF}
        loading={formLoading}
        isEdit={!!id}
      />

      <SignatureSection
        form={form}
        signatureModalOpen={signatureModalOpen}
        setSignatureModalOpen={setSignatureModalOpen}
        sigPadRef={sigPadRef}
        setForm={setForm}
      />

      <PhotoSection
        workOrderPhotos={workOrderPhotos}
        onDeletePhoto={handleDeletePhoto}
      />
    </form>
  );
}

// Sub-components
const NavigationButton = ({ onBack }) => (
  <button
    type="button"
    onClick={onBack}
    style={{
      marginBottom: 18,
      padding: "8px 20px",
      background: "#ececec",
      border: "1px solid #ccc",
      borderRadius: 7,
      fontWeight: 600,
      cursor: "pointer"
    }}
  >
    &larr; Back
  </button>
);

const FormTable = ({
  form,
  makes,
  models,
  technicians,
  shops,
  repairTypes,
  salesNames,
  isInHouseRepair,
  disabledIfInHouse,
  onChange,
  onAddPart,
  onRemovePart,
  onPartChange,
  onPartWaitingChange,
  onAddTimeLog,
  onRemoveTimeLog,
  onTimeLogChange,
  onSubmit,
  onAssignAndPrintPDF,
  loading,
  isEdit
}) => (
  <table className="assign-table">
    <thead>
      <tr>
        <th>Company Name & Address</th>
        <th>Make</th>
        <th>Model</th>
        <th>Serial #</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      <CompanyInfoRow form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} makes={makes} models={models} />
      <FieldContactRow form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <ContactInfoRow form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <FieldAddressRow form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <FieldAddressRow2 form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <WorkTypeRow form={form} onChange={onChange} shops={shops} repairTypes={repairTypes} />
      <TechnicianRow form={form} technicians={technicians} onAddTimeLog={onAddTimeLog} onRemoveTimeLog={onRemoveTimeLog} onTimeLogChange={onTimeLogChange} />
      <SalesRow form={form} onChange={onChange} salesNames={salesNames} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <PartsRow form={form} onAddPart={onAddPart} onRemovePart={onRemovePart} onPartChange={onPartChange} onPartWaitingChange={onPartWaitingChange} />
      <WorkDescriptionRow form={form} onChange={onChange} />
      <TechSummaryRow form={form} onChange={onChange} />
      <SubmitRow onSubmit={onSubmit} onAssignAndPrintPDF={onAssignAndPrintPDF} loading={loading} isEdit={isEdit} />
    </tbody>
  </table>
);

const CompanyInfoRow = ({ form, onChange, disabledIfInHouse, isInHouseRepair, makes, models }) => (
  <tr>
    <td>
      <input
        name="companyName"
        value={form.companyName ?? ""}
        onChange={onChange}
        placeholder="Company Name"
        {...disabledIfInHouse}
          style={
            isInHouseRepair
              ? { backgroundColor: "#808080", color: "#808080" }
              : {}
          }
      />
    </td>
    <td>
      <select
        name="make"
        value={form.make ?? ""}
        onChange={onChange}
        required
        style={{ width: '100%' }}
      >
        <option value="">-- Select Make --</option>
        {makes.map(make => (
          <option key={make} value={make}>{make}</option>
        ))}
      </select>
    </td>
    <td>
      <select
        name="model"
        value={form.model ?? ""}
        onChange={onChange}
        required
        disabled={!form.make}
        style={{ width: '100%' }}
      >
        <option value="">-- Select Model --</option>
        {models.map(model => (
          <option key={model} value={model}>{model}</option>
        ))}
      </select>
    </td>
    <td>
      <input name="serialNumber" value={form.serialNumber ?? ""} onChange={onChange} />
    </td>
    <td>
      <input type="date" name="date" value={form.date ?? ""} onChange={onChange} />
    </td>
  </tr>
);

const FieldContactRow = ({ form, onChange, disabledIfInHouse, isInHouseRepair }) => (
  <tr>
    <td colSpan={2}>
      <input
        name="companyStreet"
        value={form.companyStreet ?? ""}
        onChange={onChange}
        placeholder="Company Street"
        {...disabledIfInHouse}
          style={
            isInHouseRepair
              ? { backgroundColor: "#808080", color: "#808080" }
              : {}
          }
      />
    </td>
    <th className="assign-table-header" colSpan={2}>
      Field Repair Point of Contact
    </th>
    <td className="assign-table-header">
      <strong>Work Order Number</strong>
    </td>
  </tr>
);

const ContactInfoRow = ({ form, onChange, disabledIfInHouse, isInHouseRepair }) => (
  <tr>
    <td colSpan={2}>
      <input
        name="companyCity"
        value={form.companyCity ?? ""}
        onChange={onChange}
        placeholder="Company City"
        {...disabledIfInHouse}
          style={
            isInHouseRepair
              ? { backgroundColor: "#808080", color: "#808080" }
              : {}
          }
      />
    </td>
    <td>
          <input
            name="fieldContact"
            value={form.fieldContact ?? ""}
            onChange={onChange}
            placeholder="Field Contact Name"
            style={
              form.repairType === "Field Repair"
                ? { backgroundColor: "#fff68f" }
                : {}
            }
          />

      </td>
      <td>
        <input
        name="fieldContactNumber"
        value={form.fieldContactNumber ?? ""}
        onChange={onChange}
        placeholder="Field Contact Phone"
        {...disabledIfInHouse}
            style={
              form.repairType === "Field Repair"
                ? { backgroundColor: "#fff68f" }
                : {}
            }
        />
      </td>
    <td>
      <input
        name="workOrderNo"
        value={form.workOrderNo ?? ""}
        readOnly
        className="assign-table-readonly"
      />
    </td>
  </tr>
);

const FieldAddressRow = ({ form, onChange, disabledIfInHouse, isInHouseRepair }) => (
  <tr>
    <td colSpan={2}>
      <input
        name="companyState"
        value={form.companyState ?? ""}
        onChange={onChange}
        placeholder="Company State"
        {...disabledIfInHouse}
          style={
            isInHouseRepair
              ? { backgroundColor: "#808080", color: "#808080" }
              : {}
          }
      />
    </td>
    <td>
      <input
        name="fieldStreet"
        value={form.fieldStreet ?? ""}
        onChange={onChange}
        placeholder="Field Street"
        {...disabledIfInHouse}
        style={
          isInHouseRepair
            ? { backgroundColor: "#808080", color: "#808080" }
            : form.repairType === "Field Repair"
            ? { backgroundColor: "#fff68f" }
            : {}
        }
      />
    </td>
    <td>
      <input
        name="fieldCity"
        value={form.fieldCity ?? ""}
        onChange={onChange}
        placeholder="Field City"
        {...disabledIfInHouse}
        style={
          isInHouseRepair
            ? { backgroundColor: "#808080", color: "#808080" }
            : form.repairType === "Field Repair"
            ? { backgroundColor: "#fff68f" }
            : {}
        }
      />
    </td>
    <td>
      <input
        name="poNumber"
        value={form.poNumber ?? ""}
        onChange={onChange}
        placeholder="PO Number"
      />
    </td>
  </tr>
);

const FieldAddressRow2 = ({ form, onChange, disabledIfInHouse, isInHouseRepair }) => (
  <tr>
    <td colSpan={2}>
      <input
        name="companyZip"
        value={form.companyZip ?? ""}
        onChange={onChange}
        placeholder="Company ZIP"
        {...disabledIfInHouse}
          style={
            isInHouseRepair
              ? { backgroundColor: "#808080", color: "#808080" }
              : {}
          }
      />
    </td>
    <td>
      <input
        name="fieldState"
        value={form.fieldState ?? ""}
        onChange={onChange}
        placeholder="Field State"
        {...disabledIfInHouse}
        style={
          isInHouseRepair
            ? { backgroundColor: "#808080", color: "#808080" }
            : form.repairType === "Field Repair"
            ? { backgroundColor: "#fff68f" }
            : {}
        }
      />
    </td>
    <td>
      <input
        name="fieldZipcode"
        value={form.fieldZipcode ?? ""}
        onChange={onChange}
        placeholder="Field ZIP"
        {...disabledIfInHouse}
        style={
          isInHouseRepair
            ? { backgroundColor: "#808080", color: "#808080" }
            : form.repairType === "Field Repair"
            ? { backgroundColor: "#fff68f" }
            : {}
        }
      />
    </td>
    <td style={{background: "#808080"}}></td>
  </tr>
);

const WorkTypeRow = ({ form, onChange, shops, repairTypes }) => (
  <>
    <tr>
      <th className="assign-table-header" colSpan={2}>
       Contact Info
      </th>
      
      <th className="assign-table-header" colSpan={1}>
       Work Type
      </th>
      <th className="assign-table-header" colSpan={1}>
       Shop Location
      </th>
      <th className="assign-table-header" colSpan={1}>
       GLLS / Customer Machine?
        </th>
    </tr>

    <tr>
      <td colSpan={2}>
        <input
          name="contactName"
          value={form.contactName ?? ""}
          onChange={onChange}
          placeholder="Contact Name"
        />
      </td> 
      <td style={{ background: '#fff', padding: 0, position:'relative'}}>
        <span style={{ float: 'left', paddingLeft: '8px', lineHeight: '24px'}}>GLLS Vendor Warranty</span>
        <div style={{
          position: 'absolute',
          left: '60%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}>
          <input
            type="checkbox"
            name="vendorWarranty"
            checked={form.vendorWarranty}
            onChange={onChange}
          /> 
        </div>
      </td>
      <td>
        <select
          name="shop"
          value={form.shop ?? ""}
          onChange={onChange}
          style={{ width: '100%' }}
          required
        >
          <option value="">-- Select Shop Location --</option>
          {shops.map(shop => (
            <option key={shop} value={shop}>{shop}</option>
          ))}
        </select>
      </td>
      <td>
        <select
          name="repairType"
          value={form.repairType ?? ""}
          onChange={onChange}
          style={{ width: '100%'}}
          required
        >
          <option value="">-- Select Repair Type --</option>
          {repairTypes.map((type, i) =>(
            <option key={i} value={type}>{type}</option>
          ))}
        </select>
      </td>
    </tr>
    <tr>
      <td colSpan={2}>
        <input
          name="contactPhone"
          value={form.contactPhone ?? ""}
          onChange={onChange}
          placeholder="Contact Phone"
        />
      </td>
      <td style={{ background: '#fff', padding: 0, position:'relative'}}>
        <span style={{ float: 'left', paddingLeft: '8px', lineHeight: '24px'}}>Billable</span>
        <div style={{
          position: 'absolute',
          left: '60%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}>
          <input
            type="checkbox"
            name="billable"
            checked={form.billable}
            onChange={onChange}
          /> 
        </div>
      </td>
      <td colSpan={2}
        style={{background:
          (form.make === "Other" || form.model === "Other") ? "#fff68f" : "#808080",
          transition: 'background 0.2s'
        }}
      >
        {(form.make === "Other" || form.model === "Other") && (
          <input
            name="otherDesc"
            value={form.otherDesc ?? ""}
            onChange={onChange}
            placeholder="Please Specify 'Other' Make & Model"
            required
            style={{
              width: "96%",
              border: "2px solid #ffab00",
              fontWeight: "bold"
            }}
          />
        )}
      </td>                  
    </tr>
    <tr>
      <td colSpan={2}>
        <input
          name="contactEmail"
          value={form.contactEmail ?? ""}
          onChange={onChange}
          placeholder="Contact Email"
        />
      </td>
      <td style={{ background: '#fff', padding: 0, position:'relative'}}>
        <span style={{ float: 'left', paddingLeft: '8px', lineHeight: '24px'}}>Maintenance</span>
        <div style={{
          position: 'absolute',
          left: '60%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}>
          <input
            type="checkbox"
            name="maintenance"
            checked={form.maintenance}
            onChange={onChange}
          /> 
        </div>
      </td>
      <td colSpan={2} style={{background: "#808080"}}></td>
    </tr>
    <tr>
      <td colSpan={2} style={{background:"#808080"}}></td>
      <td style={{ background: '#fff', padding: 0, position:'relative'}}>
        <span style={{ float: 'left', paddingLeft: '8px', lineHeight: '24px'}}>Non-billable Repair</span>
        <div style={{
          position: 'absolute',
          left: '60%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}>
          <input
            type="checkbox"
            name="nonBillableRepair"
            checked={form.nonBillableRepair}
            onChange={onChange}
          /> 
        </div>
      </td>
      <td colSpan={2} style={{background: "#808080"}}></td>
    </tr>
  </>
);

const TechnicianRow = ({ form, technicians, onAddTimeLog, onRemoveTimeLog, onTimeLogChange }) => (
  <>
    <tr>
      <th className="assign-table-header" colSpan={1}>
        Technician Assigned
      </th>
      <th className="assign-table-header" colSpan={1}>
        Date
      </th>
      <th className="assign-table-header" colSpan={1}>
        Start Time
      </th>
      <th className="assign-table-header" colSpan={1}>
        Finish Time
      </th>
      <th className="assign-table-header" colSpan={1}>
        Travel Time
      </th>
    </tr>
    {form.timeLogs.map((log, idx) => (
      <tr key={idx}>
        <td>
          <select
            name="technicianAssigned"
            value={log.technicianAssigned}
            onChange={e => onTimeLogChange(idx, e)}
            style={{ width: '100%' }}
            required
          >
            <option value="">-- Select Technician --</option>
            {technicians.map(tech => (
              <option key={tech} value={tech}>{tech}</option>
            ))}
          </select>
        </td>
        <td>
          <input
            type="date"
            name="assignDate"
            value={log.assignDate}
            onChange={e => onTimeLogChange(idx, e)}
            style={{ width: '100%' }}
            required
          />
        </td>
        <td>
          <input
            type="time"
            name="startTime"
            value={log.startTime}
            onChange={e => onTimeLogChange(idx, e)}
            style={{ width: '100%' }}
          />
        </td>
        <td>
          <input
            type="time"
            name="finishTime"
            value={log.finishTime}
            onChange={e => onTimeLogChange(idx, e)}
            style={{ width: '100%' }}
          />
        </td>
        <td>
          <input
            type="text"
            name="travelTime"
            value={log.travelTime}
            onChange={e => onTimeLogChange(idx, e)}
            placeholder="hh:mm"
            style={{ width: '70%', display: 'inline-block' }}
          />
          {form.timeLogs.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveTimeLog(idx)}
              style={{marginLeft: '8px', verticalAlign: 'middle', background: '#ffe0e0', border: '1px solid #f00', cursor: 'pointer', padding: '2px 8px'}}
              title="Remove this time log"
            >-</button>
          )}
        </td>
      </tr>
    ))}
    <tr>
      <td colSpan={5}>
        <button type="button" onClick={onAddTimeLog}>+ Add Time Log</button>
      </td>
    </tr>
  </>
);

const SalesRow = ({ form, onChange, salesNames, disabledIfInHouse, isInHouseRepair }) => (
  <>
    <tr>
      <th className="assign-table-header" colSpan={1}>
        Salesman
      </th>
      <th className="assign-table-header" colSpan={1}>
        Shipping Cost
      </th>
      <td colSpan={3} style={{background:"#808080"}}></td>
    </tr>
    <tr>
      <td>
        <select
          name="salesName"
          value={form.salesName ?? ""}
          onChange={onChange}
          {...disabledIfInHouse}
          style={isInHouseRepair ? { backgroundColor: "#808080", color: "#808080" } : {}}
        >
          <option value="">-- Select Sales Name --</option>
          {salesNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          name="shippingCost"
          value={form.shippingCost ?? ""}
          onChange={onChange}
          placeholder="Ex. 1234.00"
          type="number"
          min="0"
          step="0.01"
          {...disabledIfInHouse}
          style={
            isInHouseRepair
              ? { backgroundColor: "#808080", color: "#808080" }
              : {}
          }
        />
      </td>
      <td colSpan={3} style={{background: "#808080"}}></td>
    </tr>
  </>
);

const PartsRow = ({ form, onAddPart, onRemovePart, onPartChange, onPartWaitingChange }) => (
  <>
    <tr>
      <th className="assign-table-header" colSpan={1}>
        Part Number
      </th>
      <th className="assign-table-header" colSpan={1}>
        Part Name/ Description
      </th>
      <th className="assign-table-header" colSpan={1}>
        
      </th>
      <th className="assign-table-header" colSpan={1}>
        Quantity
      </th>
      <th className="assign-table-header" colSpan={1}>
        Pending Parts?
      </th>
    </tr>
    {form.parts.map((part, idx) => {
      const unitPrice = parseFloat(part.unitPrice) || 0;
      const quantity = parseFloat(part.quantity) || 0;
      const amount = unitPrice * quantity;
      return (
        <tr key={idx}>
          <td>
            <input
              name="partNumber"
              value={part.partNumber}
              onChange={e => onPartChange(idx, 'partNumber', e.target.value)}
              placeholder="Part Number"
            />
          </td>
          <td colSpan={2}>
            <input
              name="description"
              value={part.description}
              onChange={e => onPartChange(idx, 'description', e.target.value)}
              placeholder="Part Name/ Description"
            />
          </td>
          <td>
            <input
              name="quantity"
              value={part.quantity}
              onChange={e => onPartChange(idx, 'quantity', e.target.value)}
              placeholder="Quantity"
              type="number"
              min="0"
            />
          </td>
          <td>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: '100%',
              whiteSpace: 'nowrap',
            }}>
              <input
                type="checkbox"
                checked={part.waiting || false}
                onChange={e => onPartChange(idx, 'waiting', e.target.checked)}
                style={{
                  width: 18,
                  height: 18,
                  margin: 0,
                }}
              />
              <span style={{
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'center',
                lineHeight: 1.2,
              }}>
                Waiting on Part
              </span>
              {form.parts.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemovePart(idx)}
                  style={{
                    background: '#ffe0e0',
                    border: '1px solid #f00',
                    cursor: 'pointer',
                    padding: '2px 8px',
                    height: '20px',
                    minWidth: '30px',
                    fontSize: 14,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 80
                  }}
                  title="Remove this part"
                >-</button>
              )}
            </div>
          </td>
        </tr>
      );
    })}
    <tr>
      <td colSpan={1}>
        <button type="button" onClick={onAddPart}>Add Part</button>
      </td>
      <td colSpan={4} style={{background:"#808080"}}></td>
    </tr>
  </>
);

const WorkDescriptionRow = ({ form, onChange }) => (
  <>
    <tr>
      <th className="assing-table-header" colSpan={5} style={{textAlign:'center'}}>
        Work Description
      </th>
    </tr>
    <tr>
      <td colSpan={5}>
        <textarea
          name="workDescription"
          value={form.workDescription ?? ""}
          onChange={onChange}
          rows={3}
          style={{ width: '100%' }}
          placeholder="Brief Description of Work Completed"
          required
        />
      </td>
    </tr>
  </>
);

const TechSummaryRow = ({ form, onChange }) => (
  <>
    <tr>
      <th className="assign-table-header" colSpan={5} style={{textAlign:'center'}}>
        Tech Summary
      </th>
    </tr>
    <tr>
      <td colSpan={5}>
        <textarea
          name="notes"
          value={form.notes ?? ""}
          onChange={onChange}
          rows={3}
          style={{ width: '100%' }}
          placeholder="Notes"
        />
      </td>
    </tr>
  </>
);

const SubmitRow = ({ onSubmit, onAssignAndPrintPDF, loading, isEdit }) => (
  <tr>
    <td colSpan={5} style={{ textAlign: 'right' }}>
      {!isEdit && (
        <button 
          type="button"
          onClick={onAssignAndPrintPDF}
          disabled={loading}
          style={{
            marginRight: '8px', 
            background: '#2563eb', 
            color: 'white',
            border: '1px solid #2563eb', 
            borderRadius: 4, 
            padding: '4px 16px', 
            fontWeight: 'bold',
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Saving...' : 'Assign & Print PDF'}
        </button>
      )}
      <button 
        type="submit"
        disabled={loading}
        style={{
          marginRight: '8px', 
          background: '#adebb3', 
          border: '1px solid #aaa', 
          borderRadius: 4, 
          padding: '4px 16px', 
          fontWeight: 'bold',
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Saving...' : (isEdit ? 'Save Changes' : 'Assign')}
      </button>
    </td>
  </tr>
);

const SignatureSection = ({ form, signatureModalOpen, setSignatureModalOpen, sigPadRef, setForm }) => (
  <>
    {form.customerSignature !== undefined && (
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'flex-start', gap: 24 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 5 }}>
            Customer Acknowledgement Signature:
          </div>
          {form.customerSignature ? (
            <img
              src={form.customerSignature}
              alt="Customer Signature"
              style={{
                maxWidth: '100%',
                maxHeight: 160,
                border: '1px solid #ccc',
                padding: 6,
                background: '#f8f8f8',
                borderRadius: 6,
              }}
            />
          ) : null}

          <div style={{ fontStyle: 'italic', fontSize: 12, marginTop: 20, marginLeft: 78, color: '#666' }}>
            No signature provided yet
            {form.signatureTimestamp &&
              `Signed on: ${new Date(form.signatureTimestamp).toLocaleString()}`}
          </div>
        </div>

        <button
          type="button"
          style={{
            height: 42,
            padding: '10px 24px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 7,
            fontWeight: 600,
            fontSize: 16,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            marginTop: 24
          }}
          onClick={() => setSignatureModalOpen(true)}
        >
          Get Customer Signature
        </button>
      </div>
    )}

    {signatureModalOpen && (
      <div
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}
      >
        <div
          style={{
            background: '#fff',
            padding: 28,
            borderRadius: 14,
            boxShadow: '0 6px 40px rgba(0,0,0,0.14)',
            minWidth: 420,
          }}
        >
          <h2 style={{ textAlign: 'center', marginBottom: 16 }}>
            Customer Repair Acknowledgement
          </h2>
          <p style={{ textAlign: 'center', fontSize: 15, marginBottom: 10 }}>
            Please sign below to acknowledge the repair was completed.
          </p>
          <SignaturePad
            penColor="black"
            ref={sigPadRef}
            canvasProps={{
              width: 370,
              height: 140,
              className: 'sigCanvas',
              style: {
                border: '2px solid #888',
                borderRadius: 6,
                background: '#fff',
              },
            }}
          />
          <div
            style={{
              display: 'flex',
              gap: 16,
              justifyContent: 'center',
              marginTop: 16,
            }}
          >
            <button
              type="button"
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: 7,
                fontWeight: 600,
                fontSize: 16,
                padding: '9px 24px',
                color: '#333',
                cursor: 'pointer',
              }}
              onClick={() => sigPadRef.current.clear()}
            >
              Clear
            </button>
            <button
              type="button"
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontWeight: 600,
                fontSize: 16,
                padding: '9px 24px',
                cursor: 'pointer',
              }}
              onClick={() => {
                if (sigPadRef.current.isEmpty()) {
                  alert('Please sign before saving.');
                  return;
                }
                const dataURL = sigPadRef.current
                  .getCanvas()
                  .toDataURL('image/png');

                setForm(prev => ({
                  ...prev,
                  customerSignature: dataURL,
                  signatureTimestamp: new Date().toISOString()
                }));
                setSignatureModalOpen(false);
              }}
            >
              Save Signature
            </button>
            <button
              type="button"
              style={{
                background: '#aaa',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontWeight: 600,
                fontSize: 16,
                padding: '9px 24px',
                cursor: 'pointer',
              }}
              onClick={() => setSignatureModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);

const PhotoSection = ({ workOrderPhotos, onDeletePhoto }) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedPhoto(null);
  };



  return (
    <>
      {workOrderPhotos.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ marginBottom: 12 }}>Uploaded Photos</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {workOrderPhotos.map(photo => (
              <div key={photo.id} style={{ width: 180, position: 'relative' }}>
                <img
                  src={photo.url}
                  alt="Work Order"
                  style={{
                    width: '100%',
                    height: 120,
                    objectFit: 'cover',
                    borderRadius: 8,
                    border: '1px solid #ccc',
                    cursor: 'pointer'
                  }}
                  onClick={() => handlePhotoClick(photo)}
                  title="Click to view larger image"
                />
                {photo.description && (
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {photo.description}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onDeletePhoto(photo.id)}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    background: '#f44336',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: 24,
                    height: 24,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    lineHeight: '24px',
                    textAlign: 'center'
                  }}
                  title="Delete photo"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photo Modal */}
      {showModal && selectedPhoto && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleCloseModal}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontSize: '18px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Close"
            >
              ×
            </button>

            {/* Image */}
            <img
              src={selectedPhoto.url}
              alt="Work Order"
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                borderRadius: '8px',
                marginBottom: '16px'
              }}
            />

            {/* Description */}
            {selectedPhoto.description && (
              <div style={{ 
                marginBottom: '16px', 
                fontSize: '16px', 
                textAlign: 'center',
                color: '#333',
                maxWidth: '600px'
              }}>
                {selectedPhoto.description}
              </div>
            )}

            
          </div>
        </div>
      )}
    </>
  );
};
