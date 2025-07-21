import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api';
import '../index.css';
// Utility: Recursively converts all keys in object/arrays from snake_case to camelCase
function toCamelCaseDeep(obj) {
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
}


export default function AssignWorkOrderForm({ token }) {
  const {id} = useParams();
  const navigate = useNavigate();
  const [nextWorkOrderNo, setNextWorkOrderNo] = useState('');
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [makeModelMap, setMakeModelMap] = useState({});
  const prevMakeRef = useRef();
  const [form, setForm] = useState({
    companyName: '',
    companyStreet: '',
    companyCity: '',
    companyState: '',
    companyZip: '',
    fieldContact:'',
    fieldContactNumber:'',
    fieldStreet:'',
    fieldCity:'',
    fieldState:'',
    fieldZipcode:'',
    poNumber:'',
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
    parts: [{ partNumber:'', description:'', quantity:'', waiting: false }],
    otherDesc:'',
    workDescription: '',
  });
  const [technicians, setTechnicians] = useState([]);


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
    // Only clear the model if the make ACTUALLY changed (not on mount)
    if (prevMakeRef.current !== undefined && prevMakeRef.current !== form.make) {
      setForm(prev => ({ ...prev, model: '' }));
    }
    prevMakeRef.current = form.make;
  } else {
    setModels([]);
  }
}, [form.make, makeModelMap]);

useEffect(() => {
  if (id) return; // Only run if NOT editing!
  API.get('/workorders/next-number')
    .then(res => {
      setNextWorkOrderNo(res.data.nextWorkOrderNo);
      setForm(prev => ({
        ...prev,
        workOrderNo: String(res.data.nextWorkOrderNo)
      }));
    })
    .catch(() => {
      setNextWorkOrderNo('');
      setForm(prev => ({ ...prev, workOrderNo: '' }));
    });
}, [id]);




useEffect(() => {
  if (!id) return;
  // Fetch existing work order by ID
  API.get(`/workorders/${id}`)
    .then(res => {
      if (res.data) {
        let formObj = toCamelCaseDeep(res.data);
        if (formObj.date) formObj.date = String(formObj.date).slice(0, 10);
        if (!formObj.fieldContact && formObj.fieldContactName)
        formObj.fieldContact = formObj.fieldContactName
        formObj.parts = Array.isArray(formObj.parts) ? formObj.parts : [{ partNumber: '', description: '', quantity: '', waiting: false }];
        formObj.timeLogs = Array.isArray(formObj.timeLogs) ? formObj.timeLogs : [{ technicianAssigned: '', assignDate: '', startTime: '', finishTime: '', travelTime: '' }];
        // Format all assignDate values for HTML <input type="date">
formObj.timeLogs = formObj.timeLogs.map(log => ({
  ...log,
  assignDate: log.assignDate
    ? String(log.assignDate).slice(0, 10)
    : new Date().toISOString().slice(0, 10)
}));

        [
          'companyName', 'companyStreet', 'companyCity', 'companyState', 'companyZip',
          'fieldContact', 'fieldContactNumber', 'fieldStreet', 'fieldCity', 'fieldState', 'fieldZipcode',
          'poNumber', 'make', 'model', 'serialNumber', 'date',
          'contactName', 'contactPhone', 'contactEmail', 'salesName', 'shippingCost', 'notes', 'otherDesc', 'workDescription'
        ].forEach(field => {
          if (formObj[field] === undefined || formObj[field] === null) formObj[field] = '';
        });
        setForm(formObj);
      }
    })
    .catch(() => { /* handle not found if you want */ });
}, [id]);
 // <-- Add [id] as a dependency here!



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

  const [repairTypes, setRepairTypes] = useState([])
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

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const addPart = () => {
    setForm(prev => ({ ...prev, parts: [...prev.parts, { description:'', partNumber:'', quantity:'', waiting: false }] }));
  };
  const handlePartWaitingChange = (idx, checked) => {
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
    return { ...prev, parts: updated };
  });
};

  const removePart = idx => {
  setForm(prev => {
    if (prev.parts.length === 1) return prev; // Keep at least one
    const updated = prev.parts.filter((_, i) => i !== idx);
    return { ...prev, parts: updated };
  });
  };


  const handleSubmit = async (e) => {
    console.log("Submitting this form to API:", form);

  e.preventDefault();
    if (!form.workDescription.trim()) {
    alert('Work Description is required.');
    return;
  }
  if (!(form.warranty || form.billable || form.maintenance || form.nonBillableRepair)) {
    alert('At least one Work Type must be selected (Warranty, Billable, Maintenance or Non-billable Repair).');
    return;
  }
  // If "Field Repair" is selected, check for required field address info
  if (form.repairType === "Field Repair") {
    const requiredFields = [
      { key: 'fieldContact', label: 'Field Contact' },
      { key: 'fieldContactNumber', label: 'Field Contact Number' },
      { key: 'fieldStreet', label: 'Field Street' },
      { key: 'fieldCity', label: 'Field City' },
      { key: 'fieldState', label: 'Field State' },
      { key: 'fieldZipcode', label: 'Field Zipcode' }
    ];
    const missing = requiredFields.filter(f => !form[f.key]);
    if (missing.length > 0) {
      alert(`Please fill out the following Field Repair info: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
  }
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
  console.log('NEW MODE: sending to API:', cleanedForm);
  await API.post('/workorders', cleanedForm);
}

    navigate('/dashboard');
  } catch (err) {
    alert('Failed to save work order.');
    console.error(err);
  }
};
const handleSave = async () => {
  try {
    console.log('handleSave - sending to API:', form);
    await API.put(`/workorders/${id}`, form);
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

  const isInHouseRepair = form.repairType === "In-House Repair";
  const disabledIfInHouse = isInHouseRepair
    ? { disabled: true}
    : {};

  const addTimeLog = () => {
  setForm(prev => {
    const prevLogs = prev.timeLogs;
    const lastTech = prevLogs.length > 0 ? prevLogs[prevLogs.length - 1].technicianAssigned : '';
    return{
    ...prev,
    timeLogs: [
      ...prevLogs,
      {
        technicianAssigned: lastTech, // auto-select previous tech
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
    // Don't allow removing the last one, always keep at least one
      if (prev.timeLogs.length === 1) return prev;
      const updated = prev.timeLogs.filter((_, i) => i !== idx);
      return { ...prev, timeLogs: updated };
    });
    };


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
                value={form.companyName ?? ""}
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
                value={form.make ?? ""}
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
                value={form.model ?? ""}
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
              <input name="serialNumber" value={form.serialNumber ?? ""} onChange={handleChange} />
            </td>
            <td>
              <input type="date" name="date" value={form.date ?? ""} onChange={handleChange} />
            </td>
          </tr>

          {/* Row 2: Company Street + moved WO# header */}
          <tr>
            <td colSpan={2}>
              <input
                name="companyStreet"
                value={form.companyStreet ?? ""}
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
                value={form.companyCity ?? ""}
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
              value={form.fieldContact ?? ""}
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
                value={form.fieldContactNumber ?? ""}
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
                value={form.workOrderNo ?? ""}
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
                value={form.companyState ?? ""}
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
                value={form.fieldStreet ?? ""}
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
                value={form.fieldCity ?? ""}
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
                value={form.companyZip ?? ""}
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
                value={form.fieldState ?? ""}
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
                value={form.fieldZipcode ?? ""}
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
              value={form.poNumber ?? ""}
              onChange={handleChange}
              placeholder="PO Number"
              />
            </td>
          </tr>

          {/* ...additional form rows (serialVerifiedBy, contactEmail, etc.)... */}
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

         {/* Row 7: … now your contact email / phone inputs … */}
          <tr>
            <td colSpan={2}>
              <input
                name="contactName"
                value={form.contactName ?? ""}
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
                    value={form.shop ?? ""}
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
                  value={form.repairType ?? ""}
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
                value={form.contactPhone ?? ""}
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
                value={form.otherDesc ?? ""}
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
                value={form.contactEmail ?? ""}
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
                    onChange={handleChange}
                  /> 
                  </div>
                  </td>
                  <td colSpan={2}
                  style={{background: "#808080"}}></td>
          
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
                    value={log.technicianAssigned}
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
                    value={log.assignDate}
                    onChange={e => handleTimeLogChange(idx, e)}
                    style={{ width: '100%' }}
                    required
                />
                </td>
                <td>
                <input
                    type="time"
                    name="startTime"
                    value={log.startTime}
                    onChange={e => handleTimeLogChange(idx, e)}
                    style={{ width: '100%' }}
                />
                </td>
                <td>
                <input
                    type="time"
                    name="finishTime"
                    value={log.finishTime}
                    onChange={e => handleTimeLogChange(idx, e)}
                    style={{ width: '100%' }}
                />
                </td>
                <td>
                <input
                    type="text"
                    name="travelTime"
                    value={log.travelTime}
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
            <td colSpan={3} style={{background:"#808080"}}></td>
            </tr>
            <tr>
            <td>
            <select
                name="salesName"
                value={form.salesName ?? ""}
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
                const unitPrice = parseFloat(part.unitPrice) || 0;
                const quantity = parseFloat(part.quantity) || 0;
                const amount = unitPrice * quantity;
                return (
              
                  <tr key={idx}>
                <td>
                  <input
                    name="partNumber"
                    value={part.partNumber}
                    onChange={e => handlePartChange(idx, 'partNumber', e.target.value)}
                    placeholder="Part Number"
                  />
                </td>
                <td colSpan={2}>
                  <input
                    name="description"
                    value={part.description}
                    onChange={e => handlePartChange(idx, 'description', e.target.value)}
                    placeholder="Part Name/ Description"
                  />
                </td>
                <td>
                  <input
                    name="quantity"
                    value={part.quantity}
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
                      onChange={e => handlePartChange(idx, 'waiting', e.target.checked)}
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
                value={form.workDescription ?? ""}
                onChange={handleChange}
                rows={3}
                style={{ width: '100%' }}
                placeholder="Brief Description of Work Completed"
                required
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
                value={form.notes ?? ""}
                onChange={handleChange}
                rows={3}
                style={{ width: '100%' }}
                placeholder="Notes"
              />
            </td>
          </tr>

          {/* additional button, maybe use later?*/}
          <tr>
            <td colSpan={5} style={{ textAlign: 'right' }}>
              {/*{id && (
                <button
                  type="button"
                  onClick={handleSave}
                  style={{
                    marginRight: '8px',
                    background: '#ffe066',
                    border: '1px solid #aaa',
                    borderRadius: 4,
                    padding: '4px 16px',
                    fontWeight: 'bold'
                  }}
                >
                  Save Progress
                </button>
                
              )}*/}
                
              <button type="submit"
                style={{marginRight: '8px', background: '#adebb3', border: '1px solid #aaa', borderRadius: 4, padding: '4px 16px', fontWeight: 'bold' }}>
                {id ? 'Save Changes' : 'Assign'}
              </button>
            </td>
          </tr>

        </tbody>
      </table>
    </form>
  );
}
