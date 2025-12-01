import React, { useState, useEffect, useCallback } from 'react';
import API from '../api';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import logoBase64 from '../assets/logoBase64';
import GLLSLogo from '../assets/GLLSLogo.png';

const TRANSACTION_TYPES = {
  NEW_SALE: 'new_sale',
  USED_SALE: 'used_sale',
  RENTAL: 'rental',
  SERVICE: 'service'
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return isNaN(date) ? "" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

const formatCurrency = (value) => {
  if (!value) return '$0.00';
  return `$${parseFloat(value).toFixed(2)}`;
};

const formatPercent = (value) => {
  if (!value) return '0%';
  return `${parseFloat(value).toFixed(2)}%`;
};

export default function SalesDashboard({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [machines, setMachines] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Get current month start and end dates
  const getCurrentMonthDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];
    return { firstDay, lastDay };
  };

  const { firstDay: currentMonthStart, lastDay: currentMonthEnd } = getCurrentMonthDates();

  const [filters, setFilters] = useState({
    transactionType: '',
    startDate: currentMonthStart, // Default to first day of current month
    endDate: currentMonthEnd // Default to last day of current month
  });

  const [formData, setFormData] = useState({
    transaction_type: TRANSACTION_TYPES.NEW_SALE,
    date: new Date().toISOString().split('T')[0],
    renterra_order_number: '',
    work_order_no: '',
    customer: '',
    items: [{
      machine_make: '',
      machine_model: '',
      machine_serial: '',
      description: '',
      quantity: 1,
      sale_price: '',
      discount_percent: '',
      commission_percent: '',
      commission_total: '',
      commission_flat_rate: '',
      rental_start_date: '',
      rental_end_date: '',
      rental_days_total: '',
      rental_total: '',
      rental_daily_rate: '',
      rental_weekly_rate: '',
      rental_monthly_rate: ''
    }]
  });

  // Fetch machines from SalesMasters
  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const response = await API.get('/api/masters/sales-machines', {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        setMachines(response.data || []);
      } catch (error) {
        console.error('Failed to fetch machines:', error);
      }
    };
    fetchMachines();
  }, [user.token]);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 50,
        ...filters
      };
      const response = await API.get('/api/sales/transactions', {
        params,
        headers: { Authorization: `Bearer ${user.token}` }
      });
      setTransactions(response.data.transactions || []);
      setTotalPages(response.data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters, user.token]);

  // Fetch statistics
  const fetchStats = useCallback(async () => {
    try {
      const params = {
        ...filters
      };
      const response = await API.get('/api/sales/stats', {
        params,
        headers: { Authorization: `Bearer ${user.token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [filters, user.token]);

  useEffect(() => {
    fetchTransactions();
    fetchStats();
  }, [fetchTransactions, fetchStats]);

  // Calculate rental total based on rates and days
  // Rules: 1 month = 28 days, 3+ days = 1 week, 3+ weeks = 1 month
  const calculateRentalTotal = (days, dailyRate, weeklyRate, monthlyRate, discountPercent = 0) => {
    if (!days || days <= 0 || !dailyRate || !weeklyRate || !monthlyRate) {
      return 0;
    }
    
    const DAYS_PER_MONTH = 28;
    const DAYS_PER_WEEK = 7;
    const DAYS_FOR_WEEK = 3; // 3+ days = 1 week
    const DAYS_FOR_MONTH_FROM_WEEKS = 21; // 3 weeks = 21 days = 1 month
    
    let remainingDays = parseInt(days);
    let total = 0;
    
    // Step 1: Calculate full months (28 days each)
    const fullMonths = Math.floor(remainingDays / DAYS_PER_MONTH);
    if (fullMonths > 0) {
      total += fullMonths * monthlyRate;
      remainingDays -= fullMonths * DAYS_PER_MONTH;
    }
    
    // Step 2: Check if remaining days can form 3+ weeks (21+ days = 1 month)
    if (remainingDays >= DAYS_FOR_MONTH_FROM_WEEKS) {
      // 21+ days (3+ weeks) = 1 month
      total += monthlyRate;
      remainingDays -= DAYS_FOR_MONTH_FROM_WEEKS;
    }
    
    // Step 3: Calculate full weeks from remaining days (if any)
    const remainingWeeks = Math.floor(remainingDays / DAYS_PER_WEEK);
    if (remainingWeeks > 0) {
      total += remainingWeeks * weeklyRate;
      remainingDays -= remainingWeeks * DAYS_PER_WEEK;
    }
    
    // Step 4: Handle remaining days (less than 7 days)
    if (remainingDays >= DAYS_FOR_WEEK) {
      // 3+ days = 1 week
      total += weeklyRate;
    } else if (remainingDays > 0) {
      // Less than 3 days = daily rate
      total += remainingDays * dailyRate;
    }
    
    // Apply discount if provided
    if (discountPercent > 0) {
      total = total * (1 - discountPercent / 100);
    }
    
    return total;
  };

  // Calculate commission and rental days for each item when relevant fields change
  useEffect(() => {
    setFormData(prev => {
      const updatedItems = prev.items.map(item => {
        let updatedItem = { ...item };
        
        // Calculate rental days total from start and end dates
        if (prev.transaction_type === TRANSACTION_TYPES.RENTAL && item.rental_start_date && item.rental_end_date) {
          const startDate = new Date(item.rental_start_date);
          const endDate = new Date(item.rental_end_date);
          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && endDate >= startDate) {
            const diffTime = Math.abs(endDate - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
            updatedItem.rental_days_total = diffDays.toString();
            
            // Calculate rental total based on rates
            const dailyRate = parseFloat(item.rental_daily_rate) || 0;
            const weeklyRate = parseFloat(item.rental_weekly_rate) || 0;
            const monthlyRate = parseFloat(item.rental_monthly_rate) || 0;
            const discountPercent = parseFloat(item.discount_percent) || 0;
            
            if (dailyRate && weeklyRate && monthlyRate) {
              const rentalTotal = calculateRentalTotal(diffDays, dailyRate, weeklyRate, monthlyRate, discountPercent);
              updatedItem.rental_total = rentalTotal.toFixed(2);
            }
          }
        }
        
        // Calculate commission for sales transactions
        if (prev.transaction_type === TRANSACTION_TYPES.NEW_SALE || prev.transaction_type === TRANSACTION_TYPES.USED_SALE) {
          // Check if flat rate commission is set (for SpyderCrane, etc.)
          const flatRateCommission = parseFloat(item.commission_flat_rate) || 0;
          
          if (flatRateCommission > 0) {
            // Use flat rate commission (multiply by quantity)
            const commissionTotal = flatRateCommission * (parseInt(item.quantity) || 1);
            updatedItem.commission_total = commissionTotal.toFixed(2);
          } else {
            // Use percentage-based calculation
            const salePrice = parseFloat(item.sale_price) || 0;
            const discountPercent = parseFloat(item.discount_percent) || 0;
            const commissionPercent = parseFloat(item.commission_percent) || 0;
            
            const discountedPrice = salePrice * (1 - discountPercent / 100);
            const commissionTotal = (discountedPrice * commissionPercent / 100) * (parseInt(item.quantity) || 1);
            updatedItem.commission_total = commissionTotal.toFixed(2);
          }
        } else if (prev.transaction_type === TRANSACTION_TYPES.RENTAL) {
          // Salesmen get 2% of the Rental Total as commission
          const rentalTotal = parseFloat(item.rental_total) || 0;
          const commissionPercent = 2; // Fixed 2% for rentals
          const commissionTotal = (rentalTotal * commissionPercent / 100) * (parseInt(item.quantity) || 1);
          updatedItem.commission_percent = commissionPercent.toString();
          updatedItem.commission_total = commissionTotal.toFixed(2);
        }
        
        return updatedItem;
      });
      return { ...prev, items: updatedItems };
    });
  }, [
    formData.transaction_type,
    JSON.stringify(formData.items.map(item => ({
      sale_price: item.sale_price,
      discount_percent: item.discount_percent,
      commission_percent: item.commission_percent,
      quantity: item.quantity,
      commission_flat_rate: item.commission_flat_rate,
      rental_total: item.rental_total,
      rental_start_date: item.rental_start_date,
      rental_end_date: item.rental_end_date,
      rental_daily_rate: item.rental_daily_rate,
      rental_weekly_rate: item.rental_weekly_rate,
      rental_monthly_rate: item.rental_monthly_rate,
      discount_percent: item.discount_percent
    })))
  ]);

  // Handle machine selection - populate commission percent and prices for a specific item
  const handleMachineSelect = (brand, machine, itemIndex) => {
    const machineData = machines.find(m => m.brand === brand && m.machine === machine);
    if (machineData) {
      setFormData(prev => {
        const updatedItems = [...prev.items];
        const item = updatedItems[itemIndex];
        
        if (prev.transaction_type === TRANSACTION_TYPES.NEW_SALE) {
          if (brand === 'Other') {
            // For "Other", allow manual entry - don't auto-populate
            updatedItems[itemIndex] = {
              ...item,
              machine_make: brand,
              machine_model: machine,
              commission_percent: item.commission_percent || '',
              sale_price: item.sale_price || '',
              commission_flat_rate: item.commission_flat_rate || ''
            };
          } else {
            updatedItems[itemIndex] = {
              ...item,
              machine_make: brand,
              machine_model: machine,
              commission_percent: machineData.commissionPercentNew ? machineData.commissionPercentNew.toString() : item.commission_percent,
              sale_price: machineData.salePrice ? machineData.salePrice.toString() : item.sale_price,
              commission_flat_rate: machineData.commissionFlatRateSales ? machineData.commissionFlatRateSales.toString() : ''
            };
          }
        } else if (prev.transaction_type === TRANSACTION_TYPES.USED_SALE) {
          if (brand === 'Other') {
            // For "Other", allow manual entry - don't auto-populate
            updatedItems[itemIndex] = {
              ...item,
              machine_make: brand,
              machine_model: machine,
              commission_percent: item.commission_percent || '',
              sale_price: item.sale_price || '',
              commission_flat_rate: item.commission_flat_rate || ''
            };
          } else {
            updatedItems[itemIndex] = {
              ...item,
              machine_make: brand,
              machine_model: machine,
              commission_percent: machineData.commissionPercentUsed ? machineData.commissionPercentUsed.toString() : item.commission_percent,
              // Don't auto-populate sale_price for used sales - price varies
              sale_price: item.sale_price, // Keep existing value or empty
              commission_flat_rate: machineData.commissionFlatRateSales ? machineData.commissionFlatRateSales.toString() : ''
            };
          }
        } else if (prev.transaction_type === TRANSACTION_TYPES.RENTAL) {
          if (brand === 'Other') {
            // For "Other", allow manual entry of rates
            updatedItems[itemIndex] = {
              ...item,
              machine_make: brand,
              machine_model: machine,
              rental_daily_rate: item.rental_daily_rate || '',
              rental_weekly_rate: item.rental_weekly_rate || '',
              rental_monthly_rate: item.rental_monthly_rate || ''
            };
          } else {
            updatedItems[itemIndex] = {
              ...item,
              machine_make: brand,
              machine_model: machine,
              rental_daily_rate: machineData.rentalDailyRate ? machineData.rentalDailyRate.toString() : '',
              rental_weekly_rate: machineData.rentalWeeklyRate ? machineData.rentalWeeklyRate.toString() : '',
              rental_monthly_rate: machineData.rentalMonthlyRate ? machineData.rentalMonthlyRate.toString() : ''
            };
          }
        } else if (prev.transaction_type === TRANSACTION_TYPES.SERVICE) {
          updatedItems[itemIndex] = {
            ...item,
            machine_make: brand,
            machine_model: machine,
            commission_total: machineData.commissionService ? machineData.commissionService.toString() : item.commission_total
          };
        }
        
        return { ...prev, items: updatedItems };
      });
    }
  }

  // Add a new item to the form
  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        machine_make: '',
        machine_model: '',
        machine_serial: '',
        description: '',
        quantity: 1,
        sale_price: '',
        discount_percent: '',
        commission_percent: '',
        commission_total: '',
        commission_flat_rate: '',
        rental_start_date: '',
        rental_end_date: '',
        rental_days_total: '',
        rental_total: '',
        rental_daily_rate: '',
        rental_weekly_rate: '',
        rental_monthly_rate: ''
      }]
    }));
  }

  // Remove an item from the form
  const handleRemoveItem = (itemIndex) => {
    if (formData.items.length > 1) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.filter((_, index) => index !== itemIndex)
      }));
    }
  }

  // Handle input change for item fields
  const handleItemInputChange = (itemIndex, field, value) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        [field]: value
      };
      return { ...prev, items: updatedItems };
    });
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTransactionTypeChange = (type) => {
    setFormData(prev => ({
      ...prev,
      transaction_type: type,
      work_order_no: type === TRANSACTION_TYPES.SERVICE ? prev.work_order_no : '',
      items: prev.items.map(item => ({
        ...item,
        discount_percent: type === TRANSACTION_TYPES.NEW_SALE || type === TRANSACTION_TYPES.RENTAL ? item.discount_percent : '',
        rental_start_date: type === TRANSACTION_TYPES.RENTAL ? item.rental_start_date : '',
        rental_end_date: type === TRANSACTION_TYPES.RENTAL ? item.rental_end_date : '',
        rental_days_total: type === TRANSACTION_TYPES.RENTAL ? item.rental_days_total : '',
        rental_total: type === TRANSACTION_TYPES.RENTAL ? item.rental_total : '',
        rental_daily_rate: type === TRANSACTION_TYPES.RENTAL ? item.rental_daily_rate : '',
        rental_weekly_rate: type === TRANSACTION_TYPES.RENTAL ? item.rental_weekly_rate : '',
        rental_monthly_rate: type === TRANSACTION_TYPES.RENTAL ? item.rental_monthly_rate : '',
        commission_flat_rate: type === TRANSACTION_TYPES.NEW_SALE || type === TRANSACTION_TYPES.USED_SALE ? item.commission_flat_rate : ''
      }))
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTransaction) {
        // For editing, send single item (backward compatibility)
        const item = formData.items[0];
        await API.put(`/api/sales/transactions/${editingTransaction.id}`, {
          ...formData,
          ...item
        }, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
      } else {
        // For new transactions, send items array to create multiple records
        await API.post('/api/sales/transactions/bulk', {
          transaction_type: formData.transaction_type,
          date: formData.date,
          renterra_order_number: formData.renterra_order_number,
          work_order_no: formData.work_order_no,
          customer: formData.customer,
          items: formData.items
        }, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
      }
      setShowForm(false);
      setEditingTransaction(null);
      setFormData({
        transaction_type: TRANSACTION_TYPES.NEW_SALE,
        date: new Date().toISOString().split('T')[0],
        renterra_order_number: '',
        work_order_no: '',
        customer: '',
        items: [{
          machine_make: '',
          machine_model: '',
          machine_serial: '',
          description: '',
          quantity: 1,
          sale_price: '',
          discount_percent: '',
          commission_percent: '',
          commission_total: '',
          commission_flat_rate: '',
          rental_start_date: '',
          rental_end_date: '',
          rental_days_total: '',
          rental_total: '',
          rental_daily_rate: '',
          rental_weekly_rate: '',
          rental_monthly_rate: ''
        }]
      });
      fetchTransactions();
      fetchStats();
    } catch (error) {
      console.error('Failed to save transaction:', error);
      alert('Failed to save transaction. Please try again.');
    }
  };

  const handleEdit = (transaction) => {
    const normalizeDate = (value) => {
      if (!value) return '';
      const str = typeof value === 'string' ? value : new Date(value).toISOString();
      return str.split('T')[0];
    };

    setEditingTransaction(transaction);
    setFormData({
      transaction_type: transaction.transaction_type,
      date: normalizeDate(transaction.date),
      renterra_order_number: transaction.renterra_order_number || '',
      work_order_no: transaction.work_order_no || '',
      customer: transaction.customer,
      items: [{
        machine_make: transaction.machine_make || '',
        machine_model: transaction.machine_model || '',
        machine_serial: transaction.machine_serial || '',
        description: transaction.description || '',
        quantity: transaction.quantity || 1,
        sale_price: transaction.sale_price || '',
        discount_percent: transaction.discount_percent || '',
        commission_percent: transaction.commission_percent || '',
        commission_total: transaction.commission_total || '',
        commission_flat_rate: transaction.commission_flat_rate || '',
        rental_start_date: normalizeDate(transaction.rental_start_date),
        rental_end_date: normalizeDate(transaction.rental_end_date),
        rental_days_total: transaction.rental_days_total || '',
        rental_total: transaction.rental_total || '',
        rental_daily_rate: transaction.rental_daily_rate || '',
        rental_weekly_rate: transaction.rental_weekly_rate || '',
        rental_monthly_rate: transaction.rental_monthly_rate || ''
      }]
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) {
      return;
    }
    try {
      await API.delete(`/api/sales/transactions/${id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      fetchTransactions();
      fetchStats();
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      alert('Failed to delete transaction. Please try again.');
    }
  };

  const handleCallOff = async (transaction) => {
    if (!window.confirm(`Call off this rental? The rental end date will be set to today (${new Date().toISOString().split('T')[0]}).`)) {
      return;
    }
    try {
      await API.patch(`/api/sales/transactions/${transaction.id}/call-off`, {}, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      // After calling off, we need to recalculate rental_total if needed
      // For now, just refresh the transactions list
      fetchTransactions();
      fetchStats();
      alert('Rental called off successfully!');
    } catch (error) {
      console.error('Failed to call off rental:', error);
      alert('Failed to call off rental. Please try again.');
    }
  };

  const handleExportCSV = async () => {
    try {
      const params = { ...filters };
      const response = await API.get('/api/sales/export/csv', {
        params,
        headers: { Authorization: `Bearer ${user.token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sales-transactions-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };

  const handleExportPDF = async () => {
    try {
      const params = { ...filters };
      const response = await API.get('/api/sales/export/pdf', {
        params,
        headers: { Authorization: `Bearer ${user.token}` }
      });
      const transactions = response.data.transactions || [];

      const doc = new jsPDF({ margin: 20 });
      const leftMargin = 20;
      const rightMargin = 20;
      let y = 20;

      // Header
      const salesmanName = user?.username || 'Salesman';
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(`${salesmanName} - Sales Transactions Report`, leftMargin, y);
      y += 10;

      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", 150, 10, 50, 8);
      }

      // Summary
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Total Transactions: ${transactions.length}`, leftMargin, y += 10);
      if (stats) {
        doc.text(`Total Commission: ${formatCurrency(stats.totalCommission)}`, leftMargin, y += 6);
        doc.text(`Total Sales: ${formatCurrency(stats.totalSales)}`, leftMargin, y += 6);
      }
      y += 10;

      // Table
      const tableData = transactions.map(trans => [
        formatDate(trans.date),
        trans.transaction_type.replace('_', ' ').toUpperCase(),
        trans.salesman_username || '',
        trans.customer || '',
        `${trans.machine_make || ''} ${trans.machine_model || ''}`.trim(),
        trans.renterra_order_number || '',
        trans.work_order_no || '',
        formatCurrency(trans.sale_price),
        formatPercent(trans.commission_percent),
        formatCurrency(trans.commission_total),
        trans.rental_days_total || '',
        formatCurrency(trans.rental_total)
      ]);

      doc.autoTable({
        startY: y,
        head: [['Date', 'Type', 'Salesman', 'Customer', 'Machine', 'Renterra Order #', 'Work Order #', 'Sale Price', 'Commission %', 'Commission Total', 'Rental Days', 'Rental Total']],
        body: tableData,
        margin: { top: 10, bottom: 20, left: leftMargin, right: rightMargin },
        styles: {
          fontSize: 8,
          overflow: 'linebreak',
          cellPadding: 2
        },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        alternateRowStyles: { fillColor: [240, 240, 240] }
      });

      doc.save(`sales-transactions-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert('Failed to export PDF. Please try again.');
    }
  };

  const handleExportEmail = async () => {
    const recipientEmail = prompt('Enter recipient email address:');
    if (!recipientEmail) return;

    const salesmanName = user?.username || 'Salesman';
    const subject = prompt('Enter email subject:', `${salesmanName} - Sales Transactions Report - ${new Date().toLocaleDateString()}`);
    if (!subject) return;

    try {
      await API.post('/api/sales/export/email', {
        to: recipientEmail,
        subject,
        format: 'html',
        ...filters
      }, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      alert('Email sent successfully!');
    } catch (error) {
      console.error('Failed to send email:', error);
      alert('Failed to send email. Please try again.');
    }
  };

  const isAdmin = user?.roles?.includes('owner') || user?.roles?.includes('analytics') || user?.roles?.includes('manager') || user?.role === 'owner' || user?.role === 'analytics' || user?.role === 'manager';

  return (
    <div style={{ paddingBottom: '60px', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 8,
        fontFamily: 'Arial, Sans-Serif'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: 30, fontFamily: 'Arial, Sans-Serif' }}>
          <button
            onClick={() => window.location.href = '/login'}
            style={{
              background: '#ef4444',
              color: 'white',
              fontWeight: 'bold',
              padding: '6px 14px',
              fontSize: 14,
              borderRadius: 6,
              border: 'none',
              marginBottom: 10,
              marginTop: 10,
              cursor: 'pointer'
            }}
          >
            Log Out
          </button>
          <h1 style={{ margin: 0, fontFamily: 'Arial, Sans-Serif' }}>Sales Dashboard</h1>
        </div>
        <img src={GLLSLogo} alt="Company Logo" style={{ height: 100, marginRight: 0, marginTop: 10 }} />
      </div>

      {/* Statistics Panel */}
      {stats && (
        <div style={{
          margin: '20px 30px',
          padding: '20px',
          backgroundColor: '#f3f4f6',
          borderRadius: 8,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px'
        }}>
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#6b7280' }}>Total Transactions</h3>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>{stats.totalTransactions}</p>
          </div>
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#6b7280' }}>Total Commission</h3>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{formatCurrency(stats.totalCommission)}</p>
          </div>
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#6b7280' }}>Total Sales</h3>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#2563eb' }}>{formatCurrency(stats.totalSales)}</p>
          </div>
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#6b7280' }}>Total Rentals</h3>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#8b5cf6' }}>{formatCurrency(stats.totalRentals)}</p>
          </div>
        </div>
      )}

      {/* Filters and Actions */}
      <div style={{ margin: '20px 30px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filters.transactionType}
          onChange={(e) => setFilters(prev => ({ ...prev, transactionType: e.target.value }))}
          style={{ padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
        >
          <option value="">All Types</option>
          <option value="new_sale">New Sales</option>
          <option value="used_sale">Used Sales</option>
          <option value="rental">Rentals</option>
          <option value="service">Service</option>
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
          placeholder="Start Date"
          style={{ padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
          placeholder="End Date"
          style={{ padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
        />
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 16px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          + Add Transaction
        </button>
        <button
          onClick={handleExportCSV}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          Export CSV
        </button>
        <button
          onClick={handleExportPDF}
          style={{
            padding: '8px 16px',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          Export PDF
        </button>
        <button
          onClick={handleExportEmail}
          style={{
            padding: '8px 16px',
            background: '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          Email Report
        </button>
      </div>

      {/* Transaction Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: 8,
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ marginTop: 0 }}>{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</h2>
            
            {/* Transaction Type Tabs */}
            <div style={{ 
              display: 'flex', 
              gap: '8px', 
              marginBottom: '25px',
              borderBottom: '2px solid #e5e7eb',
              paddingBottom: '10px'
            }}>
              <button
                type="button"
                onClick={() => handleTransactionTypeChange(TRANSACTION_TYPES.NEW_SALE)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: formData.transaction_type === TRANSACTION_TYPES.NEW_SALE ? '#2563eb' : '#f3f4f6',
                  color: formData.transaction_type === TRANSACTION_TYPES.NEW_SALE ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '6px 6px 0 0',
                  cursor: 'pointer',
                  fontWeight: formData.transaction_type === TRANSACTION_TYPES.NEW_SALE ? 'bold' : 'normal',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  borderBottom: formData.transaction_type === TRANSACTION_TYPES.NEW_SALE ? '3px solid #2563eb' : 'none',
                  marginBottom: formData.transaction_type === TRANSACTION_TYPES.NEW_SALE ? '-2px' : '0'
                }}
              >
                New Sale
              </button>
              <button
                type="button"
                onClick={() => handleTransactionTypeChange(TRANSACTION_TYPES.USED_SALE)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: formData.transaction_type === TRANSACTION_TYPES.USED_SALE ? '#2563eb' : '#f3f4f6',
                  color: formData.transaction_type === TRANSACTION_TYPES.USED_SALE ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '6px 6px 0 0',
                  cursor: 'pointer',
                  fontWeight: formData.transaction_type === TRANSACTION_TYPES.USED_SALE ? 'bold' : 'normal',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  borderBottom: formData.transaction_type === TRANSACTION_TYPES.USED_SALE ? '3px solid #2563eb' : 'none',
                  marginBottom: formData.transaction_type === TRANSACTION_TYPES.USED_SALE ? '-2px' : '0'
                }}
              >
                Used Sale
              </button>
              <button
                type="button"
                onClick={() => handleTransactionTypeChange(TRANSACTION_TYPES.RENTAL)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: formData.transaction_type === TRANSACTION_TYPES.RENTAL ? '#2563eb' : '#f3f4f6',
                  color: formData.transaction_type === TRANSACTION_TYPES.RENTAL ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '6px 6px 0 0',
                  cursor: 'pointer',
                  fontWeight: formData.transaction_type === TRANSACTION_TYPES.RENTAL ? 'bold' : 'normal',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  borderBottom: formData.transaction_type === TRANSACTION_TYPES.RENTAL ? '3px solid #2563eb' : 'none',
                  marginBottom: formData.transaction_type === TRANSACTION_TYPES.RENTAL ? '-2px' : '0'
                }}
              >
                Rental
              </button>
              <button
                type="button"
                onClick={() => handleTransactionTypeChange(TRANSACTION_TYPES.SERVICE)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: formData.transaction_type === TRANSACTION_TYPES.SERVICE ? '#2563eb' : '#f3f4f6',
                  color: formData.transaction_type === TRANSACTION_TYPES.SERVICE ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '6px 6px 0 0',
                  cursor: 'pointer',
                  fontWeight: formData.transaction_type === TRANSACTION_TYPES.SERVICE ? 'bold' : 'normal',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  borderBottom: formData.transaction_type === TRANSACTION_TYPES.SERVICE ? '3px solid #2563eb' : 'none',
                  marginBottom: formData.transaction_type === TRANSACTION_TYPES.SERVICE ? '-2px' : '0'
                }}
              >
                Service
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Date *</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                />
              </div>

              {formData.transaction_type !== TRANSACTION_TYPES.SERVICE && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Renterra Order Number</label>
                  <input
                    type="text"
                    name="renterra_order_number"
                    value={formData.renterra_order_number}
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                  />
                </div>
              )}

              {formData.transaction_type === TRANSACTION_TYPES.SERVICE && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Work Order #</label>
                  <input
                    type="text"
                    name="work_order_no"
                    value={formData.work_order_no}
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                  />
                </div>
              )}

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Customer *</label>
                <input
                  type="text"
                  name="customer"
                  value={formData.customer}
                  onChange={handleInputChange}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                />
              </div>

              {/* Items List */}
              {formData.items.map((item, itemIndex) => (
                <div key={itemIndex} style={{
                  marginBottom: '30px',
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: itemIndex > 0 ? '#f9fafb' : 'transparent'
                }}>
                  {itemIndex > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', color: '#374151' }}>Item {itemIndex + 1}</h3>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(itemIndex)}
                        style={{
                          padding: '6px 12px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Remove Item
                      </button>
                    </div>
                  )}

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Brand</label>
                    <select
                      value={item.machine_make}
                      onChange={(e) => {
                        handleItemInputChange(itemIndex, 'machine_make', e.target.value);
                        const brands = [...new Set(machines.map(m => m.brand))];
                        if (brands.includes(e.target.value)) {
                          const machineItems = machines.filter(m => m.brand === e.target.value).map(m => m.machine);
                          if (machineItems.length > 0) {
                            handleMachineSelect(e.target.value, machineItems[0], itemIndex);
                          }
                        }
                      }}
                      style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                    >
                      <option value="">Select Brand</option>
                      {[...new Set(machines.map(m => m.brand))].map(brand => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Machine/Item</label>
                    {item.machine_make === 'Other' ? (
                      <input
                        type="text"
                        value={item.machine_model}
                        onChange={(e) => handleItemInputChange(itemIndex, 'machine_model', e.target.value)}
                        placeholder="Enter machine/item name"
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                      />
                    ) : (
                      <select
                        value={item.machine_model}
                        onChange={(e) => {
                          handleItemInputChange(itemIndex, 'machine_model', e.target.value);
                          handleMachineSelect(item.machine_make, e.target.value, itemIndex);
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                      >
                        <option value="">Select Machine/Item</option>
                        {machines.filter(m => m.brand === item.machine_make).map(machine => (
                          <option key={machine.machine} value={machine.machine}>{machine.machine}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Machine Serial</label>
                    <input
                      type="text"
                      value={item.machine_serial}
                      onChange={(e) => handleItemInputChange(itemIndex, 'machine_serial', e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                    />
                  </div>

                  {item.machine_make === 'Other' && (
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Description *</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemInputChange(itemIndex, 'description', e.target.value)}
                        placeholder="Describe the item being sold/rented"
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Quantity</label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemInputChange(itemIndex, 'quantity', e.target.value)}
                      min="1"
                      style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                    />
                  </div>

                  {(formData.transaction_type === TRANSACTION_TYPES.NEW_SALE || formData.transaction_type === TRANSACTION_TYPES.USED_SALE) && (
                    <>
                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Sale Price</label>
                        <input
                          type="number"
                          value={item.sale_price}
                          onChange={(e) => handleItemInputChange(itemIndex, 'sale_price', e.target.value)}
                          step="0.01"
                          style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                        />
                      </div>

                      {formData.transaction_type === TRANSACTION_TYPES.NEW_SALE && (
                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Discount %</label>
                          <input
                            type="number"
                            value={item.discount_percent}
                            onChange={(e) => handleItemInputChange(itemIndex, 'discount_percent', e.target.value)}
                            step="0.01"
                            min="0"
                            max="100"
                            style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                          />
                        </div>
                      )}

                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Commission %</label>
                        <input
                          type="number"
                          value={item.commission_percent}
                          onChange={(e) => handleItemInputChange(itemIndex, 'commission_percent', e.target.value)}
                          readOnly={item.machine_make !== 'Other'}
                          step="0.01"
                          style={{ 
                            width: '100%', 
                            padding: '8px', 
                            borderRadius: 6, 
                            border: '1px solid #ccc',
                            backgroundColor: item.machine_make === 'Other' ? 'white' : '#f3f4f6',
                            cursor: item.machine_make === 'Other' ? 'text' : 'not-allowed'
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Commission Total</label>
                        <input
                          type="text"
                          value={formatCurrency(item.commission_total)}
                          readOnly
                          style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: '#f3f4f6' }}
                        />
                      </div>
                    </>
                  )}

                  {formData.transaction_type === TRANSACTION_TYPES.RENTAL && (
                    <>
                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Rental Start Date</label>
                        <input
                          type="date"
                          value={item.rental_start_date}
                          onChange={(e) => handleItemInputChange(itemIndex, 'rental_start_date', e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                        />
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Rental End Date</label>
                        <input
                          type="date"
                          value={item.rental_end_date}
                          onChange={(e) => handleItemInputChange(itemIndex, 'rental_end_date', e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                        />
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Rental Days Total</label>
                        <input
                          type="number"
                          value={item.rental_days_total}
                          readOnly
                          min="1"
                          style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                        />
                      </div>

                      {item.machine_make === 'Other' && (
                        <>
                          <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Rental Daily Rate</label>
                            <input
                              type="number"
                              value={item.rental_daily_rate}
                              onChange={(e) => handleItemInputChange(itemIndex, 'rental_daily_rate', e.target.value)}
                              step="0.01"
                              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                            />
                          </div>

                          <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Rental Weekly Rate</label>
                            <input
                              type="number"
                              value={item.rental_weekly_rate}
                              onChange={(e) => handleItemInputChange(itemIndex, 'rental_weekly_rate', e.target.value)}
                              step="0.01"
                              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                            />
                          </div>

                          <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Rental Monthly Rate</label>
                            <input
                              type="number"
                              value={item.rental_monthly_rate}
                              onChange={(e) => handleItemInputChange(itemIndex, 'rental_monthly_rate', e.target.value)}
                              step="0.01"
                              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                            />
                          </div>
                        </>
                      )}

                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Discount %</label>
                        <input
                          type="number"
                          value={item.discount_percent}
                          onChange={(e) => handleItemInputChange(itemIndex, 'discount_percent', e.target.value)}
                          step="0.01"
                          min="0"
                          max="100"
                          style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                        />
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Rental Total</label>
                        <input
                          type="text"
                          value={formatCurrency(item.rental_total)}
                          readOnly
                          style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                        />
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Commission %</label>
                        <input
                          type="number"
                          value={item.commission_percent}
                          onChange={(e) => handleItemInputChange(itemIndex, 'commission_percent', e.target.value)}
                          readOnly={item.machine_make !== 'Other'}
                          step="0.01"
                          style={{ 
                            width: '100%', 
                            padding: '8px', 
                            borderRadius: 6, 
                            border: '1px solid #ccc',
                            backgroundColor: item.machine_make === 'Other' ? 'white' : '#f3f4f6',
                            cursor: item.machine_make === 'Other' ? 'text' : 'not-allowed'
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Commission Total</label>
                        <input
                          type="text"
                          value={formatCurrency(item.commission_total)}
                          readOnly
                          style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: '#f3f4f6' }}
                        />
                      </div>
                    </>
                  )}

                  {formData.transaction_type === TRANSACTION_TYPES.SERVICE && (
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Commission</label>
                      <input
                        type="number"
                        value={item.commission_total}
                        onChange={(e) => handleItemInputChange(itemIndex, 'commission_total', e.target.value)}
                        step="0.01"
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* Add Another Item Button */}
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={handleAddItem}
                  style={{
                    padding: '10px 20px',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: '2px dashed #d1d5db',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  + Add Another Item
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {editingTransaction ? 'Update' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTransaction(null);
                    setFormData({
                      transaction_type: TRANSACTION_TYPES.NEW_SALE,
                      date: new Date().toISOString().split('T')[0],
                      renterra_order_number: '',
                      work_order_no: '',
                      customer: '',
                      items: [{
                        machine_make: '',
                        machine_model: '',
                        machine_serial: '',
                        description: '',
                        quantity: 1,
                        sale_price: '',
                        discount_percent: '',
                        commission_percent: '',
                        commission_total: '',
                        commission_flat_rate: '',
                        rental_start_date: '',
                        rental_end_date: '',
                        rental_days_total: '',
                        rental_total: '',
                        rental_daily_rate: '',
                        rental_weekly_rate: '',
                        rental_monthly_rate: ''
                      }]
    });
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="manager-table-wrapper" style={{ overflowX: 'auto', fontFamily: 'Arial, sans-serif', margin: '20px 30px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>No transactions found.</div>
        ) : (
          <>
            <table className="manager-table" style={{ width: '100%', fontFamily: 'Arial, Sans-Serif' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Customer</th>
                  <th>Machine</th>
                  <th>Renterra Order #</th>
                  <th>Work Order #</th>
                  <th>Sale Price</th>
                  <th>Commission %</th>
                  <th style={{ borderLeft: '3px solid #10b981', borderRight: '3px solid #10b981', backgroundColor: '#f0fdf4' }}>Commission Total</th>
                  <th>Rental Days</th>
                  <th>Rental Total</th>
                  {isAdmin && <th>Salesman</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(trans => {
                  // Determine background color based on transaction type
                  let rowStyle = {};
                  if (trans.transaction_type === TRANSACTION_TYPES.RENTAL) {
                    rowStyle.backgroundColor = '#e9d5ff'; // Purple with more contrast
                  } else if (trans.transaction_type === TRANSACTION_TYPES.NEW_SALE || trans.transaction_type === TRANSACTION_TYPES.USED_SALE) {
                    rowStyle.backgroundColor = '#bbf7d0'; // Green with more contrast
                  } else if (trans.transaction_type === TRANSACTION_TYPES.SERVICE) {
                    rowStyle.backgroundColor = '#bfdbfe'; // Blue with more contrast
                  }
                  
                  return (
                    <tr key={trans.id} style={rowStyle}>
                      <td>{formatDate(trans.date)}</td>
                      <td>{trans.transaction_type.replace('_', ' ').toUpperCase()}</td>
                      <td>{trans.customer}</td>
                      <td>{`${trans.machine_make || ''} ${trans.machine_model || ''}`.trim() || '-'}</td>
                      <td>{trans.renterra_order_number || '-'}</td>
                      <td>{trans.work_order_no || '-'}</td>
                      <td>{formatCurrency(trans.sale_price)}</td>
                      <td>{formatPercent(trans.commission_percent)}</td>
                      <td style={{ borderLeft: '3px solid #10b981', borderRight: '3px solid #10b981', fontWeight: 'bold' }}>{formatCurrency(trans.commission_total)}</td>
                      <td>{trans.rental_days_total || '-'}</td>
                      <td>{formatCurrency(trans.rental_total)}</td>
                      {isAdmin && <td>{trans.salesman_username}</td>}
                      <td>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap' }}>
                          {trans.transaction_type === TRANSACTION_TYPES.RENTAL && (
                            <button
                              onClick={() => handleCallOff(trans)}
                              style={{
                                padding: '4px 10px',
                                background: '#8b5cf6',
                                color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              Call Off
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(trans)}
                            style={{
                              padding: '4px 10px',
                              background: '#2563eb',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(trans.id)}
                            style={{
                              padding: '4px 10px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '8px 16px',
                    background: page === 1 ? '#ccc' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: page === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Previous
                </button>
                <span style={{ padding: '8px 16px', alignSelf: 'center' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: '8px 16px',
                    background: page === totalPages ? '#ccc' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: page === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

