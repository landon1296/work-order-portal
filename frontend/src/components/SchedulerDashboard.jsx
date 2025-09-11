import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { getStatusColor } from '../utils/statusColors';
import NotificationBell from './NotificationBell';
import GLLSLogo from '../assets/GLLSLogo.png';


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
  const date = new Date(dateStr);
  return isNaN(date) ? "" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  return timeStr;
};

const getDateKey = (dateStr) => {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
const SchedulePickupModal = ({ isOpen, onClose, onSave }) => {
  const [form, setForm] = useState({
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
    pickupDate: ''
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
    
    console.log('Submitting form data:', form);
    
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
        pickupDate: ''
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
            <input
              type="date"
              name="pickupDate"
              value={form.pickupDate}
              onChange={handleChange}
              required
              min={new Date().toISOString().split('T')[0]}
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
              Address *
            </label>
            <input
              type="text"
              name="address"
              value={form.address}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                City *
              </label>
              <input
                type="text"
                name="city"
                value={form.city}
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
                State *
              </label>
              <input
                type="text"
                name="state"
                value={form.state}
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

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
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
const EditPickupModal = ({ isOpen, onClose, onSave, pickupData }) => {
  const [form, setForm] = useState({
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
    pickupDate: ''
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
      setForm({
        companyName: pickupData.company_name || '',
        address: pickupData.address || '',
        city: pickupData.city || '',
        state: pickupData.state || '',
        zipcode: pickupData.zipcode || '',
        contactName: pickupData.contact_name || '',
        phoneNumber: pickupData.phone_number || '',
        email: pickupData.email || '',
        make: pickupData.make || '',
        model: pickupData.model || '',
        serialNumber: pickupData.serial_number || '',
        shop: pickupData.shop || '',
        pickupDate: pickupData.pickup_date || ''
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
      console.log('Submitting form data:', form);
      await onSave(pickupData.id, form);
      setForm({
        companyName: '', address: '', city: '', state: '', zipcode: '',
        contactName: '', phoneNumber: '', email: '', make: '', model: '',
        serialNumber: '', shop: '', pickupDate: ''
      });
    } catch (error) {
      console.error('Failed to update pickup:', error);
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
            <input
              type="date"
              name="pickupDate"
              value={form.pickupDate}
              onChange={handleChange}
              required
              min={new Date().toISOString().split('T')[0]}
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
              Address *
            </label>
            <input
              type="text"
              name="address"
              value={form.address}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                City *
              </label>
              <input
                type="text"
                name="city"
                value={form.city}
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
                State *
              </label>
              <input
                type="text"
                name="state"
                value={form.state}
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

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
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
        </form>
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
          onClick={onSchedulePickup}
          aria-label="Schedule a pick-up"
        >
          Schedule Pick-up
        </button>
      </div>
    </div>
  </div>
);

const FilterControls = ({ shopFilter, onShopFilterChange, viewType, onViewTypeChange }) => (
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
  </div>
);

const CalendarView = ({ orders, pickups, onViewEdit, onEditPickup }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  
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
          
          const dateKey = getDateKey(day.toISOString());
          const dayOrders = ordersByDate[dateKey] || [];
          const isToday = day.toDateString() === new Date().toDateString();
          
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
            >
              <div style={{
                fontWeight: 'bold',
                marginBottom: '4px',
                color: isToday ? '#92400e' : 'inherit'
              }}>
                {day.getDate()}
              </div>
              {dayOrders.map((item, idx) => (
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
                    whiteSpace: 'nowrap'
                  }}
                  title={item.type === 'pickup' 
                    ? `Pickup - ${item.company_name} - ${item.make} / ${item.model || 'N/A'} / ${item.serial_number || 'N/A'} (Click to edit)`
                    : `${item.workOrderNo} - ${item.displayStatus || item.status} - ${item.shop} - ${item.make} / ${item.model} / ${item.serialNumber}`
                  }
                >
                  {item.type === 'pickup' 
                    ? `📦 ${item.company_name} - ${item.make}`
                    : `${item.workOrderNo} - ${item.technicianAssigned} - ${item.companyName}`
                  }
                </div>
              ))}
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

  // Memoized filtered orders and pickups
  const filteredOrders = useMemo(() => 
    shopFilter === 'All Shops' 
      ? orders 
      : orders.filter(order => order.shop === shopFilter),
    [orders, shopFilter]
  );

  const filteredPickups = useMemo(() => 
    shopFilter === 'All Shops' 
      ? pickups 
      : pickups.filter(pickup => pickup.shop === shopFilter),
    [pickups, shopFilter]
  );

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

  const handleSchedulePickup = useCallback(() => {
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
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
      />

      {viewType === 'calendar' && (
        <CalendarView 
          orders={filteredOrders}
          pickups={filteredPickups}
          onViewEdit={handleViewEdit}
          onEditPickup={handleEditPickup}
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
      />

      <EditPickupModal
        isOpen={editModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleUpdatePickup}
        pickupData={selectedPickup}
      />
    </div>
  );
}

