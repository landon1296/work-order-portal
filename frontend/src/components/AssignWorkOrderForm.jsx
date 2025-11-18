import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import API from '../api';
import '../index.css';
import { default as SignaturePad } from 'react-signature-canvas';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import GLLSLogo from '../assets/GLLSLogo.png';
import logoBase64 from '../assets/logoBase64';
import { workOrderWS, useWebSocket, persistentWSManager } from '../utils/websocket';


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
    
    // Add timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.warn("PDF generation taking longer than expected...");
    }, 5000);

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
      ["PO Number", order.poNumber || ""],
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
      ["Status", order.status],
      ["Inbound Shipping", order.shippingCost || ""],
      ["Outbound Shipping", order.shipFromGllsCost || ""],
      ["Shipping Comments", order.shippingComments || ""]
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
      console.log(`Processing ${order.parts.length} parts for PDF generation...`);
      
      doc.setFont("helvetica", "bold");
      const partsStartY = y;
      doc.text("Parts Used", leftMargin, partsStartY);
      y += 6;

      // Filter out empty parts and ensure unique entries
      const validParts = order.parts.filter(p => {
        const partNumber = (p.partNumber || p.part_number || '').trim();
        const description = (p.description || '').trim();
        const quantity = Number(p.quantity || 0);
        return partNumber || description || quantity !== 0;
      });

      console.log(`Filtered to ${validParts.length} valid parts`);

      // Remove duplicates based on part number and description (optimized O(n) approach)
      const seenParts = new Set();
      const uniqueParts = validParts.filter(part => {
        const partNumber = (part.partNumber || part.part_number || '').trim();
        const description = (part.description || '').trim();
        const partKey = `${partNumber}-${description}`;
        
        if (seenParts.has(partKey)) {
          return false;
        }
        seenParts.add(partKey);
        return true;
      });

      console.log(`AssignWorkOrderForm PDF: Original parts count: ${order.parts.length}, Valid parts: ${validParts.length}, Unique parts: ${uniqueParts.length}`);
      
      // Limit parts to prevent memory issues (safety limit of 1000 parts)
      const partsToProcess = uniqueParts.slice(0, 1000);
      if (uniqueParts.length > 1000) {
        console.warn(`Warning: Truncating parts list from ${uniqueParts.length} to 1000 parts for PDF generation`);
      }

      doc.autoTable({
        startY: y,
        head: [["Part #", "Description", "Qty"]],
        body: partsToProcess.map(p => [
          p.partNumber || p.part_number || "", 
          p.description || "", 
          p.quantity || ""
        ]),
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
    
    // Clear timeout
    clearTimeout(timeoutId);
    console.log("PDF generation completed successfully");

  } catch (err) {
    clearTimeout(timeoutId);
    console.error("PDF generation failed:", err);
    alert('Failed to generate PDF. Please try again.');
  }
};

// Custom hooks
const useKeyboardNavigation = () => {
  const handleKeyDown = useCallback((e) => {
    // Handle Shift+Space to click focused buttons/checkboxes
    if (e.key === ' ' && e.shiftKey) {
      e.preventDefault();
      if (e.target.type === 'button' || e.target.type === 'checkbox') {
        e.target.click();
        return;
      }
    }
    
    // Only handle Enter, Shift+Enter, Tab, and Shift+Tab
    if (!['Enter', 'Tab'].includes(e.key)) return;
    
    // Skip if it's a textarea or select (allow normal behavior)
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    
    e.preventDefault();
    
    // Find all focusable elements in the form (excluding navigation buttons)
    const focusableElements = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    )).filter(el => {
      // Exclude navigation buttons and other non-form elements
      const isBackButton = el.textContent?.includes('Back') || el.textContent?.includes('←');
      const isSubmitButton = el.type === 'submit' || el.textContent?.includes('Assign') || el.textContent?.includes('Save');
      const isPhotoButton = el.textContent?.includes('Photo') || el.textContent?.includes('photo');
      const isSignatureButton = el.textContent?.includes('Signature') || el.textContent?.includes('signature');
      
      return !isBackButton && !isSubmitButton && !isPhotoButton && !isSignatureButton;
    });
    
    const currentIndex = focusableElements.indexOf(document.activeElement);
    if (currentIndex === -1) return;
    
    // Define the grid layout based on the ACTUAL form structure
    // Each row represents the actual table rows, columns represent fields within that row
    const gridLayout = [
      // Row 1: Company Info (5 columns)
      ['companyName', 'make', 'model', 'serialNumber', 'date'],
      // Row 2: Company Street (1 column, spans 2)
      ['companyStreet'],
      // Row 3: Company City | Field Contact Info (4 columns)
      ['companyCity', 'fieldContact', 'fieldContactNumber', 'workOrderNo'],
      // Row 4: Company State | Field Address | PO Number (4 columns)
      ['companyState', 'fieldStreet', 'fieldCity', 'poNumber'],
      // Row 5: Company Zip | Field State/Zip (3 columns)
      ['companyZip', 'fieldState', 'fieldZipcode'],
      // Row 6: Contact Info | Work Type | Shop | Repair Type (4 columns)
      ['contactName', 'vendorWarranty', 'shop', 'repairType'],
      // Row 7: Contact Phone | Billable checkbox (2 columns)
      ['contactPhone', 'billable'],
      // Row 8: Contact Email | Maintenance checkbox (2 columns)
      ['contactEmail', 'maintenance'],
      // Row 9: Non-billable repair checkbox (1 column)
      ['nonBillableRepair'],
      // Row 10: Technician Time Logs (5 columns)
      ['technicianAssigned', 'assignDate', 'startTime', 'finishTime', 'travelTime'],
      // Row 11: Add Time Log button (1 column)
      ['addTimeLog'],
      // Row 12: Sales & Shipping (4 columns)
      ['salesName', 'shippingCost', 'shipFromGllsCost', 'shippingComments'],
      // Row 13: Parts (5 columns)
      ['partNumber', 'description', 'quantity', 'waiting', 'estimatedDeliveryDate'],
      // Row 14: Add Part button (1 column)
      ['addPart'],
      // Row 15: Work Description (1 column)
      ['workDescription'],
      // Row 16: Notes (1 column)
      ['notes']
    ];
    
    // Find current field position in grid
    let currentRow = -1;
    let currentCol = -1;
    let fieldName = '';
    
    // Get field name from the focused element
    fieldName = e.target.name || '';
    
    // Find the field in the grid
    for (let row = 0; row < gridLayout.length; row++) {
      for (let col = 0; col < gridLayout[row].length; col++) {
        if (gridLayout[row][col] === fieldName) {
          currentRow = row;
          currentCol = col;
          break;
        }
      }
      if (currentRow !== -1) break;
    }
    
    // If we can't find the field in the grid, fall back to simple navigation
    if (currentRow === -1) {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Move to next element
        const nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
        focusableElements[nextIndex].focus();
      } else if (e.key === 'Enter' && e.shiftKey) {
        // Move to previous element
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
        focusableElements[prevIndex].focus();
      }
      return;
    }
    
    let nextRow = currentRow;
    let nextCol = currentCol;
    
    if (e.key === 'Tab') {
      // Tab: Move right, Shift+Tab: Move left
      if (e.shiftKey) {
        // Move left
        nextCol = currentCol - 1;
        if (nextCol < 0) {
          // Move to previous row, last column
          nextRow = currentRow - 1;
          if (nextRow < 0) {
            nextRow = gridLayout.length - 1; // Wrap to last row
          }
          nextCol = gridLayout[nextRow].length - 1;
        }
      } else {
        // Move right
        nextCol = currentCol + 1;
        if (nextCol >= gridLayout[currentRow].length) {
          // Move to next row, first column
          nextRow = currentRow + 1;
          if (nextRow >= gridLayout.length) {
            nextRow = 0; // Wrap to first row
          }
          nextCol = 0;
        }
      }
    } else if (e.key === 'Enter') {
      // Enter: Move down, Shift+Enter: Move up
      if (e.shiftKey) {
        // Move up
        nextRow = currentRow - 1;
        if (nextRow < 0) {
          nextRow = gridLayout.length - 1; // Wrap to last row
        }
        // Stay in same column, but don't exceed the target row's column count
        nextCol = Math.min(currentCol, gridLayout[nextRow].length - 1);
      } else {
        // Move down
        nextRow = currentRow + 1;
        if (nextRow >= gridLayout.length) {
          nextRow = 0; // Wrap to first row
        }
        // Stay in same column, but don't exceed the target row's column count
        nextCol = Math.min(currentCol, gridLayout[nextRow].length - 1);
      }
    }
    
    // Find the next field to focus
    const nextFieldName = gridLayout[nextRow][nextCol];
    console.log(`Navigating from ${fieldName} (row ${currentRow}, col ${currentCol}) to ${nextFieldName} (row ${nextRow}, col ${nextCol})`);
    
    let nextElement = focusableElements.find(el => 
      el.name === nextFieldName
    );
    
    console.log(`Found ${focusableElements.length} focusable elements. Looking for field: ${nextFieldName}`);
    if (nextElement) {
      console.log(`Found element by name:`, nextElement);
    }
    
    // If exact match not found, try some common variations
    if (!nextElement && nextFieldName) {
      if (nextFieldName === 'vendorWarranty') {
        nextElement = focusableElements.find(el => 
          el.type === 'checkbox' && el.name === 'vendorWarranty'
        );
      } else if (nextFieldName === 'billable') {
        nextElement = focusableElements.find(el => 
          el.type === 'checkbox' && el.name === 'billable'
        );
      } else if (nextFieldName === 'maintenance') {
        nextElement = focusableElements.find(el => 
          el.type === 'checkbox' && el.name === 'maintenance'
        );
      } else if (nextFieldName === 'nonBillableRepair') {
        nextElement = focusableElements.find(el => 
          el.type === 'checkbox' && el.name === 'nonBillableRepair'
        );
      } else if (nextFieldName === 'waiting') {
        // For parts waiting checkboxes, find the first one
        nextElement = focusableElements.find(el => 
          el.type === 'checkbox' && el.checked !== undefined
        );
      } else if (nextFieldName === 'addTimeLog') {
        // Find the "Add Time Log" button specifically
        nextElement = focusableElements.find(el => 
          el.type === 'button' && el.textContent?.includes('Add Time Log')
        );
        console.log(`Looking for Add Time Log button. Found:`, nextElement);
      } else if (nextFieldName === 'addPart') {
        // Find the "Add Part" button specifically
        nextElement = focusableElements.find(el => 
          el.type === 'button' && el.textContent?.includes('Add Part')
        );
        console.log(`Looking for Add Part button. Found:`, nextElement);
      } else if (nextFieldName === 'technicianAssigned') {
        // Find technician dropdown (first one in time logs)
        nextElement = focusableElements.find(el => 
          el.tagName === 'SELECT' && el.name === 'technicianAssigned'
        );
      } else if (nextFieldName === 'assignDate') {
        // Find assign date input (first one in time logs)
        nextElement = focusableElements.find(el => 
          el.type === 'date' && el.name === 'assignDate'
        );
      } else if (nextFieldName === 'startTime') {
        // Find start time input (first one in time logs)
        nextElement = focusableElements.find(el => 
          el.type === 'time' && el.name === 'startTime'
        );
      } else if (nextFieldName === 'finishTime') {
        // Find finish time input (first one in time logs)
        nextElement = focusableElements.find(el => 
          el.type === 'time' && el.name === 'finishTime'
        );
      } else if (nextFieldName === 'travelTime') {
        // Find travel time input (first one in time logs)
        nextElement = focusableElements.find(el => 
          el.type === 'text' && el.name === 'travelTime'
        );
      }
    }
    
    if (nextElement) {
      console.log(`Successfully found element, focusing:`, nextElement);
      nextElement.focus();
    } else {
      console.log(`No element found for ${nextFieldName}, using fallback navigation`);
      // Fallback: move to next/previous element in DOM order
      if (e.key === 'Enter' && !e.shiftKey) {
        const nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
        focusableElements[nextIndex].focus();
      } else if (e.key === 'Enter' && e.shiftKey) {
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
        focusableElements[prevIndex].focus();
      } else if (e.key === 'Tab' && !e.shiftKey) {
        const nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
        focusableElements[nextIndex].focus();
      } else if (e.key === 'Tab' && e.shiftKey) {
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
        focusableElements[prevIndex].focus();
      }
    }
  }, []);

  return { handleKeyDown };
};

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
    shipFromGllsCost: '',
    shippingComments: '',
    notes: '',
    parts: [{ partNumber: '', description: '', quantity: '', waiting: false, estimatedDeliveryDate: '' }],
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
export default function AssignWorkOrderForm({ token, user, editMode = false, prefilledData = null, onSuccess = null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Keyboard navigation
  const { handleKeyDown } = useKeyboardNavigation();
  
  // WebSocket connection status
  const connectionStatus = useWebSocket(user?.token);
  const [wsConnected, setWsConnected] = useState(false);
  
  // Active users in this work order
  const [activeUsers, setActiveUsers] = useState({});

  // Update WebSocket connection status
  useEffect(() => {
    console.log('AssignWorkOrderForm: WebSocket connection status changed:', connectionStatus.connected);
    // Fix: Handle undefined connection status
    setWsConnected(connectionStatus.connected === true);
    
    // Additional check: Direct WebSocket connection status
    if (workOrderWS && workOrderWS.socket) {
      const isConnected = workOrderWS.connected;
      console.log('AssignWorkOrderForm: Direct WebSocket connection status:', isConnected);
      setWsConnected(isConnected);
    }
  }, [connectionStatus.connected, workOrderWS]);

  // WebSocket event listeners for user activity tracking
  useEffect(() => {
    if (id && token && user) {
      // Join the specific work order room
      workOrderWS.joinWorkOrder(id);
      
      // Broadcast that this user is actively working on this work order
      const broadcastUserActivity = () => {
        if (workOrderWS.socket && workOrderWS.connected) {
          workOrderWS.socket.emit('user-activity', {
            workOrderNo: id,
            userId: user?.id || user?.username,
            userName: user?.username,
            userRole: user?.role,
            activity: editMode ? 'editing' : 'viewing',
            timestamp: new Date().toISOString()
          });
        }
      };
      
      // Broadcast immediately and then every 30 seconds
      broadcastUserActivity();
      const activityInterval = setInterval(broadcastUserActivity, 30000);

      return () => {
        // Clear the activity interval
        clearInterval(activityInterval);
        
        // Broadcast that this user is leaving the work order
        if (workOrderWS.socket && workOrderWS.connected) {
          workOrderWS.socket.emit('user-left', {
            workOrderNo: id,
            userId: user?.id || user?.username
          });
        }
        
        workOrderWS.leaveWorkOrder(id);
      };
    }
  }, [id, token, user?.id, user?.username, user?.role, editMode]);
  
  // Smart back navigation based on user role and referrer
  const getBackRoute = () => {
    // Check if we have a specific dashboard type in location state
    if (location.state?.dashboard) {
      console.log('Navigating back to dashboard type:', location.state.dashboard);
      // If we know the specific dashboard, we can navigate back to it
      // For now, just go to the main dashboard route
      return location.state.from || '/dashboard';
    }
    
    // Check if we have a referrer in location state
    if (location.state?.from) {
      console.log('Navigating back to:', location.state.from);
      return location.state.from;
    }
    
    // Default back routes based on user role
    const defaultRoute = (() => {
      switch (user?.role) {
        case 'manager':
        case 'analytics':
        case 'owner':
          return '/dashboard';
        case 'accounting':
          return '/dashboard';
        case 'reception':
          return '/reception-dashboard';
        case 'technician':
        case 'tech':
          return '/tech-dashboard';
        default:
          return '/dashboard';
      }
    })();
    
    console.log('No referrer found, using default route:', defaultRoute, 'for user role:', user?.role);
    return defaultRoute;
  };
  
  const [nextWorkOrderNo, setNextWorkOrderNo] = useState('');
  const [workOrderPhotos, setWorkOrderPhotos] = useState([]);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const sigPadRef = useRef();
  
  // Photo upload state
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoDescription, setPhotoDescription] = useState('');
  

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

  // Handle prefilled data from scheduler
  useEffect(() => {
    if (prefilledData && !id) {
      console.log('Applying prefilled data:', prefilledData);
      setForm(prev => ({
        ...prev,
        ...prefilledData,
        // Ensure required arrays exist
        parts: prev.parts || [{ partNumber: '', description: '', quantity: '', waiting: false, estimatedDeliveryDate: '' }],
        timeLogs: prev.timeLogs || [{ technicianAssigned: '', assignDate: new Date().toISOString().slice(0, 10), startTime: '', finishTime: '', travelTime: '' }],
        // Map pickup data to work order format - Company info only
        companyStreet: prefilledData.address || '',
        companyCity: prefilledData.city || '',
        companyState: prefilledData.state || '',
        companyZip: prefilledData.zipcode || '',
        contactPhone: prefilledData.phoneNumber || '',
        contactEmail: prefilledData.email || '',
        // Field repair POC info - leave empty (not prefilled)
        fieldContact: '',
        fieldContactNumber: '',
        fieldStreet: '',
        fieldCity: '',
        fieldState: '',
        fieldZipcode: '',
        // Set default values for other fields
        poNumber: '',
        salesName: '',
        shippingCost: '',
        shipFromGllsCost: '',
        shippingComments: '',
        notes: prefilledData.notes || '',
        otherDesc: '',
        workDescription: '',
        repairType: '',
        vendorWarranty: false,
        billable: false,
        maintenance: false,
        nonBillableRepair: false
      }));
    }
  }, [prefilledData, id]);

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
          formObj.parts = Array.isArray(formObj.parts) ? formObj.parts : [{ partNumber: '', description: '', quantity: '', waiting: false, estimatedDeliveryDate: '' }];
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
            'contactName', 'contactPhone', 'contactEmail', 'salesName', 'shippingCost', 'shipFromGllsCost', 'shippingComments', 'notes', 'otherDesc', 'workDescription'
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

    // Register this form's update handler with the persistent WebSocket manager
    if (id) {
      const updateHandler = {
        updateWithData: (newData) => {
          console.log('AssignWorkOrderForm: Received real-time update data:', newData);
          
          // Data is now already in camelCase from backend, just handle date format
          const mappedData = { ...newData };
          if (mappedData.date && typeof mappedData.date === 'string' && mappedData.date.includes('T')) {
            // Convert ISO date to YYYY-MM-DD format for form input
            const dateValue = new Date(mappedData.date);
            mappedData.date = dateValue.toISOString().split('T')[0];
          }
          
          console.log('AssignWorkOrderForm: Processed data:', mappedData);
          
          // Update form with new data and add visual feedback
          setForm(prevForm => {
            const updatedForm = { ...prevForm, ...mappedData };
            
            // Add temporary highlight to changed fields
            highlightChangedFields(prevForm, updatedForm);
            
            return updatedForm;
          });
        }
      };
      
      persistentWSManager.registerWorkOrderForm(id, updateHandler);
      
      // Subscribe to user activity updates
      const unsubscribeUserActivity = persistentWSManager.subscribe('user-activity', (data) => {
        console.log('AssignWorkOrderForm: User activity update:', data);
        if (data.workOrderNo === id) {
          setActiveUsers(prev => ({
            ...prev,
            [data.userId]: {
              userId: data.userId,
              userName: data.userName,
              userRole: data.userRole,
              activity: data.activity,
              timestamp: data.timestamp
            }
          }));
        }
      });

      // Subscribe to user leaving work order
      const unsubscribeUserLeft = persistentWSManager.subscribe('user-left', (data) => {
        console.log('AssignWorkOrderForm: User left work order:', data);
        if (data.workOrderNo === id) {
          setActiveUsers(prev => {
            const updated = { ...prev };
            if (updated[data.userId]) {
              delete updated[data.userId];
            }
            return updated;
          });
        }
      });

      // Store unsubscribe functions for cleanup
      window.assignWorkOrderUnsubscribers = [
        unsubscribeUserActivity,
        unsubscribeUserLeft
      ];

      // Broadcast that this user is viewing the work order (with a small delay to ensure listeners are set up)
      if (wsConnected && user) {
        const broadcastUserActivity = () => {
          const userActivityData = {
            workOrderNo: id,
            userId: user.id || user.username,
            userName: user.name || user.username,
            userRole: user.role,
            activity: 'viewing'
          };
          
          console.log('AssignWorkOrderForm: Broadcasting user activity:', userActivityData);
          workOrderWS?.socket?.emit('user-activity', userActivityData);
        };
        
        // Broadcast immediately with a delay, then every 30 seconds
        setTimeout(broadcastUserActivity, 500);
        const activityInterval = setInterval(broadcastUserActivity, 30000);
        
        // Store the interval for cleanup
        window.assignWorkOrderActivityInterval = activityInterval;
      }
    }

    return () => {
      // Unregister when component unmounts
      if (id) {
        persistentWSManager.unregisterWorkOrderForm(id);
        
        // Unsubscribe from user activity events
        if (window.assignWorkOrderUnsubscribers) {
          window.assignWorkOrderUnsubscribers.forEach(unsub => unsub());
          delete window.assignWorkOrderUnsubscribers;
        }
        
        // Clear the activity interval
        if (window.assignWorkOrderActivityInterval) {
          clearInterval(window.assignWorkOrderActivityInterval);
          delete window.assignWorkOrderActivityInterval;
        }
        
        // Broadcast that user left the work order
        if (wsConnected && user) {
          const userLeftData = {
            workOrderNo: id,
            userId: user.id || user.username
          };
          workOrderWS?.socket?.emit('user-left', userLeftData);
        }
      }
      // Clear any pending highlight timeout
      if (window.highlightTimeout) {
        clearTimeout(window.highlightTimeout);
        window.highlightTimeout = null;
      }
    };
  }, [id, setForm, setFormLoading, wsConnected, user]);

  // Track when form was last modified to prevent refresh during editing
  const [lastModified, setLastModified] = useState(null);

  // Track highlighted fields for real-time updates
  const [highlightedFields, setHighlightedFields] = useState(new Set());

  // Function to highlight changed fields
  const highlightChangedFields = (oldForm, newForm) => {
    console.log('highlightChangedFields: Comparing forms...');
    
    const changedFields = new Set();
    
    // Compare fields that can be changed and highlighted
    // Note: We'll check parts separately to avoid interference
    const fieldsToCheck = [
      'notes', 'companyName', 'companyStreet', 'companyCity', 'companyState', 'companyZip',
      'make', 'model', 'serialNumber', 'repairType', 'assignedTech', 'shop', 'salesName',
      'workDescription', 'poNumber', 'timeLogs', 'status',
      'contactName', 'contactPhone', 'contactEmail', 'fieldContact', 'fieldContactNumber'
    ];
    
    // Check parts separately with more intelligent comparison
    const partsChanged = JSON.stringify(oldForm.parts || []) !== JSON.stringify(newForm.parts || []);
    
    fieldsToCheck.forEach(key => {
      if (oldForm[key] !== newForm[key]) {
        console.log(`Field changed: ${key} - Old: "${oldForm[key]}" New: "${newForm[key]}"`);
        changedFields.add(key);
      }
    });
    
    // Add parts to changed fields if parts actually changed
    if (partsChanged) {
      console.log('Parts changed - adding to highlighted fields');
      changedFields.add('parts');
    }
    
    console.log('Changed fields:', Array.from(changedFields));
    
    // Only highlight if there are actual meaningful changes
    if (changedFields.size > 0) {
      console.log('Setting highlights for fields:', Array.from(changedFields));
      setHighlightedFields(changedFields);
      
      // Clear any existing timeout to prevent conflicts
      if (window.highlightTimeout) {
        clearTimeout(window.highlightTimeout);
      }
      
      // Remove highlight after 3 seconds
      window.highlightTimeout = setTimeout(() => {
        console.log('Removing highlights after 3 seconds');
        setHighlightedFields(new Set());
        window.highlightTimeout = null;
      }, 3000);
    } else {
      console.log('No meaningful changes detected, skipping highlight');
    }
  };

  // Helper function to get field styling with highlight
  const getFieldStyle = (fieldName) => {
    if (highlightedFields.has(fieldName)) {
      console.log(`🎯 getFieldStyle: HIGHLIGHTING FIELD ${fieldName.toUpperCase()} - Current highlighted fields:`, Array.from(highlightedFields));
      return {
        className: 'field-highlighted'
      };
    }
    
    return {};
  };

  // Periodic refresh disabled - was causing form content to be deleted
  // useEffect(() => {
  //   if (!id) return;
  //   
  //   const interval = setInterval(async () => {
  //     const now = Date.now();
  //     // Only refresh if form hasn't been modified in the last 10 seconds
  //     if (!lastModified || (now - lastModified) > 10000) {
  //       try {
  //         const res = await API.get(`/workorders/${id}`);
  //         if (res.data) {
  //           let formObj = toCamelCaseDeep(res.data);
  //         
  //         // Format dates
  //         if (formObj.date) formObj.date = String(formObj.date).slice(0, 10);
  //         
  //         // Handle field contact fallback
  //         if (!formObj.fieldContact && formObj.fieldContactName) {
  //           formObj.fieldContact = formObj.fieldContactName;
  //         }
  //         
  //         // Ensure arrays exist
  //         formObj.parts = Array.isArray(formObj.parts) ? formObj.parts : [{ partNumber: '', description: '', quantity: '', waiting: false, estimatedDeliveryDate: '' }];
  //         formObj.timeLogs = Array.isArray(formObj.timeLogs) ? formObj.timeLogs : [{ technicianAssigned: '', assignDate: '', startTime: '', finishTime: '', travelTime: '' }];
  //         
  //         // Format time log dates
  //         formObj.timeLogs = formObj.timeLogs.map(log => ({
  //           ...log,
  //           assignDate: log.assignDate ? String(log.assignDate).slice(0, 10) : new Date().toISOString().slice(0, 10)
  //         }));

  //         // Set default values for required fields
  //         const requiredFields = [
  //           'companyName', 'companyStreet', 'companyCity', 'companyState', 'companyZip',
  //           'fieldContact', 'fieldContactNumber', 'fieldStreet', 'fieldCity', 'fieldState', 'fieldZipcode',
  //           'poNumber', 'make', 'model', 'serialNumber', 'date',
  //           'contactName', 'contactPhone', 'contactEmail', 'salesName', 'shippingCost', 'shippingComments', 'notes', 'otherDesc', 'workDescription'
  //         ];
  //         
  //         requiredFields.forEach(field => {
  //           if (formObj[field] === undefined || formObj[field] === null) formObj[field] = '';
  //         });

  //         // Patch customerSignature
  //         let sig = formObj.customerSignature;
  //         if (typeof sig !== "string" || !sig) sig = null;
  //         formObj.customerSignature = sig;

  //         // Patch statusHistory
  //         formObj.statusHistory = Array.isArray(formObj.statusHistory) ? formObj.statusHistory : [];

  //         if (!formObj.status) formObj.status = "Assigned";

  //         setForm(prev => ({
  //           ...prev,
  //           ...formObj,
  //         }));
  //       }
  //     } catch (err) {
  //       // Silently fail for periodic refresh
  //     }
  //     }
  //   }, 5000);
  //   
  //   return () => clearInterval(interval);
  // }, [id, setForm, lastModified]);

  // STATUS AUTOMATION LOGIC (only run when editing existing work orders)
  // Only monitors parts waiting status - no automatic Assigned → In Progress change
  // Track previous waiting state to only run automation when it changes
  const [prevWaitingState, setPrevWaitingState] = useState(null);
  
  useEffect(() => {
    if (!id || !form.workOrderNo) return; // Only run when editing existing work orders
    if (!form.status || form.status.toLowerCase().startsWith('completed')) return;
    
    const anyWaiting = (form.parts || []).some(part => part.waiting);
    
    // Only run automation if the waiting state actually changed
    if (prevWaitingState === anyWaiting) return;
    setPrevWaitingState(anyWaiting);
    
    const now = new Date().toISOString();

    if (anyWaiting && form.status !== 'In Progress, Pending Parts' && form.status !== 'In Progress, Pending Parts (Ordered)') {
      // When parts are first marked as waiting, set to "In Progress, Pending Parts"
      const updatedForm = {
        ...form,
        status: 'In Progress, Pending Parts',
        statusHistory: [
          ...(Array.isArray(form.statusHistory) ? form.statusHistory : []),
          { status: 'In Progress, Pending Parts', date: now, updatedBy: user.username || user.name || 'System' }
        ]
      };
      
      console.log("AUTOMATION: sending status update:", updatedForm);
      setForm(updatedForm);

      API.put(`/workorders/${form.workOrderNo}`, updatedForm, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    } else if (!anyWaiting && (form.status === 'In Progress, Pending Parts' || form.status === 'In Progress, Pending Parts (Ordered)')) {
      // When parts are no longer waiting, go back to "In Progress"
      const updatedForm = {
        ...form,
        status: 'In Progress',
        statusHistory: [
          ...(Array.isArray(form.statusHistory) ? form.statusHistory : []),
          { status: 'In Progress', date: now, updatedBy: user.username || user.name || 'System' }
        ]
      };
      setForm(updatedForm);
      API.put(`/workorders/${form.workOrderNo}`, updatedForm, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
  }, [form.parts, form.status, id, form.workOrderNo, token, prevWaitingState]);

  // Event handlers
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    
    // Update last modified timestamp
    setLastModified(Date.now());
    
    let newValue = value;

    // Auto-format phone numbers
    if (name === 'contactPhone' || name === 'fieldContactNumber') {
      newValue = formatPhoneNumber(value);
    }

    updateFormField(name, type === 'checkbox' ? checked : newValue);
  }, [updateFormField]);

  // Auto-fill GLLS for company fields when repair type is "GLLS Machine"
  const handleRepairTypeChange = useCallback((e) => {
    const { value } = e.target;
    updateFormField('repairType', value);
    
    if (value === 'GLLS Machine') {
      // Auto-fill company fields with GLLS
      updateFormField('companyName', 'GLLS');
      updateFormField('companyStreet', 'GLLS');
      updateFormField('companyCity', 'GLLS');
      updateFormField('companyState', 'GLLS');
      updateFormField('companyZip', 'GLLS');
    }
  }, [updateFormField]);

  const addPart = useCallback(() => {
    // Update last modified timestamp
    setLastModified(Date.now());
    setForm(prev => ({
      ...prev,
      parts: [...prev.parts, { description: '', partNumber: '', quantity: '', waiting: false, estimatedDeliveryDate: '' }]
    }));
  }, [setForm]);

  const handlePartWaitingChange = useCallback((idx, checked) => {
    setLastModified(Date.now());
    setForm(prev => {
      const updated = [...prev.parts];
      updated[idx] = { ...updated[idx], waiting: checked };
      return { ...prev, parts: updated };
    });
  }, [setForm]);

  const handlePartChange = useCallback((idx, field, value) => {
    // Update last modified timestamp
    setLastModified(Date.now());
    
    setForm(prev => {
      const updated = [...prev.parts];
      updated[idx][field] = value;
      return { ...prev, parts: updated };
    });
  }, [setForm]);

  const removePart = useCallback((idx) => {
    // Update last modified timestamp
    setLastModified(Date.now());
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

  const handleUploadPhoto = useCallback(async () => {
    if (!selectedPhoto || !form.workOrderNo) {
      alert('Please select a photo and ensure Work Order No is loaded.');
      return;
    }

    const formData = new FormData();
    formData.append('photo', selectedPhoto);
    formData.append('description', photoDescription);
    formData.append('workOrderNo', form.workOrderNo);

    try {
      await API.post('/api/photos/upload', formData);
      alert('Photo uploaded!');
      // Refresh the photo list
      const refreshed = await API.get(`/api/photos/${form.workOrderNo}`);
      setWorkOrderPhotos(refreshed.data || []);
      setSelectedPhoto(null);
      setPhotoDescription('');
      setPhotoModalOpen(false);
    } catch (err) {
      alert('Upload failed.');
      console.error(err);
    }
  }, [selectedPhoto, photoDescription, form.workOrderNo]);

  const addTimeLog = useCallback(() => {
    // Update last modified timestamp
    setLastModified(Date.now());
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
    
    // Update last modified timestamp
    setLastModified(Date.now());
    
    setForm(prev => {
      const updated = [...prev.timeLogs];
      updated[idx][name] = value;
      return { ...prev, timeLogs: updated };
    });
  }, [setForm]);

  const removeTimeLog = useCallback((idx) => {
    // Update last modified timestamp
    setLastModified(Date.now());
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
          statusHistory: [{ status: "Assigned", date: assignedTimestamp, updatedBy: user.username || user.name || 'System' }],
          assignedDays: 1
        };

        console.log('NEW MODE: sending to API:', JSON.stringify(newForm, null, 2));
        const response = await API.post('/workorders', newForm);
        console.log('NEW MODE: API response:', response.data);
        
        // Call onSuccess callback if provided (for scheduler integration)
        if (onSuccess) {
          onSuccess(newForm);
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err) {
      console.error('❌ Failed to save work order:', err);
      console.error('❌ Full error object:', JSON.stringify(err, null, 2));
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Unknown error occurred';
      console.error('❌ Error details:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: errorMessage,
        fullResponse: err.response
      });
      alert(`Failed to save work order: ${errorMessage}\n\nCheck console for details.`);
    } finally {
      setFormLoading(false);
    }
  }, [form, id, navigate, setFormLoading]);

  const handleAssignAndPrintPDF = useCallback(async (e) => {
    e.preventDefault();
    
    // Show loading state
    setFormLoading(true);
    
    try {
      // Validation
      const errors = validateForm(form);
      if (errors.length > 0) {
        alert(errors.join('\n'));
        setFormLoading(false);
        return;
      }
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
          statusHistory: [{ status: "Assigned", date: assignedTimestamp, updatedBy: user.username || user.name || 'System' }],
          assignedDays: 1
        };

        console.log('NEW MODE: sending to API:', JSON.stringify(newForm, null, 2));
        const response = await API.post('/workorders', newForm);
        console.log('NEW MODE: API response:', response.data);
      }

      // Generate PDF after successful assignment
      console.log('Generating PDF for work order...');
      generatePDF(cleanedForm);
      console.log('PDF generation completed');

      // Call onSuccess callback if provided (for scheduler integration)
      if (onSuccess) {
        onSuccess(cleanedForm);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('❌ Failed to save work order:', err);
      console.error('❌ Full error object:', JSON.stringify(err, null, 2));
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Unknown error occurred';
      console.error('❌ Error details:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: errorMessage,
        fullResponse: err.response
      });
      alert(`Failed to save work order: ${errorMessage}\n\nCheck console for details.`);
    } finally {
      setFormLoading(false);
    }
  }, [form, id, navigate, setFormLoading]);

  // PhotoSection component definition
  const PhotoSection = ({ workOrderPhotos, onDeletePhoto }) => {
    const [viewingPhoto, setViewingPhoto] = useState(null);
    const [showViewModal, setShowViewModal] = useState(false);

    const handlePhotoClick = (photo) => {
      setViewingPhoto(photo);
      setShowViewModal(true);
    };

    const handleCloseViewModal = () => {
      setShowViewModal(false);
      setViewingPhoto(null);
    };

    return (
      <>
        {/* Add Photo Button */}
        <div style={{ marginTop: 32 }}>
          <button
            type="button"
            style={{
              marginBottom: 16,
              padding: '10px 30px',
              background: '#10b981',
              color: '#fff',
              borderRadius: 7,
              fontWeight: 600,
              fontSize: 18,
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => setPhotoModalOpen(true)}
          >
            Add Photo(s)/Document(s)
          </button>
        </div>

        {workOrderPhotos.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Uploaded Photos & Documents</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {workOrderPhotos.map(photo => {
                const isPDF = photo.url.toLowerCase().includes('.pdf') || photo.url.toLowerCase().includes('pdf');
                
                return (
                  <div key={photo.id} style={{ width: 180, position: 'relative' }}>
                    {isPDF ? (
                      <div
                        style={{
                          width: '100%',
                          height: 120,
                          border: '1px solid #ccc',
                          borderRadius: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#f8f9fa',
                          cursor: 'pointer'
                        }}
                        onClick={() => window.open(photo.url, '_blank')}
                        title="Click to open PDF"
                      >
                        <div style={{ fontSize: 32, color: '#dc3545', marginBottom: 8 }}>📄</div>
                        <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>PDF Document</div>
                      </div>
                    ) : (
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
                    )}
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
                      title="Delete file"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Photo Viewing Modal */}
        {showViewModal && viewingPhoto && (
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
            onClick={handleCloseViewModal}
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
                onClick={handleCloseViewModal}
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
                src={viewingPhoto.url}
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
              {viewingPhoto.description && (
                <div style={{ 
                  marginBottom: '16px', 
                  fontSize: '16px', 
                  textAlign: 'center',
                  color: '#333',
                  maxWidth: '600px'
                }}>
                  {viewingPhoto.description}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  };

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
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} style={{ padding: '8px', fontFamily: 'Arial' }}>
      <NavigationButton onBack={() => navigate(getBackRoute())} />
      
      {/* WebSocket Connection Status */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        marginBottom: '16px' 
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderRadius: '20px',
          background: wsConnected ? '#10b981' : '#ef4444',
          color: 'white',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'white',
            marginRight: '8px',
            animation: wsConnected ? 'pulse 2s infinite' : 'none'
          }} />
          {wsConnected ? 'Live Updates Connected' : 'Live Updates Disconnected'}
        </div>
        
        {/* Active Users Indicator */}
        {Object.keys(activeUsers).length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '500',
            backgroundColor: '#3b82f6',
            color: 'white',
            marginLeft: '10px'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'white',
              marginRight: '8px',
              animation: 'pulse 2s infinite'
            }} />
            {Object.keys(activeUsers).length} user{Object.keys(activeUsers).length > 1 ? 's' : ''} active
          </div>
        )}
      </div>
      
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
        handleRepairTypeChange={handleRepairTypeChange}
        onAddPart={addPart}
        onRemovePart={removePart}
        onPartChange={handlePartChange}
        onPartWaitingChange={handlePartWaitingChange}
        onAddTimeLog={addTimeLog}
        onRemoveTimeLog={removeTimeLog}
        onTimeLogChange={handleTimeLogChange}
        onSubmit={handleSubmit}
        getFieldStyle={getFieldStyle}
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

      {/* Photo Upload Modal */}
      {photoModalOpen && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.4)',
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
              maxWidth: 500,
              width: '90%',
            }}
          >
            <h2 style={{ textAlign: 'center', marginBottom: 16 }}>Upload Photo/Document</h2>

            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setSelectedPhoto(e.target.files[0])}
              style={{ marginBottom: 12, width: '100%' }}
            />

            <textarea
              rows={2}
              placeholder="Optional description..."
              value={photoDescription}
              onChange={(e) => setPhotoDescription(e.target.value)}
              style={{ marginBottom: 16, width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
            />

            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setPhotoModalOpen(false);
                  setSelectedPhoto(null);
                  setPhotoDescription('');
                }}
                style={{
                  padding: '8px 16px',
                  background: '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUploadPhoto}
                style={{
                  padding: '8px 16px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
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
  handleRepairTypeChange,
  onAddPart,
  onRemovePart,
  onPartChange,
  onPartWaitingChange,
  onAddTimeLog,
  onRemoveTimeLog,
  onTimeLogChange,
  onSubmit,
  getFieldStyle,
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
      <CompanyInfoRow form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} makes={makes} models={models} getFieldStyle={getFieldStyle} />
      <FieldContactRow form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <ContactInfoRow form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <FieldAddressRow form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <FieldAddressRow2 form={form} onChange={onChange} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <WorkTypeRow form={form} onChange={onChange} handleRepairTypeChange={handleRepairTypeChange} shops={shops} repairTypes={repairTypes} />
      <TechnicianRow form={form} technicians={technicians} onAddTimeLog={onAddTimeLog} onRemoveTimeLog={onRemoveTimeLog} onTimeLogChange={onTimeLogChange} />
      <SalesRow form={form} onChange={onChange} salesNames={salesNames} disabledIfInHouse={disabledIfInHouse} isInHouseRepair={isInHouseRepair} />
      <PartsRow form={form} onAddPart={onAddPart} onRemovePart={onRemovePart} onPartChange={onPartChange} onPartWaitingChange={onPartWaitingChange} getFieldStyle={getFieldStyle} />
      <WorkDescriptionRow form={form} onChange={onChange} />
      <TechSummaryRow form={form} onChange={onChange} getFieldStyle={getFieldStyle} />
      
      {/* Status History Section */}
      {Array.isArray(form.statusHistory) && form.statusHistory.length > 0 && (
        <tr>
          <td colSpan={5}>
            <div style={{margin: "16px 0"}}>
              <h4>Status History</h4>
              <ul>
                {form.statusHistory.map((s, i) => (
                  <li key={i}>
                    <strong>{s.status}</strong>: {new Date(s.date).toLocaleString()}
                    {s.updatedBy && <span style={{ color: '#666', marginLeft: '8px' }}>(by {s.updatedBy})</span>}
                  </li>
                ))}
              </ul>
            </div>
          </td>
        </tr>
      )}
      
      <SubmitRow onSubmit={onSubmit} onAssignAndPrintPDF={onAssignAndPrintPDF} loading={loading} isEdit={isEdit} />
    </tbody>
  </table>
);

const CompanyInfoRow = ({ form, onChange, disabledIfInHouse, isInHouseRepair, makes, models, getFieldStyle }) => (
  <tr>
    <td>
      <input
        name="companyName"
        data-field="companyName"
        value={form.companyName ?? ""}
        {...getFieldStyle('companyName')}
        onChange={onChange}
        placeholder="Company Name"
      />
    </td>
    <td>
      <select
        name="make"
        data-field="make"
        value={form.make ?? ""}
        style={{width: '100%'}}
        {...getFieldStyle('make')}
        onChange={onChange}
        required
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
        data-field="model"
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
      <input 
        name="serialNumber" 
        data-field="serialNumber"
        value={form.serialNumber ?? ""} 
        onChange={onChange} 
      />
    </td>
    <td>
      <input 
        type="date" 
        name="date" 
        data-field="date"
        value={form.date ?? ""} 
        onChange={onChange} 
      />
    </td>
  </tr>
);

const FieldContactRow = ({ form, onChange, disabledIfInHouse, isInHouseRepair }) => (
  <tr>
    <td colSpan={2}>
      <input
        name="companyStreet"
        data-field="companyStreet"
        value={form.companyStreet ?? ""}
        onChange={onChange}
        placeholder="Company Street"
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
        data-field="companyCity"
        value={form.companyCity ?? ""}
        onChange={onChange}
        placeholder="Company City"
      />
    </td>
    <td>
          <input
            name="fieldContact"
            data-field="fieldContact"
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
        data-field="fieldContactNumber"
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

const WorkTypeRow = ({ form, onChange, handleRepairTypeChange, shops, repairTypes }) => (
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
          onChange={handleRepairTypeChange}
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
        Inbound Shipping
      </th>
      <th className="assign-table-header" colSpan={1}>
        Outbound Shipping
      </th>
      <th className="assign-table-header" colSpan={2} style={{textAlign:'left'}}>
        Shipping Comments
      </th>
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
      <td>
        <input
          name="shipFromGllsCost"
          value={form.shipFromGllsCost ?? ""}
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
      <td colSpan={2} style={{textAlign:'left'}}>
        <input
          name="shippingComments"
          value={form.shippingComments ?? ""}
          onChange={onChange}
          placeholder="Shipping Comments"
        
        />
    </td>
    </tr>
  </>
);

const PartsRow = ({ form, onAddPart, onRemovePart, onPartChange, onPartWaitingChange, getFieldStyle }) => (
  <>
    <tr>
      <th className="assign-table-header" colSpan={1} style={getFieldStyle('parts')}>
        Part Number
      </th>
      <th className="assign-table-header" colSpan={1} style={getFieldStyle('parts')}>
        Part Name/ Description
      </th>
      <th className="assign-table-header" colSpan={1} style={getFieldStyle('parts')}>
        Quantity
      </th>
      <th className="assign-table-header" colSpan={1} style={getFieldStyle('parts')}>
        Pending Parts?
      </th>
      <th className="assign-table-header" colSpan={1} style={getFieldStyle('parts')}>
        Est. Delivery Date
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
          <td>
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
          <td>
            <input
              type="date"
              value={part.estimatedDeliveryDate || ""}
              onChange={e => onPartChange(idx, 'estimatedDeliveryDate', e.target.value)}
              style={{
                width: '100%',
                opacity: part.waiting ? 1 : 0.5,
                pointerEvents: part.waiting ? 'auto' : 'none'
              }}
              disabled={!part.waiting}
              placeholder="Est. Delivery Date"
            />
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

const TechSummaryRow = ({ form, onChange, getFieldStyle }) => (
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
          style={{width: '100%'}}
          {...getFieldStyle('notes')}
          onChange={onChange}
          rows={3}
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

                setLastModified(Date.now());
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
    

