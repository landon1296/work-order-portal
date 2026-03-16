import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import API from '../api';
import '../index.css';
import axios from 'axios';
import { default as SignaturePad } from 'react-signature-canvas';
import { workOrderWS, useWebSocket, persistentWSManager } from '../utils/websocket';

// Custom hook for keyboard navigation
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
    
    // Define the grid layout for TechWorkOrderForm (similar to AssignWorkOrderForm)
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
      // Row 13: Parts (3 columns)
      ['partNumber', 'description', 'quantity'],
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
    let nextElement = focusableElements.find(el => 
      el.name === nextFieldName
    );
    
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
      } else if (nextFieldName === 'addTimeLog') {
        // Find the "Add Time Log" button specifically
        nextElement = focusableElements.find(el => 
          el.type === 'button' && el.textContent?.includes('Add Time Log')
        );
      } else if (nextFieldName === 'addPart') {
        // Find the "Add Part" button specifically
        nextElement = focusableElements.find(el => 
          el.type === 'button' && el.textContent?.includes('Add Part')
        );
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
      nextElement.focus();
    } else {
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

function toCamelCaseDeep(obj) {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCaseDeep);
  } else if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, val]) => [
        key.replace(/_([a-z])/g, g => g[1].toUpperCase()),
        toCamelCaseDeep(val)
      ])
    );
  }
  return obj;
}



export default function TechWorkOrderForm({ token, user }) {
  const { id } = useParams();
  const location = useLocation();
  const isPreview = new URLSearchParams(location.search).get('preview') === 'true';
  const navigate = useNavigate();
  
  // Keyboard navigation
  const { handleKeyDown } = useKeyboardNavigation();
  
  // WebSocket hooks
  const { connectionStatus } = useWebSocket(token);
  const [wsConnected, setWsConnected] = useState(false);
  
  // Active users in this work order
  const [activeUsers, setActiveUsers] = useState({});
  
  // Highlighted fields for real-time updates
  const [highlightedFields, setHighlightedFields] = useState(new Set());

  // Refs to track WebSocket resources for manual cleanup
  const activityIntervalRef = useRef(null);
  const unsubscribeRefs = useRef({
    workOrderUpdate: null,
    userActivity: null,
    userLeft: null
  });
  const isCleaningUpRef = useRef(false);
  
  // Smart back navigation based on user role and referrer
  const getBackRoute = () => {
    // Check if we have a referrer in location state
    if (location.state?.from) {
      return location.state.from;
    }
    
    // Default back routes based on user role
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
  };
  
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoDescription, setPhotoDescription] = useState('');



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
    contactEmail:'',
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
    shipFromGllsCost: '',
    shippingComments: '',
    notes: '',
    parts: [{ description:'', partNumber:'', quantity:'', waiting: false, estimatedDeliveryDate: '' }],
    status: 'Assigned',
    statusHistory: [],
    customerSignature: null,
    signatureTimestamp: null
  });

    const [printedName, setPrintedName] = useState('');
    const [makes, setMakes] = useState([]);
    const [models, setModels] = useState([]);
    const [makeModelMap, setMakeModelMap] = useState({});
    const prevMakeRef = useRef();
    const [partsMemory, setPartsMemory] = useState([]);
    const [signatureModalOpen, setSignatureModalOpen] = useState(false);
    const sigPadRef = useRef();


const [workOrderPhotos, setWorkOrderPhotos] = useState([]);

useEffect(() => {
  if (!form.workOrderNo) return;

  API.get(`/api/photos/${form.workOrderNo}`)
    .then(res => setWorkOrderPhotos(res.data || []))
    .catch(() => setWorkOrderPhotos([]));
}, [form.workOrderNo]);


const handleUploadPhoto = async () => {
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
    // Refresh the thumbnail list
const refreshed = await API.get(`/api/photos/${form.workOrderNo}`);
setWorkOrderPhotos(refreshed.data || []);
    setSelectedPhoto(null);
    setPhotoDescription('');
    setPhotoModalOpen(false);
  } catch (err) {
    alert('Upload failed.');
    console.error(err);
  }
};

const handleDeletePhoto = async (photoId) => {
  if (!window.confirm('Are you sure you want to delete this photo?')) return;

  try {
    await API.delete(`/api/photos/${photoId}`);

    // Refresh photo list
    const refreshed = await API.get(`/api/photos/${form.workOrderNo}`);
    setWorkOrderPhotos(refreshed.data || []);
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Failed to delete photo.');
  }
};


  // Track if we have loaded work order from API yet
  const [loaded, setLoaded] = useState(false);
  
  // Track when form was last modified to prevent refresh during editing
  const [lastModified, setLastModified] = useState(null);

  // Update WebSocket connection status
  useEffect(() => {
    setWsConnected(connectionStatus.connected);
  }, [connectionStatus.connected]);

  // Fetch work order data (fixed initialization order)
  const fetchWorkOrderData = useCallback(() => {
    if (!id) return;
    console.log('TechWorkOrderForm: Fetching work order data for ID:', id);
    // Add cache-busting parameter to ensure fresh data
    const timestamp = Date.now();
    API.get(`/workorders/${id}?_t=${timestamp}`)
      .then(res => {
        console.log('TechWorkOrderForm: Received work order data:', res.data);
        if (res.data) {
          let formObj = toCamelCaseDeep(res.data);

          // Map legacy fieldContactName to fieldContact if needed
          if (!formObj.fieldContact && formObj.fieldContactName)
            formObj.fieldContact = formObj.fieldContactName;

          // Format main date
          if (formObj.date) formObj.date = String(formObj.date).slice(0, 10);

        // Format timeLogs dates
        formObj.timeLogs = Array.isArray(formObj.timeLogs) ? formObj.timeLogs.map(log => ({
          ...log,
          assignDate: log.assignDate
            ? String(log.assignDate).slice(0, 10)
            : new Date().toISOString().slice(0, 10)
        })) : [{
          technicianAssigned: "",
          assignDate: new Date().toISOString().slice(0, 10),
          startTime: "",
          finishTime: "",
          travelTime: ""
        }];

        // Patch parts array
        formObj.parts = Array.isArray(formObj.parts) ? formObj.parts : [{
          partNumber: "",
          description: "",
          quantity: "",
          waiting: false,
          estimatedDeliveryDate: ""
        }];

        // Patch all string fields
        [
          "companyName", "companyStreet", "companyCity", "companyState", "companyZip",
          "fieldContact", "fieldContactNumber", "fieldStreet", "fieldCity", "fieldState", "fieldZipcode",
          "poNumber", "make", "model", "serialNumber", "date",
          "contactName", "contactPhone", "contactEmail", "salesName", "shippingCost", "shipFromGllsCost", "shippingComments", "notes", "otherDesc", "workDescription"
        ].forEach(field => {
          if (formObj[field] === undefined || formObj[field] === null) formObj[field] = "";
        });

        // Patch customerSignature
        let sig = formObj.customerSignature;
        if (typeof sig !== "string" || !sig) sig = null;
        formObj.customerSignature = sig;

        // Patch statusHistory
        formObj.statusHistory = Array.isArray(formObj.statusHistory) ? formObj.statusHistory : [];

if (!formObj.status) formObj.status = "Assigned";

        setForm(prev => ({
          ...prev,
          ...formObj,
        }));
      }

      setLoaded(true);
    })
    .catch(() => { setLoaded(true); });
  }, [id]);

  // Function to highlight changed fields
  const highlightChangedFields = (oldForm, newForm) => {
    console.log('TechWorkOrderForm: highlightChangedFields: Comparing forms...');
    
    const changedFields = new Set();
    
    // Compare fields that can be changed and highlighted
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
        console.log(`TechWorkOrderForm: Field changed: ${key} - Old: "${oldForm[key]}" New: "${newForm[key]}"`);
        changedFields.add(key);
      }
    });
    
    // Add parts to changed fields if parts actually changed
    if (partsChanged) {
      console.log('TechWorkOrderForm: Parts changed - adding to highlighted fields');
      changedFields.add('parts');
    }
    
    console.log('TechWorkOrderForm: Changed fields:', Array.from(changedFields));
    
    // Only highlight if there are actual meaningful changes
    if (changedFields.size > 0) {
      console.log('TechWorkOrderForm: Setting highlights for fields:', Array.from(changedFields));
      setHighlightedFields(changedFields);
      
      // Clear any existing timeout to prevent conflicts
      if (window.highlightTimeout) {
        clearTimeout(window.highlightTimeout);
      }
      
      // Remove highlight after 3 seconds
      window.highlightTimeout = setTimeout(() => {
        console.log('TechWorkOrderForm: Removing highlights after 3 seconds');
        setHighlightedFields(new Set());
        window.highlightTimeout = null;
      }, 3000);
    } else {
      console.log('TechWorkOrderForm: No meaningful changes detected, skipping highlight');
    }
  };

  // Helper function to get field styling with highlighting
  const getFieldStyle = (fieldName) => {
    if (highlightedFields.has(fieldName)) {
      console.log(`🎯 TechWorkOrderForm: HIGHLIGHTING FIELD ${fieldName.toUpperCase()} - Current highlighted fields:`, Array.from(highlightedFields));
      return {
        className: 'field-highlighted'
      };
    }
    
    return {};
  };

  // WebSocket event listeners for this specific work order
  useEffect(() => {
    // Reset cleanup flag when effect runs (e.g., when id or token changes)
    isCleaningUpRef.current = false;
    
    if (id && token) {
      // Join the specific work order room
      workOrderWS.joinWorkOrder(id);
      
      // Broadcast that this user is actively working on this work order
      const broadcastUserActivity = () => {
        if (workOrderWS.socket && workOrderWS.connected && !isCleaningUpRef.current) {
          workOrderWS.socket.emit('user-activity', {
            workOrderNo: id,
            userId: user?.id || user?.username,
            userName: user?.username,
            userRole: user?.role,
            activity: 'editing',
            timestamp: new Date().toISOString()
          });
        }
      };
      
      // Broadcast immediately and then every 30 seconds
      broadcastUserActivity();
      activityIntervalRef.current = setInterval(broadcastUserActivity, 30000);

      // Subscribe to updates for this specific work order
      const unsubscribeWorkOrderUpdate = workOrderWS.subscribe('workorder-update', (data) => {
        if (isCleaningUpRef.current) return; // Don't process if cleaning up
        
        if (data.workOrderNo === id) {
          console.log('Work order updated via WebSocket:', data);
          
          // Clear service worker cache to ensure fresh data
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            console.log('TechWorkOrderForm: Sending CLEAR_API_CACHE message to service worker');
            navigator.serviceWorker.controller.postMessage({
              type: 'CLEAR_API_CACHE'
            });
          } else {
            console.log('TechWorkOrderForm: Service worker not available for cache clearing');
          }
          
          // Update local form state if it's a parts update
          if (data.updateType === 'parts-updated' && data.data.parts) {
            setForm(prev => ({
              ...prev,
              parts: data.data.parts
            }));
          } else if (data.updateType === 'updated') {
            // Refresh the entire form if work order was updated
            // Add a small delay to ensure cache is cleared
            setTimeout(() => {
              if (!isCleaningUpRef.current) {
                console.log('TechWorkOrderForm: Refreshing form data after WebSocket update');
                fetchWorkOrderData();
              }
            }, 500);
          }
        }
      });
      unsubscribeRefs.current.workOrderUpdate = unsubscribeWorkOrderUpdate;

      // Subscribe to user activity updates
      const unsubscribeUserActivity = workOrderWS.subscribe('user-activity', (data) => {
        if (isCleaningUpRef.current) return; // Don't process if cleaning up
        
        console.log('TechWorkOrderForm: User activity update:', data);
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
      unsubscribeRefs.current.userActivity = unsubscribeUserActivity;

      // Subscribe to user leaving work order
      const unsubscribeUserLeft = workOrderWS.subscribe('user-left', (data) => {
        if (isCleaningUpRef.current) return; // Don't process if cleaning up
        
        console.log('TechWorkOrderForm: User left work order:', data);
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
      unsubscribeRefs.current.userLeft = unsubscribeUserLeft;

      return () => {
        // Clear the activity interval
        if (activityIntervalRef.current) {
          clearInterval(activityIntervalRef.current);
          activityIntervalRef.current = null;
        }
        
        // Broadcast that this user is leaving the work order
        if (workOrderWS.socket && workOrderWS.connected) {
          workOrderWS.socket.emit('user-left', {
            workOrderNo: id,
            userId: user?.id || user?.username
          });
        }
        
        workOrderWS.leaveWorkOrder(id);
        
        // Unsubscribe from all events
        if (unsubscribeRefs.current.workOrderUpdate) {
          unsubscribeRefs.current.workOrderUpdate();
          unsubscribeRefs.current.workOrderUpdate = null;
        }
        if (unsubscribeRefs.current.userActivity) {
          unsubscribeRefs.current.userActivity();
          unsubscribeRefs.current.userActivity = null;
        }
        if (unsubscribeRefs.current.userLeft) {
          unsubscribeRefs.current.userLeft();
          unsubscribeRefs.current.userLeft = null;
        }
      };
    }
  }, [id, token, fetchWorkOrderData, user?.id, user?.username, user?.role]);

  // Cleanup function to be called before navigation
  const cleanupWebSocketResources = useCallback(() => {
    if (isCleaningUpRef.current) return; // Already cleaning up
    isCleaningUpRef.current = true;
    
    console.log('TechWorkOrderForm: Cleaning up WebSocket resources before navigation');
    
    // Clear the activity interval immediately
    if (activityIntervalRef.current) {
      clearInterval(activityIntervalRef.current);
      activityIntervalRef.current = null;
    }
    
    // Broadcast that user is leaving
    if (workOrderWS.socket && workOrderWS.connected && id) {
      try {
        workOrderWS.socket.emit('user-left', {
          workOrderNo: id,
          userId: user?.id || user?.username
        });
      } catch (e) {
        console.error('Error emitting user-left:', e);
      }
    }
    
    // Leave work order room
    if (id) {
      workOrderWS.leaveWorkOrder(id);
    }
    
    // Unsubscribe from all events
    if (unsubscribeRefs.current.workOrderUpdate) {
      try {
        unsubscribeRefs.current.workOrderUpdate();
      } catch (e) {
        console.error('Error unsubscribing workOrderUpdate:', e);
      }
      unsubscribeRefs.current.workOrderUpdate = null;
    }
    if (unsubscribeRefs.current.userActivity) {
      try {
        unsubscribeRefs.current.userActivity();
      } catch (e) {
        console.error('Error unsubscribing userActivity:', e);
      }
      unsubscribeRefs.current.userActivity = null;
    }
    if (unsubscribeRefs.current.userLeft) {
      try {
        unsubscribeRefs.current.userLeft();
      } catch (e) {
        console.error('Error unsubscribing userLeft:', e);
      }
      unsubscribeRefs.current.userLeft = null;
    }
  }, [id, user?.id, user?.username]);

  // Initial fetch
  useEffect(() => {
    fetchWorkOrderData();

    // Register this form's smart update handler with the persistent WebSocket manager
    if (id) {
      const updateHandler = {
        updateWithData: (newData) => {
          console.log('TechWorkOrderForm: Received real-time update data:', newData);
          
          // Data is now already in camelCase from backend, just handle date format
          const mappedData = { ...newData };
          if (mappedData.date && typeof mappedData.date === 'string' && mappedData.date.includes('T')) {
            // Convert ISO date to YYYY-MM-DD format for form input
            const dateValue = new Date(mappedData.date);
            mappedData.date = dateValue.toISOString().split('T')[0];
          }
          
          console.log('TechWorkOrderForm: Processed data:', mappedData);
          
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
    }

    return () => {
      // Unregister when component unmounts
      if (id) {
        persistentWSManager.unregisterWorkOrderForm(id);
      }
      // Clear any pending highlight timeout
      if (window.highlightTimeout) {
        clearTimeout(window.highlightTimeout);
        window.highlightTimeout = null;
      }
    };
  }, [fetchWorkOrderData, id]);

  // Periodic refresh disabled - was causing form content to be deleted
  // useEffect(() => {
  //   if (!loaded) return;
  //   
  //   const interval = setInterval(() => {
  //     const now = Date.now();
  //     // Only refresh if form hasn't been modified in the last 10 seconds
  //     if (!lastModified || (now - lastModified) > 10000) {
  //       fetchWorkOrderData();
  //     }
  //   }, 5000);
  //   
  //   return () => clearInterval(interval);
  // }, [loaded, fetchWorkOrderData, lastModified]);



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

useEffect(() => {
  if (form.make && makeModelMap[form.make]) {
    setModels(makeModelMap[form.make]);
    // Only clear the model if the make actually changed (not on mount)
    if (prevMakeRef.current !== undefined && prevMakeRef.current !== form.make) {
      setLastModified(Date.now());
      setForm(prev => ({ ...prev, model: '' }));
    }
    prevMakeRef.current = form.make;
  } else {
    setModels([]);
  }
}, [form.make, makeModelMap]);



  // STATUS AUTOMATION LOGIC (only run after loaded)
  useEffect(() => {
    console.log("STATUS AUTO-UPDATE useEffect fired!", { loaded, status: form.status, statusHistory: form.statusHistory });
    if (!loaded || isPreview) return;
    // Only update if status is 'Assigned' and not already in history as In Progress
if (
        form.status &&
        form.status.toLowerCase() === 'assigned' &&
        !(Array.isArray(form.statusHistory) ? form.statusHistory : []).some(h => h.status === 'In Progress')
      ) {
      const now = new Date().toISOString();
      const updatedForm = {
        ...form,
        status: 'In Progress',
        statusHistory: [
          ...(Array.isArray(form.statusHistory) ? form.statusHistory : [])
,
          { status: 'In Progress', date: now, updatedBy: user.username || user.name || 'System' }
        ]
      };
      
      console.log("AUTOMATION: sending status update:", updatedForm);
      setForm(updatedForm);

      API.put(`/workorders/${form.workOrderNo}`, updatedForm).catch(() => {});
    }
    // eslint-disable-next-line
  }, [form.status, id, loaded]);

  // in progress ↔ in progress, pending parts (only after loaded)
  // Track previous waiting state to only run automation when it changes
  const [prevWaitingState, setPrevWaitingState] = useState(null);
  
  useEffect(() => {
    if (!loaded) return;
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

      API.put(`/workorders/${form.workOrderNo}`, updatedForm).catch(() => {});
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
      API.put(`/workorders/${form.workOrderNo}`, updatedForm).catch(() => {});
    }
    // eslint-disable-next-line
  }, [form.parts, form.status, id, loaded, prevWaitingState]);

  // Dropdown options
  const [technicians, setTechnicians] = useState([]);
  useEffect(() => {
    API.get('/api/masters/technicians')
      .then(res => setTechnicians(res.data))
      .catch(() => setTechnicians([]));
  }, []);
  const [shops, setShops] = useState([]);
  useEffect(() => {
    API.get('/api/masters/shops')
      .then(res => setShops(res.data))
      .catch(() => setShops([]));
  }, []);
  const [repairTypes, setRepairTypes] = useState([]);
  useEffect(() => {
    API.get('/api/masters/repairTypes')
      .then(res => setRepairTypes(res.data))
      .catch(() => setRepairTypes([]));
  }, []);
  const [salesNames, setSalesNames] = useState([]);
  useEffect(() => {
    API.get('/api/masters/salesnames')
      .then(res => setSalesNames(res.data))
      .catch(()=>setSalesNames([]));
  }, []);
useEffect(() => {
  API.get('/api/parts/memory-live')
    .then(res => setPartsMemory(res.data))
    .catch(() => setPartsMemory([]));
}, []);



  // Form handlers
const handleChange = e => {
  const { name, value, type, checked } = e.target;

  // Update last modified timestamp
  setLastModified(Date.now());

  let newValue = value;

  // Auto-format phone numbers
  if (name === 'contactPhone' || name === 'fieldContactNumber') {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length >= 7) {
      newValue = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length >= 4) {
      newValue = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else if (digits.length >= 1) {
      newValue = `(${digits}`;
    }
  }

  setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : newValue }));
};

  const addPart = () => {
    // Update last modified timestamp
    setLastModified(Date.now());
    // Don't auto-populate quantity for Joe
    const isJoe = user?.username?.toLowerCase() === 'joe' || user?.name?.toLowerCase() === 'joe';
    const defaultQuantity = isJoe ? '' : '1';
    setForm(prev => ({ ...prev, parts: [...prev.parts, { description:'', partNumber:'', quantity: defaultQuantity, waiting: false, estimatedDeliveryDate: '' }] }));
  };

  // Helper: Notify Office via backend API
async function notifyOffice(workOrder, idx) {
  // Always post alert, even if there are no emails!
  try {
    await API.post('/api/alerts', {
      workOrderNo: workOrder.workOrderNo,
      partNumber: workOrder.parts[idx]?.partNumber || 'Unknown',
    });
  } catch (e) {
    // Fail silently, alert is just a nice extra
  }

  try {
    // Now get emails and send email only if emails exist
    const res = await API.get('/api/notify/recipients');
    const emails = res.data.emails;
    if (!emails || emails.length === 0) return;

    const part = workOrder.parts[idx] || {};

    const subject = `Work Order ${workOrder.workOrderNo || ''}: Waiting on Part`;
    const text = `The technician has marked "Waiting on Part" for Work Order #${workOrder.workOrderNo || ''}.

Company: ${workOrder.companyName || ''}
Part Number: ${part.partNumber || ''}
Part Description: ${part.description || ''}
Date: ${workOrder.date || ''}`;

    await API.post('/api/notify/email', {
      to: emails.join(','),
      subject,
      text
    });

    alert('Notification sent to the Office!');
  } catch (err) {
    alert('Failed to send notification.');
    console.error(err);
  }
}


  const handlePartWaitingChange = (idx, checked) => {
      // If the user checks the box (not unchecking)
  if (checked) {
    const wantsNotify = window.confirm("Would you like to notify the Office?");
    if (wantsNotify) {
      // Fire off notification (we'll fill this in next)
      notifyOffice(form, idx);}}
    setLastModified(Date.now());
    setForm(prev => {
      const updated = [...prev.parts];
      updated[idx] = { ...updated[idx], waiting: checked };
      return { ...prev, parts: updated };
    });
  };


const handlePartChange = (idx, field, value) => {
  // Update last modified timestamp
  setLastModified(Date.now());
  
  setForm(prev => {
    const updated = [...prev.parts];
    updated[idx][field] = value;

    if (field === 'partNumber') {
      const inputVal = value.trim().toLowerCase();
      const found = partsMemory.find(mem => mem.partNumber.toLowerCase() === inputVal);
  if (found && !updated[idx].description?.trim()) {
    updated[idx].description = found.description;
  }
    }

    return { ...prev, parts: updated };
  });
};


  const removePart = idx => {
    // Update last modified timestamp
    setLastModified(Date.now());
    setForm(prev => {
      if (prev.parts.length === 1) return prev;
      const updated = prev.parts.filter((_, i) => i !== idx);
      return { ...prev, parts: updated };
    });
  };

  const addTimeLog = () => {
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
            assignDate: new Date().toISOString().slice(0,10),
            startTime: '',
            finishTime: '',
            travelTime: ''
          }
        ]
      };
    });
  };
  const handleTimeLogChange = (idx, e) => {
    const { name, value } = e.target;
    
    // Update last modified timestamp
    setLastModified(Date.now());
    
    setForm(prev => {
      const updated = [...prev.timeLogs];
      updated[idx][name] = value;
      return { ...prev, timeLogs: updated };
    });
  };
  const removeTimeLog = (idx) => {
    // Update last modified timestamp
    setLastModified(Date.now());
    setForm(prev => {
      if (prev.timeLogs.length === 1) return prev;
      const updated = prev.timeLogs.filter((_, i) => i !== idx);
      return { ...prev, timeLogs: updated };
    });
  };

  // Step 1: Set this up so we know when "In House Repair" is selected
  const isInHouseRepair = form.repairType === "GLLS Machine";
  const disabledIfInHouse = isInHouseRepair
    ? { disabled: true}
    : {};

  // Auto-fill GLLS for company fields when repair type is "GLLS Machine"
  const handleRepairTypeChange = useCallback((e) => {
    const { name, value } = e.target;
    
    if (name === 'repairType') {
      setLastModified(Date.now());
      setForm(prev => ({ ...prev, repairType: value }));
      
      if (value === 'GLLS Machine') {
        // Auto-fill company fields with GLLS
        setForm(prev => ({
          ...prev,
          repairType: value,
          companyName: 'GLLS',
          companyStreet: 'GLLS',
          companyCity: 'GLLS',
          companyState: 'GLLS',
          companyZip: 'GLLS'
        }));
      }
    } else {
      // Handle other fields normally
      const { type, checked } = e.target;
      setLastModified(Date.now());
      setForm(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  }, [setForm]);


  // Save progress (draft)
  const handleSaveProgress = async () => {
  try {
    console.log("Saving form.parts:", form.parts);

    await API.put(`/workorders/${form.workOrderNo}`, form);
    alert('Progress saved!');
    // Stay on the current page - no navigation
  } catch (err) {
    alert('Failed to save progress.');
    console.error(err);
  }
};

  // Save and close (save progress and navigate back to dashboard)
  const handleSaveAndClose = async () => {
    try {
      console.log("Saving form.parts:", form.parts);

      await API.put(`/workorders/${form.workOrderNo}`, form);
      alert('Progress saved!');
      
      // Navigate back to the appropriate dashboard based on user role
      if (user.role === "manager") {
        navigate("/dashboard");
      } else if (user.role === "accounting") {
        navigate("/accounting-dashboard");
      } else if (user.role === "technician") {
        navigate("/tech-dashboard");
      } else if (user.role === "analytics" || user.role === "owner") {
        navigate("/analytics");
      } else {
        navigate("/");
      }
    } catch (err) {
      alert('Failed to save progress.');
      console.error(err);
    }
  };

  // SUBMIT FOR REVIEW (set status to "Completed, Pending Approval")
  const handleSubmit = async (e) => {
    e.preventDefault();
    const urlParams = new URLSearchParams(window.location.search);
const isPreview = urlParams.get('preview') === 'true';
if (isPreview) {
  alert("You're in preview mode. Submit is disabled.");
  return;
}

    // Validation: At least one complete time log required
    const hasCompleteTimeLog = form.timeLogs.some(
      log =>
        log.technicianAssigned &&
        log.assignDate &&
        log.startTime &&
        log.finishTime
    );

    if (!hasCompleteTimeLog) {
      alert('At least one complete time log is required.');
      return;
    }
    try {
      const now = new Date().toISOString();
const cleanedParts = (form.parts || []).filter(part => {
  const partNumber = (part.partNumber || '').trim();
  const description = (part.description || '').trim();
  const quantity = Number(part.quantity || 0);
  return partNumber || description || quantity !== 0;
});

const updatedForm = { 
  ...form, 
  parts: cleanedParts,
  customerSignaturePrinted: printedName,
  status: "Completed, Pending Approval",
  statusHistory: [
    ...((Array.isArray(form.statusHistory) ? form.statusHistory : [])),
    { status: "Completed, Pending Approval", date: now, updatedBy: user.username || user.name || 'System' }
  ]
};

await API.put(`/workorders/${form.workOrderNo}`, updatedForm);

      navigate('/tech-dashboard');
    } catch (err) {
      alert('Failed to update work order. Please try again.');
      console.error(err);
    }
  };
  if (typeof form.customerSignature !== 'string' && form.customerSignature !== null) {
  console.error("customerSignature is not a string!", form.customerSignature);
}
console.log("typeof form.customerSignature", typeof form.customerSignature, form.customerSignature);
console.log("form", form);



  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} autoComplete="off" style={{ padding: '8px', fontFamily: 'Arial' }}>
      {/* WebSocket status indicator */}
      {wsConnected && (
        <div style={{
          backgroundColor: '#d1fae5',
          border: '1px solid #10b981',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#10b981',
            animation: 'pulse 2s infinite'
          }}></div>
          <span style={{ color: '#065f46', fontSize: '14px', fontWeight: '500' }}>
            Live updates enabled - Changes will sync in real-time
          </span>
        </div>
      )}
      
      {/* Active Users Indicator */}
      {Object.keys(activeUsers).length > 0 && (
        <div style={{
          backgroundColor: '#dbeafe',
          border: '1px solid #3b82f6',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            animation: 'pulse 2s infinite'
          }}></div>
          <span style={{ color: '#1e40af', fontSize: '14px', fontWeight: '500' }}>
            {Object.keys(activeUsers).length} user{Object.keys(activeUsers).length > 1 ? 's' : ''} currently viewing this work order
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          // Clean up WebSocket resources BEFORE navigating
          cleanupWebSocketResources();
          
          // Use requestAnimationFrame to ensure cleanup completes before navigation
          requestAnimationFrame(() => {
            if (isPreview) {
              navigate('/dashboard');
            } else {
              navigate(getBackRoute());
            }
          });
        }}
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
    <fieldset disabled={isPreview} style={{ border: 'none', padding: 0, margin: 0 }}>



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
          {/* Row 1 */}
          <tr>
            <td>
              <input
                name="companyName"
                value={form.companyName || ""}                
                onChange={handleChange}
                placeholder="Company Name"
                {...getFieldStyle('companyName')}
              />

            </td>
            <td>
            <select
                name="make"
                value={form.make || ""}                
                onChange={handleChange}
                required
                style={{width: '100%'}}
                {...getFieldStyle('make')}
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
                value={form.model || ""}                
                onChange={handleChange}
                required
                disabled={!form.make}
                style={{width: '100%'}}
                {...getFieldStyle('model')}
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
                value={form.serialNumber} 
                onChange={handleChange}
                {...getFieldStyle('serialNumber')}
              />
            </td>
            <td>
              <input type="date" name="date" value={form.date} onChange={handleChange} />
            </td>
          </tr>

          {/* Row 2: Company Street + moved WO# header */}
          <tr>
            <td colSpan={2}>
              <input
                name="companyStreet"
                value={form.companyStreet || ""}                
                onChange={handleChange}
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

          {/* Row 3: Company City + WO# value */}
          <tr>
            <td colSpan={2}>
              <input
                name="companyCity"
                value={form.companyCity || ""}                
                onChange={handleChange}
                placeholder="Company City"
              />
            </td>
            <td>
            <input
              name="fieldContact"
              value={form.fieldContact || ""}              
              onChange={handleChange}
              placeholder="Field Contact Name"
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
                name="fieldContactNumber"
                value={form.fieldContactNumber || ""}                
                onChange={handleChange}
                placeholder="Field Contact Phone"
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
                name="workOrderNo"
                value={form.workOrderNo || ""}                
                readOnly
                className="assign-table-readonly"
              />
            </td>
          </tr>

          {/* Subsequent rows */}
          <tr>
            <td colSpan={2}>
              <input
                name="companyState"
                value={form.companyState || ""}                
                onChange={handleChange}
                placeholder="Company State"
              />
            </td>
            <td>
              <input
                name="fieldStreet"
                value={form.fieldStreet || ""}                
                onChange={handleChange}
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
                value={form.fieldCity || ""}                
                onChange={handleChange}
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
            <th className="assign-table-header">
                PO Number 
            </th>
          </tr>
          <tr>
            <td colSpan={2}>
              <input
                name="companyZip"
                value={form.companyZip || ""}                
                onChange={handleChange}
                placeholder="Company ZIP"
              />
            </td>
            <td>
              <input
                name="fieldState"
                value={form.fieldState || ""}                
                onChange={handleChange}
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
                value={form.fieldZipcode || ""}                
                onChange={handleChange}
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
            <td>
              <input
              name="poNumber"
              value={form.poNumber || ""}              
              onChange={handleChange}
              placeholder="PO Number"
              />
            </td>
          </tr>

         {/* Row 6: Contact Info header */}
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

         {/* Row 7: contact email / phone inputs */}
          <tr>
            <td colSpan={2}>
              <input
                name="contactName"
                value={form.contactName || ""}                
                onChange={handleChange}
                placeholder="Contact Name"
                {...disabledIfInHouse}
                  style={
                    isInHouseRepair
                      ? { backgroundColor: "#808080", color: "#808080" }
                      : {}
                  }
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
                    onChange={handleChange}
                  /> 
                  </div>
                  </td>
                <td>
                <select
                    name="shop"
                    value={form.shop || ""}                    
                    onChange={handleChange}
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
                  value={form.repairType || ""}                  
                  onChange={handleRepairTypeChange}
                  style={{ width: '100%'}}
                  required
                >
                  <option value="">-- Select Repair Type --</option>
                  {repairTypes.map((type, i) =>(
                    <option key= {i} value={type}>{type}</option>
                  ))}
                </select>
                </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <input
                name="contactPhone"
                value={form.contactPhone || ""}                
                onChange={handleChange}
                placeholder="Contact Phone"
                {...disabledIfInHouse}
                  style={
                    isInHouseRepair
                      ? { backgroundColor: "#808080", color: "#808080" }
                      : {}
                  }
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
                    onChange={handleChange}
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
                value={form.otherDesc || ""}
                onChange={handleChange}
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
                value={form.contactEmail || ""}                
                onChange={handleChange}
                placeholder="Contact Email"
                {...disabledIfInHouse}
                  style={
                    isInHouseRepair
                      ? { backgroundColor: "#808080", color: "#808080" }
                      : {}
                  }
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
                    onChange={handleChange}
                  /> 
                  </div>
                  </td>
            <td colSpan={2}
            style={{background: "#808080"}}></td>            
          </tr>
          <tr>
            <td colSpan={2} style={{background: "#808080"}}></td>
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
                    onChange={handleChange}
                  /> 
                  </div>
                  </td>
                  <td colSpan={2} style={{background:"#808080"}}></td>
          </tr>
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
                    value={log.technicianAssigned || ""}                    
                    onChange={e =>handleTimeLogChange(idx, e)}
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
                    value={log.assignDate || ""}                   
                    onChange={e => handleTimeLogChange(idx, e)}
                    style={{ width: '100%' }}
                    required
                />
                </td>
                <td>
                <input
                    type="time"
                    name="startTime"
                    value={log.startTime || ""}                    
                    onChange={e => handleTimeLogChange(idx, e)}
                    style={{ width: '100%' }}
                />
                </td>
                <td>
                <input
                    type="time"
                    name="finishTime"
                    value={log.finishTime || ""}                    
                    onChange={e => handleTimeLogChange(idx, e)}
                    style={{ width: '100%' }}
                />
                </td>
                <td>
                <input
                    type="text"
                    name="travelTime"
                    value={log.travelTime || ""}                    
                    onChange={e => handleTimeLogChange(idx, e)}
                    placeholder="hh:mm"
                    style={{ width: '70%', display: 'inline-block' }}
                />
                {form.timeLogs.length > 1 && (
                    <button
                    type="button"
                    onClick={() => removeTimeLog(idx)}
                    style={{marginLeft: '8px', verticalAlign: 'middle',  background: '#ffe0e0', border: '1px solid #f00', cursor: 'pointer', padding: '2px 8px'}}
                    title= "Remove this time log"
                    >-</button>
                )}
                </td>
            </tr>
            ))}
            <tr>
            <td colSpan={5}>
                <button style={{cursor: 'pointer'}} type="button" onClick={addTimeLog}>+ Add Time Log</button>
            </td>
            </tr>
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
                value={form.salesName || ""}                
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
                placeholder="Shipping Comments"
              />
            </td>


            </tr>
            <tr>
                <th className={`assign-table-header ${getFieldStyle('parts').className || ''}`} colSpan={1}>
                  Part Number
                </th>
                <th className={`assign-table-header ${getFieldStyle('parts').className || ''}`} colSpan={1}>
                  Part Name/ Description
                </th>
                <th className={`assign-table-header ${getFieldStyle('parts').className || ''}`} colSpan={1}>
                  Quantity
                </th>
                <th className={`assign-table-header ${getFieldStyle('parts').className || ''}`} colSpan={1}>
                  Pending Parts?
                </th>
                <th className={`assign-table-header ${getFieldStyle('parts').className || ''}`} colSpan={1}>
                  Est. Delivery Date
                </th>
            </tr>
              {form.parts.map((part, idx) => {



                return (
                  <tr key={idx}>
                <td>
                  <input
                    name="partNumber"
                    value={part.partNumber || ""}                    
                    onChange={e => handlePartChange(idx, 'partNumber', e.target.value)}
                    placeholder="Part Number"
                    list={`part-numbers-list-${idx}`}
                    autoComplete="off"
                  />
                  <datalist id={`part-numbers-list-${idx}`}>
                    {partsMemory.map((mem, i) => (
                      <option key={`${mem.partNumber}-${i}`} value={mem.partNumber}>
                        {mem.description}
                      </option>
                    ))}
                  </datalist>

                </td>
                <td>
                  <input
                    name="description"
                    value={part.description || ""}                    
                    onChange={e => handlePartChange(idx, 'description', e.target.value)}
                    placeholder="Part Name/ Description"
                  />
                </td>
                <td>
                  <input
                    name="quantity"
                    value={part.quantity ?? ""}                    
                    onChange={e => handlePartChange(idx, 'quantity', e.target.value)}
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
                      onChange={e => handlePartWaitingChange(idx, e.target.checked)}
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
                        onClick={() => removePart(idx)}
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
                    onChange={e => handlePartChange(idx, 'estimatedDeliveryDate', e.target.value)}
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
          {/* Parts & notes */}
          <tr>
            <td colSpan={1}>
              <button  type="button" style={{cursor: 'pointer'}} onClick={addPart}>Add Part </button>
            </td>
            <td colSpan={4} style={{background:"#808080"}}></td>

          </tr>
          <tr>
            <th className="assing-table-header" colSpan={5} style={{textAlign:'center'}}>
              Work Description
            </th>
          </tr>
          <tr>
            <td colSpan={5}>
              <textarea
                name="workDescription"
                value={form.workDescription || ""}                
                onChange={handleChange}
                rows={3}
                style={{width: '100%'}}
                {...getFieldStyle('workDescription')}
                placeholder="Brief Description of Work To Be Completed"
              />
            </td>
          </tr>
          <tr>
            <th className="assign-table-header" colSpan={5} style={{textAlign:'center'}}>
              Tech Summary
            </th>
          </tr>
            <tr>
                <td colSpan={5}>
                <textarea
                    name="notes"
                    value={form.notes || ""}                    
                    onChange={handleChange}
                    rows={3}
                    style={{width: '100%'}}
                    {...getFieldStyle('notes')}
                    placeholder="Summary of Work Completed"
                    required
                />
                </td>
            </tr>
          <tr>
            <td colSpan={5} style={{ textAlign: 'right' }}>


              <button 
                type="button"
                onClick={handleSaveAndClose}
                style={{ marginRight: '8px', background: '#ffe066', border: '1px solid #aaa', borderRadius: 4, padding: '4px 16px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Save & Close
              </button>
              <button 
                type="button"
                onClick={handleSaveProgress}
                style={{ marginRight: '8px', background: '#ffe066', border: '1px solid #aaa', borderRadius: 4, padding: '4px 16px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Save Progress
              </button>
              <button 
                type="submit"
                style={{marginRight: '8px', background: '#adebb3', border: '1px solid #aaa', borderRadius: 4, padding: '4px 16px', fontWeight: 'bold', cursor: 'pointer' }}>
                Submit For Review
              </button>
            </td>
          </tr>

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
</tbody>
</table>

{typeof form.customerSignature === 'string' && (
  <div style={{ marginTop: 22 }}>
    <div style={{ fontWeight: 600, marginBottom: 5 }}>
      Customer Acknowledgement Signature:
    </div>
    <img
      src={form.customerSignature}
      alt="Customer Signature"
      style={{ maxWidth: 400, border: '1px solid #ccc', borderRadius: 6 }}
    />
    {form.customerSignaturePrinted && (
      <div style={{ fontSize: 15, marginTop: 4, fontWeight: 600 }}>
        Printed Name: {form.customerSignaturePrinted}
      </div>
    )}
    <div style={{ fontSize: 12, marginTop: 2, color: '#666' }}>
      {form.signatureTimestamp &&
        `Signed on: ${new Date(form.signatureTimestamp).toLocaleString()}`}
    </div>
  </div>
)}


<button
  type="button"
  style={{
    marginTop: 28,
    padding: '10px 30px',
    background: '#2563eb',
    color: '#fff',
    borderRadius: 7,
    fontWeight: 600,
    fontSize: 18,
    border: 'none',
    cursor: 'pointer',
  }}
  onClick={() => setSignatureModalOpen(true)}
>
  Get Customer Signature
</button>

<button
  type="button"
  style={{
    marginTop: 20,
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

{workOrderPhotos.length > 0 && (
  <div style={{ marginTop: 24 }}>
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
                  border: '1px solid #ccc'
                }}
              />
            )}
            {photo.description && (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {photo.description}
              </div>
            )}
            <button
              type="button"
              onClick={() => handleDeletePhoto(photo.id)}
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
      />

      <textarea
        rows={2}
        placeholder="Optional description..."
        value={photoDescription}
        onChange={(e) => setPhotoDescription(e.target.value)}
        style={{ marginTop: 12, width: '100%' }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          marginTop: 16,
        }}
      >
        <button
          type="button"
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontWeight: 600,
            padding: '9px 24px',
            cursor: 'pointer',
          }}
          onClick={handleUploadPhoto}
        >
          Upload
        </button>
        <button
          type="button"
          style={{
            background: '#aaa',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontWeight: 600,
            padding: '9px 24px',
            cursor: 'pointer',
          }}
          onClick={() => setPhotoModalOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
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
              
              <input
                type="text"
                value={printedName}
                onChange={(e) => setPrintedName(e.target.value)}
                placeholder="Enter printed name"
                className="mt-2 p-2 border border-gray-300 rounded w-full max-w-xs text-sm"
              />
              
              
        {/* Clear Button */}
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
        {/* Save Button */}
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
              signatureTimestamp: new Date().toISOString(),
              customerSignaturePrinted: printedName
            }));
            setSignatureModalOpen(false);
          }}
        >
          Save Signature
        </button>
        {/* Cancel Button */}
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


            </fieldset>
            </form>
          );
        }
