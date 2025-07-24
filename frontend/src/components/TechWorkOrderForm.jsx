import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api';
import '../index.css';
import axios from 'axios';
import { default as SignaturePad } from 'react-signature-canvas';


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
  const navigate = useNavigate();
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
    warranty: false,
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
    notes: '',
    parts: [{ description:'', partNumber:'', quantity:'', waiting: false }],
    status: 'Assigned',
    statusHistory: [],
    customerSignature: null,
    signatureTimestamp: null
  });

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

  // Fetch work order data
useEffect(() => {
  if (!id) return;
  API.get(`/workorders/${id}`)
    .then(res => {
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
          waiting: false
        }];

        // Patch all string fields
        [
          "companyName", "companyStreet", "companyCity", "companyState", "companyZip",
          "fieldContact", "fieldContactNumber", "fieldStreet", "fieldCity", "fieldState", "fieldZipcode",
          "poNumber", "make", "model", "serialNumber", "date",
          "contactName", "contactPhone", "contactEmail", "salesName", "shippingCost", "notes", "otherDesc", "workDescription"
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
    if (!loaded) return;
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
          { status: 'In Progress', date: now }
        ]
      };
      
      console.log("AUTOMATION: sending status update:", updatedForm);
      setForm(updatedForm);

      API.put(`/workorders/${form.workOrderNo}`, updatedForm).catch(() => {});
    }
    // eslint-disable-next-line
  }, [form.status, id, loaded]);

  // in progress ↔ in progress, pending parts (only after loaded)
  useEffect(() => {
    if (!loaded) return;
    if (!form.status || form.status.toLowerCase().startsWith('completed')) return;
    const anyWaiting = (form.parts || []).some(part => part.waiting);
    const now = new Date().toISOString();

    if (anyWaiting && form.status !== 'In Progress, Pending Parts') {
      const updatedForm = {
        ...form,
        status: 'In Progress, Pending Parts',
statusHistory: [
  ...(Array.isArray(form.statusHistory) ? form.statusHistory : []),
  { status: 'In Progress, Pending Parts', date: now }
]
      };
      
      console.log("AUTOMATION: sending status update:", updatedForm);
      setForm(updatedForm);

      API.put(`/workorders/${form.workOrderNo}`, updatedForm).catch(() => {});
    } else if (!anyWaiting && form.status === 'In Progress, Pending Parts') {
      const updatedForm = {
        ...form,
        status: 'In Progress',
statusHistory: [
  ...(Array.isArray(form.statusHistory) ? form.statusHistory : []),
  { status: 'In Progress', date: now }
]
      };
      setForm(updatedForm);
      API.put(`/workorders/${form.workOrderNo}`, updatedForm).catch(() => {});
    }
    // eslint-disable-next-line
  }, [form.parts, form.status, id, loaded]);

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
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };
  const addPart = () => {
    setForm(prev => ({ ...prev, parts: [...prev.parts, { description:'', partNumber:'', quantity:'', waiting: false }] }));
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
    setForm(prev => {
      const updated = [...prev.parts];
      updated[idx] = { ...updated[idx], waiting: checked };
      return { ...prev, parts: updated };
    });
  };


const handlePartChange = (idx, field, value) => {
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
    setForm(prev => {
      if (prev.parts.length === 1) return prev;
      const updated = prev.parts.filter((_, i) => i !== idx);
      return { ...prev, parts: updated };
    });
  };

  const addTimeLog = () => {
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
    setForm(prev => {
      const updated = [...prev.timeLogs];
      updated[idx][name] = value;
      return { ...prev, timeLogs: updated };
    });
  };
  const removeTimeLog = (idx) => {
    setForm(prev => {
      if (prev.timeLogs.length === 1) return prev;
      const updated = prev.timeLogs.filter((_, i) => i !== idx);
      return { ...prev, timeLogs: updated };
    });
  };

  // Step 1: Set this up so we know when "In House Repair" is selected
  const isInHouseRepair = form.repairType === "In-House Repair";
  const disabledIfInHouse = isInHouseRepair
    ? { disabled: true}
    : {};


  // Save progress (draft)
  const handleSaveProgress = async () => {
  try {
    console.log("Saving form.parts:", form.parts);

    await API.put(`/workorders/${form.workOrderNo}`, form);
    alert('Progress saved!');
    // Send them back to their dashboard
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
  status: "Completed, Pending Approval",
  statusHistory: [
    ...((Array.isArray(form.statusHistory) ? form.statusHistory : [])),
    { status: "Completed, Pending Approval", date: now }
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
    <form onSubmit={handleSubmit} style={{ padding: '8px', fontFamily: 'Arial' }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
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
                value={form.make || ""}                
                onChange={handleChange}
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
                value={form.model || ""}                
                onChange={handleChange}
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
              <input name="serialNumber" value={form.serialNumber} onChange={handleChange} />
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

          {/* Row 3: Company City + WO# value */}
          <tr>
            <td colSpan={2}>
              <input
                name="companyCity"
                value={form.companyCity || ""}                
                onChange={handleChange}
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
            In-House/Field Repair?
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
                  <span style={{ float: 'left', paddingLeft: '8px', lineHeight: '24px'}}>Warranty</span>
                  <div style={{
                    position: 'absolute',
                    left: '60%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)'
                  }}>
                  <input
                    type="checkbox"
                    name="warranty"
                    checked={form.warranty}
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
                  onChange={handleChange}
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
                <button type="button" onClick={addTimeLog}>+ Add Time Log</button>
            </td>
            </tr>
            <tr>
                <th className="assign-table-header" colSpan={1}>
                    Salesman
                </th>
                <th className="assign-table-header" colSpan={1}>
                  Shipping Cost
                </th>
            <td colSpan={3} style={{background: "#808080"}}></td>
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
            <td colSpan={3} style={{background: "#808080"}}></td>
               
            </tr>
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
                    {partsMemory.map(mem => (
                      <option key={mem.partNumber} value={mem.partNumber}>
                        {mem.description}
                      </option>
                    ))}
                  </datalist>
                </td>
                <td colSpan={2}>
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
                    value={part.quantity || ""}                    
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

                </tr>
                );
              })}
          {/* Parts & notes */}
          <tr>
            <td colSpan={1}>
              <button type="button" onClick={addPart}>Add Part</button>
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
                style={{ width: '100%' }}
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
                    style={{ width: '100%' }}
                    placeholder="Summary of Work Completed"
                    required
                />
                </td>
            </tr>
          <tr>
            <td colSpan={5} style={{ textAlign: 'right' }}>


              <button 
                type="button"
                onClick={handleSaveProgress}
                style={{ marginRight: '8px', background: '#ffe066', border: '1px solid #aaa', borderRadius: 4, padding: '4px 16px', fontWeight: 'bold' }}
              >
                Save Progress
              </button>
              <button 
                type="submit"
                style={{marginRight: '8px', background: '#adebb3', border: '1px solid #aaa', borderRadius: 4, padding: '4px 16px', fontWeight: 'bold' }}>
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
      style={{ /* … */ }}
    />
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
  Add Photo(s)
</button>

{workOrderPhotos.length > 0 && (
  <div style={{ marginTop: 24 }}>
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
      border: '1px solid #ccc'
    }}
  />
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
    title="Delete photo"
  >
    ×
  </button>
</div>

      ))}
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
      <h2 style={{ textAlign: 'center', marginBottom: 16 }}>Upload Photo</h2>

      <input
        type="file"
        accept="image/*"
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



            </form>
          );
        }
