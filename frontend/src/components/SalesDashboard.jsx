import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

const getMonthRange = (offset = 0) => {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = base.toISOString().split('T')[0];
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0).toISOString().split('T')[0];
  return { start, end };
};

const determineRateTier = (days) => {
  if (Number.isFinite(days)) {
    if (days >= 21) return 'monthly';
    if (days >= 3) return 'weekly';
  }
  return 'daily';
};

const normalizeRentalRates = (dailyRate, weeklyRate, monthlyRate) => {
  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  };

  let normalizedDaily = toNumber(dailyRate);
  let normalizedWeekly = toNumber(weeklyRate);
  let normalizedMonthly = toNumber(monthlyRate);

  if (!normalizedDaily && normalizedWeekly) {
    normalizedDaily = normalizedWeekly / 7;
  } else if (!normalizedDaily && normalizedMonthly) {
    normalizedDaily = normalizedMonthly / 28;
  }

  if (!normalizedWeekly && normalizedDaily) {
    normalizedWeekly = normalizedDaily * 7;
  } else if (!normalizedWeekly && normalizedMonthly) {
    normalizedWeekly = normalizedMonthly / 4;
  }

  if (!normalizedMonthly && normalizedWeekly) {
    normalizedMonthly = normalizedWeekly * 4;
  } else if (!normalizedMonthly && normalizedDaily) {
    normalizedMonthly = normalizedDaily * 28;
  }

  return {
    daily: normalizedDaily,
    weekly: normalizedWeekly,
    monthly: normalizedMonthly
  };
};

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

const formatRateTypeLabel = (type) => {
  if (type === 'monthly') return 'Monthly (28d)';
  if (type === 'weekly') return 'Weekly';
  if (type === 'daily') return 'Daily';
  return '-';
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

const normalizeDateValue = (value) => {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    return value.split('T')[0];
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? '' : parsed.toISOString().split('T')[0];
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
  const { start: currentMonthStart, end: currentMonthEnd } = getMonthRange();

  const [filters, setFilters] = useState({
    transactionType: '',
    startDate: currentMonthStart,
    endDate: currentMonthEnd,
    salesman: '',
    status: 'active',
    month: 'current'
  });
  const monthPresetOptions = [
    { value: 'current', label: 'Current Month' },
    { value: 'previous', label: 'Previous Month' },
    { value: 'next', label: 'Next Month' },
    { value: 'custom', label: 'Custom Range' }
  ];

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

  const isAdmin = user?.roles?.includes('owner') || user?.roles?.includes('analytics') || user?.roles?.includes('manager') || user?.role === 'owner' || user?.role === 'analytics' || user?.role === 'manager';
  const canFilterBySalesman = user?.roles?.includes('owner') || user?.roles?.includes('analytics') || user?.role === 'owner' || user?.role === 'analytics';
  const [showColumnManager, setShowColumnManager] = useState(false);
  const columnStorageKey = useMemo(() => `sales_dashboard_columns_${user?.username || 'default'}`, [user?.username]);

  const renderRentalStatusChip = (trans) => {
    if (trans.transaction_type !== TRANSACTION_TYPES.RENTAL) {
      return '-';
    }
    const label = trans.is_rental_active ? 'Active' : (trans.ended_this_month ? 'Ended this month' : 'Ended');
    const backgroundColor = trans.is_rental_active ? '#c4b5fd' : '#d1d5db';
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 999,
          backgroundColor,
          color: '#111827',
          fontSize: 12,
          fontWeight: 'bold'
        }}
      >
        {label}
      </span>
    );
  };

  const columnDefinitions = useMemo(() => [
    {
      id: 'date',
      label: 'Date',
      render: (trans) => formatDate(trans.date)
    },
    {
      id: 'type',
      label: 'Type',
      render: (trans) => trans.transaction_type.replace('_', ' ').toUpperCase()
    },
    {
      id: 'customer',
      label: 'Customer',
      render: (trans) => trans.customer || '-'
    },
    {
      id: 'machine',
      label: 'Machine',
      render: (trans) => {
        const machine = `${trans.machine_make || ''} ${trans.machine_model || ''}`.trim();
        return machine || '-';
      }
    },
    {
      id: 'renterraOrder',
      label: 'Renterra Order #',
      render: (trans) => trans.renterra_order_number || '-'
    },
    {
      id: 'salePrice',
      label: 'Sale Price',
      render: (trans) => formatCurrency(trans.sale_price)
    },
    {
      id: 'commissionTotal',
      label: 'Commission Total',
      render: (trans) => formatCurrency(trans.commission_total),
      headerStyle: { borderLeft: '3px solid #10b981', borderRight: '3px solid #10b981', backgroundColor: '#f0fdf4' },
      cellStyle: { borderLeft: '3px solid #10b981', borderRight: '3px solid #10b981', fontWeight: 'bold' }
    },
    {
      id: 'nextTier',
      label: 'Next Payout Tier',
      render: (trans) => trans.transaction_type === TRANSACTION_TYPES.RENTAL ? formatRateTypeLabel(trans.next_commission_rate_type) : '-'
    },
    {
      id: 'nextAmount',
      label: 'Rental Rate',
      render: (trans) => trans.transaction_type === TRANSACTION_TYPES.RENTAL ? formatCurrency(trans.next_commission_base_amount) : '-'
    },
    {
      id: 'nextDue',
      label: 'Next Commission Due',
      render: (trans) => {
        if (trans.transaction_type !== TRANSACTION_TYPES.RENTAL) return '-';
        return trans.next_commission_due_date ? formatDate(trans.next_commission_due_date) : '-';
      }
    },
    {
      id: 'rentalDays',
      label: 'Rental Days',
      render: (trans) => trans.rental_days_total || '-'
    },
    {
      id: 'rentalTotal',
      label: 'Rental Total',
      render: (trans) => formatCurrency(trans.rental_total)
    },
    {
      id: 'rentalStatus',
      label: 'Rental Status',
      render: (trans) => renderRentalStatusChip(trans)
    },
    {
      id: 'salesman',
      label: 'Salesman',
      render: (trans) => trans.salesman_username || '-',
      adminOnly: true
    }
  ], []);

  const computeDefaultVisibility = useCallback(() => {
    const defaults = {};
    columnDefinitions.forEach(col => {
      defaults[col.id] = col.defaultVisible !== false;
    });
    return defaults;
  }, [columnDefinitions]);

  const [columnVisibility, setColumnVisibility] = useState(() => computeDefaultVisibility());

  useEffect(() => {
    const defaults = computeDefaultVisibility();
    if (typeof window === 'undefined') {
      setColumnVisibility(defaults);
      return;
    }
    try {
      const stored = localStorage.getItem(columnStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setColumnVisibility({ ...defaults, ...parsed });
      } else {
        setColumnVisibility(defaults);
      }
    } catch (error) {
      console.error('Failed to parse column preferences:', error);
      setColumnVisibility(defaults);
    }
  }, [columnStorageKey, computeDefaultVisibility]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(columnStorageKey, JSON.stringify(columnVisibility));
  }, [columnStorageKey, columnVisibility]);

  const visibleColumns = useMemo(() => columnDefinitions.filter(col => {
    if (col.adminOnly && !isAdmin) return false;
    const isVisible = columnVisibility[col.id];
    if (typeof isVisible === 'boolean') {
      return isVisible;
    }
    return col.defaultVisible !== false;
  }), [columnDefinitions, columnVisibility, isAdmin]);

  const availableColumnsForManager = useMemo(() => columnDefinitions.filter(col => !col.adminOnly || isAdmin), [columnDefinitions, isAdmin]);

  const handleToggleColumn = useCallback((columnId) => {
    setColumnVisibility(prev => {
      const column = columnDefinitions.find(col => col.id === columnId);
      if (!column) return prev;
      const currentlyVisible = prev[columnId] !== undefined ? prev[columnId] : (column.defaultVisible !== false);
      if (currentlyVisible) {
        const otherVisibleColumns = columnDefinitions.filter(col => {
          if (col.id === columnId) return false;
          if (col.adminOnly && !isAdmin) return false;
          const value = prev[col.id] !== undefined ? prev[col.id] : (col.defaultVisible !== false);
          return value;
        }).length;
        if (otherVisibleColumns === 0) {
          return prev;
        }
      }
      return { ...prev, [columnId]: !currentlyVisible };
    });
  }, [columnDefinitions, isAdmin]);

  const handleMonthPresetChange = (value) => {
    if (value === 'custom') {
      setFilters(prev => ({ ...prev, month: '', startDate: prev.startDate, endDate: prev.endDate }));
      return;
    }

    const presetMap = {
      current: getMonthRange(),
      previous: getMonthRange(-1),
      next: getMonthRange(1)
    };

    const selectedRange = presetMap[value] || getMonthRange();

    setFilters(prev => ({
      ...prev,
      month: value,
      startDate: selectedRange.start,
      endDate: selectedRange.end
    }));
  };

  const handleDateInputChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      month: '',
      [field]: value
    }));
  };

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
    if (!days || days <= 0) {
      return 0;
    }

    const DAYS_PER_MONTH = 28;
    const DAYS_PER_WEEK = 7;
    const DAYS_FOR_WEEK = 3; // 3+ days = 1 week
    const DAYS_FOR_MONTH_FROM_WEEKS = 21; // 3 weeks = 21 days = 1 month

    const positiveOrNull = (value) => {
      const num = Number(value);
      return Number.isFinite(num) && num > 0 ? num : null;
    };

    let normalizedDailyRate = positiveOrNull(dailyRate);
    let normalizedWeeklyRate = positiveOrNull(weeklyRate);
    let normalizedMonthlyRate = positiveOrNull(monthlyRate);

    if (!normalizedDailyRate && normalizedWeeklyRate) {
      normalizedDailyRate = normalizedWeeklyRate / DAYS_PER_WEEK;
    } else if (!normalizedDailyRate && normalizedMonthlyRate) {
      normalizedDailyRate = normalizedMonthlyRate / DAYS_PER_MONTH;
    }

    if (!normalizedWeeklyRate && normalizedDailyRate) {
      normalizedWeeklyRate = normalizedDailyRate * DAYS_PER_WEEK;
    } else if (!normalizedWeeklyRate && normalizedMonthlyRate) {
      normalizedWeeklyRate = normalizedMonthlyRate / Math.ceil(DAYS_PER_MONTH / DAYS_PER_WEEK);
    }

    if (!normalizedMonthlyRate && normalizedWeeklyRate) {
      normalizedMonthlyRate = normalizedWeeklyRate * Math.ceil(DAYS_PER_MONTH / DAYS_PER_WEEK);
    } else if (!normalizedMonthlyRate && normalizedDailyRate) {
      normalizedMonthlyRate = normalizedDailyRate * DAYS_PER_MONTH;
    }

    if (!normalizedDailyRate && !normalizedWeeklyRate && !normalizedMonthlyRate) {
      return 0;
    }

    let remainingDays = parseInt(days, 10);
    let total = 0;

    if (normalizedMonthlyRate) {
      const fullMonths = Math.floor(remainingDays / DAYS_PER_MONTH);
      if (fullMonths > 0) {
        total += fullMonths * normalizedMonthlyRate;
        remainingDays -= fullMonths * DAYS_PER_MONTH;
      }
    }

    if (normalizedMonthlyRate && remainingDays >= DAYS_FOR_MONTH_FROM_WEEKS) {
      total += normalizedMonthlyRate;
      remainingDays -= DAYS_FOR_MONTH_FROM_WEEKS;
    }

    if (normalizedWeeklyRate) {
      const remainingWeeks = Math.floor(remainingDays / DAYS_PER_WEEK);
      if (remainingWeeks > 0) {
        total += remainingWeeks * normalizedWeeklyRate;
        remainingDays -= remainingWeeks * DAYS_PER_WEEK;
      }
    } else if (normalizedDailyRate) {
      const remainingWeeks = Math.floor(remainingDays / DAYS_PER_WEEK);
      if (remainingWeeks > 0) {
        total += remainingWeeks * DAYS_PER_WEEK * normalizedDailyRate;
        remainingDays -= remainingWeeks * DAYS_PER_WEEK;
      }
    }

    if (remainingDays >= DAYS_FOR_WEEK) {
      if (normalizedWeeklyRate) {
        total += normalizedWeeklyRate;
        remainingDays = 0;
      } else if (normalizedDailyRate) {
        total += remainingDays * normalizedDailyRate;
        remainingDays = 0;
      }
    } else if (remainingDays > 0 && normalizedDailyRate) {
      total += remainingDays * normalizedDailyRate;
      remainingDays = 0;
    }

    if (discountPercent > 0) {
      total = total * (1 - discountPercent / 100);
    }

    return total;
  };

  const calculateRentalDaysTotal = (startDate, endDate) => {
    if (!startDate || !endDate) return '';
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return '';
    }
    const diffTime = end - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays.toString() : '';
  };

const calculateNextBillingAmount = (item = {}) => {
  const quantity = parseInt(item.quantity, 10) || 1;
  const discountPercent = clampNumber(parseFloat(item.discount_percent) || 0, 0, 100);
  const rentalDays = parseInt(item.rental_days_total, 10);
  const rateType = determineRateTier(rentalDays);
  const rates = normalizeRentalRates(item.rental_daily_rate, item.rental_weekly_rate, item.rental_monthly_rate);
  let rateValue = rates[rateType] || rates.monthly || rates.weekly || rates.daily;

  if (!rateValue) {
    return null;
  }

  const discounted = rateValue * quantity * (1 - discountPercent / 100);
  return discounted > 0 ? discounted : null;
};

  const applyCalculationsToItem = (item, transactionType) => {
    const updatedItem = { ...item };
    const quantity = parseInt(item.quantity, 10) || 1;

    if (transactionType === TRANSACTION_TYPES.RENTAL) {
      const rentalDaysTotal = calculateRentalDaysTotal(item.rental_start_date, item.rental_end_date);
      updatedItem.rental_days_total = rentalDaysTotal;

      const dailyRate = parseFloat(updatedItem.rental_daily_rate) || 0;
      const weeklyRate = parseFloat(updatedItem.rental_weekly_rate) || 0;
      const monthlyRate = parseFloat(updatedItem.rental_monthly_rate) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;

      if (rentalDaysTotal) {
        const rentalTotal = calculateRentalTotal(
          parseInt(rentalDaysTotal, 10),
          dailyRate,
          weeklyRate,
          monthlyRate,
          discountPercent
        );
        updatedItem.rental_total = rentalTotal ? rentalTotal.toFixed(2) : '';
      } else {
        updatedItem.rental_total = '';
      }

      const commissionPercent = 2;
      updatedItem.commission_percent = commissionPercent.toString();

      let commissionBase = calculateNextBillingAmount(updatedItem);
      if (!commissionBase) {
        const rentalTotalValue = parseFloat(updatedItem.rental_total);
        if (!isNaN(rentalTotalValue) && rentalTotalValue > 0) {
          commissionBase = rentalTotalValue;
        }
      }

      if (commissionBase > 0) {
        const commissionTotal = (commissionBase * commissionPercent) / 100;
        updatedItem.commission_total = commissionTotal.toFixed(2);
      } else {
        updatedItem.commission_total = '';
      }
    } else if (
      transactionType === TRANSACTION_TYPES.NEW_SALE ||
      transactionType === TRANSACTION_TYPES.USED_SALE
    ) {
      const flatRateCommission = parseFloat(item.commission_flat_rate) || 0;
      if (flatRateCommission > 0) {
        const commissionTotal = flatRateCommission * quantity;
        updatedItem.commission_total = commissionTotal.toFixed(2);
      } else {
        const salePrice = parseFloat(item.sale_price) || 0;
        const discountPercent = parseFloat(item.discount_percent) || 0;
        const commissionPercent = parseFloat(item.commission_percent) || 0;

        if (salePrice && commissionPercent) {
          const discountedPrice = salePrice * (1 - discountPercent / 100);
          const commissionTotal = (discountedPrice * commissionPercent / 100) * quantity;
          updatedItem.commission_total = commissionTotal.toFixed(2);
        } else {
          updatedItem.commission_total = '';
        }
      }
    }

    return updatedItem;
  };

  const calculationDependencies = JSON.stringify(
    formData.items.map(item => ({
      sale_price: item.sale_price,
      discount_percent: item.discount_percent,
      commission_percent: item.commission_percent,
      quantity: item.quantity,
      commission_flat_rate: item.commission_flat_rate,
      rental_start_date: item.rental_start_date,
      rental_end_date: item.rental_end_date,
      rental_daily_rate: item.rental_daily_rate,
      rental_weekly_rate: item.rental_weekly_rate,
      rental_monthly_rate: item.rental_monthly_rate
    }))
  );

  // Calculate commission and rental days for each item when relevant fields change
  useEffect(() => {
    setFormData(prev => {
      const recalculatedItems = prev.items.map(item => applyCalculationsToItem(item, prev.transaction_type));
      const hasChanges = recalculatedItems.some((updatedItem, index) => {
        return JSON.stringify(updatedItem) !== JSON.stringify(prev.items[index]);
      });
      if (!hasChanges) {
        return prev;
      }
      return { ...prev, items: recalculatedItems };
    });
  }, [formData.transaction_type, calculationDependencies]);

  // Ensure rental rates are populated when editing existing rentals (especially legacy data)
  useEffect(() => {
    if (!showForm || formData.transaction_type !== TRANSACTION_TYPES.RENTAL || machines.length === 0) {
      return;
    }

    setFormData(prev => {
      let hasChanges = false;
      const updatedItems = prev.items.map(item => {
        if (!item.machine_make || item.machine_make === 'Other') {
          return item;
        }

        const machineData = machines.find(
          (machine) =>
            machine.brand?.toLowerCase() === item.machine_make?.toLowerCase() &&
            machine.machine?.toLowerCase() === item.machine_model?.toLowerCase()
        );

        if (!machineData) {
          return item;
        }

        const nextItem = { ...item };
        let itemChanged = false;

        if (!nextItem.rental_daily_rate && machineData.rentalDailyRate) {
          nextItem.rental_daily_rate = machineData.rentalDailyRate.toString();
          itemChanged = true;
        }
        if (!nextItem.rental_weekly_rate && machineData.rentalWeeklyRate) {
          nextItem.rental_weekly_rate = machineData.rentalWeeklyRate.toString();
          itemChanged = true;
        }
        if (!nextItem.rental_monthly_rate && machineData.rentalMonthlyRate) {
          nextItem.rental_monthly_rate = machineData.rentalMonthlyRate.toString();
          itemChanged = true;
        }

        if (itemChanged) {
          hasChanges = true;
          return nextItem;
        }

        return item;
      });

      if (!hasChanges) {
        return prev;
      }

      return { ...prev, items: updatedItems };
    });
  }, [machines, showForm, formData.transaction_type]);

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

  const buildUpdatePayload = (item) => {
    return {
      transaction_type: formData.transaction_type,
      date: normalizeDateValue(formData.date),
      renterra_order_number: formData.renterra_order_number || '',
      work_order_no: formData.work_order_no || '',
      customer: formData.customer || '',
      machine_make: item.machine_make || '',
      machine_model: item.machine_model || '',
      machine_serial: item.machine_serial || '',
      description: item.description || '',
      quantity: item.quantity || 1,
      sale_price: item.sale_price || '',
      discount_percent: item.discount_percent || '',
      commission_percent: item.commission_percent || '',
      commission_total: item.commission_total || '',
      rental_days_total: item.rental_days_total || '',
      rental_total: item.rental_total || '',
      rental_start_date: normalizeDateValue(item.rental_start_date) || null,
      rental_end_date: normalizeDateValue(item.rental_end_date) || null,
      rental_daily_rate: item.rental_daily_rate || '',
      rental_weekly_rate: item.rental_weekly_rate || '',
      rental_monthly_rate: item.rental_monthly_rate || ''
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const recalculatedItems = formData.items.map(item => applyCalculationsToItem(item, formData.transaction_type));
      setFormData(prev => ({ ...prev, items: recalculatedItems }));

      if (editingTransaction) {
        const payload = buildUpdatePayload(recalculatedItems[0] || {});
        await API.put(`/api/sales/transactions/${editingTransaction.id}`, payload, {
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
          items: recalculatedItems
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
    setEditingTransaction(transaction);
    setFormData({
      transaction_type: transaction.transaction_type,
      date: normalizeDateValue(transaction.date),
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
        rental_start_date: normalizeDateValue(transaction.rental_start_date),
        rental_end_date: normalizeDateValue(transaction.rental_end_date),
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
        formatRateTypeLabel(trans.next_commission_rate_type),
        trans.next_commission_due_date ? formatDate(trans.next_commission_due_date) : '',
        trans.rental_days_total || '',
        formatCurrency(trans.rental_total),
        trans.transaction_type === TRANSACTION_TYPES.RENTAL
          ? (trans.is_rental_active ? 'Active' : (trans.ended_this_month ? 'Ended this month' : 'Ended'))
          : ''
      ]);

      doc.autoTable({
        startY: y,
        head: [['Date', 'Type', 'Salesman', 'Customer', 'Machine', 'Renterra Order #', 'Work Order #', 'Sale Price', 'Commission %', 'Commission Total', 'Next Tier', 'Next Due', 'Rental Days', 'Rental Total', 'Rental Status']],
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

  const salesmanOptions = stats?.bySalesman ? Object.keys(stats.bySalesman).sort((a, b) => a.localeCompare(b)) : [];

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
        {canFilterBySalesman && (
          <select
            value={filters.salesman}
            onChange={(e) => setFilters(prev => ({ ...prev, salesman: e.target.value }))}
            style={{ padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
          >
            <option value="">All Salesmen</option>
            {salesmanOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
        <select
          value={filters.status}
          onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          style={{ padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
        >
          <option value="active">Active Rentals</option>
          <option value="all">All Transactions</option>
          <option value="inactive">Called Off Rentals</option>
        </select>
        <select
          value={filters.month || 'custom'}
          onChange={(e) => handleMonthPresetChange(e.target.value)}
          style={{ padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
        >
          {monthPresetOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => handleDateInputChange('startDate', e.target.value)}
          placeholder="Start Date"
          style={{ padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => handleDateInputChange('endDate', e.target.value)}
          placeholder="End Date"
          style={{ padding: '8px', borderRadius: 6, border: '1px solid #ccc' }}
        />
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowColumnManager(prev => !prev)}
            style={{
              padding: '8px 16px',
              background: '#f97316',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Manage Columns
          </button>
          {showColumnManager && (
            <div
              style={{
                position: 'absolute',
                top: '110%',
                right: 0,
                zIndex: 30,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '16px',
                width: '240px',
                boxShadow: '0 15px 30px rgba(0,0,0,0.15)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 'bold', fontSize: 14 }}>Manage Columns</span>
                <button
                  onClick={() => setShowColumnManager(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1
                  }}
                  aria-label="Close column manager"
                >
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {availableColumnsForManager.map(col => {
                  const isChecked = columnVisibility[col.id] !== undefined ? columnVisibility[col.id] : (col.defaultVisible !== false);
                  const otherVisibleCount = isChecked ? visibleColumns.filter(vc => vc.id !== col.id).length : visibleColumns.length;
                  const disableUncheck = isChecked && otherVisibleCount === 0;
                  return (
                    <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={disableUncheck}
                        onChange={() => handleToggleColumn(col.id)}
                      />
                      {col.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
                  {visibleColumns.map(col => (
                    <th key={col.id} style={col.headerStyle || undefined}>{col.label}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(trans => {
                  const isRental = trans.transaction_type === TRANSACTION_TYPES.RENTAL;
                  const rowStyle = {};
                  if (isRental) {
                    rowStyle.backgroundColor = trans.is_rental_active ? '#ede9fe' : '#f3f4f6';
                    rowStyle.borderLeft = `4px solid ${trans.is_rental_active ? '#7c3aed' : '#9ca3af'}`;
                    if (!trans.is_rental_active && trans.ended_this_month) {
                      rowStyle.opacity = 0.85;
                    }
                  } else if (trans.transaction_type === TRANSACTION_TYPES.NEW_SALE || trans.transaction_type === TRANSACTION_TYPES.USED_SALE) {
                    rowStyle.backgroundColor = '#bbf7d0';
                  } else if (trans.transaction_type === TRANSACTION_TYPES.SERVICE) {
                    rowStyle.backgroundColor = '#bfdbfe';
                  }

                  const rentalStatusLabel = !isRental
                    ? '-'
                    : trans.is_rental_active
                      ? 'Active'
                      : trans.ended_this_month
                        ? 'Ended this month'
                        : 'Ended';
                  
                  return (
                    <tr key={trans.id} style={rowStyle}>
                      {visibleColumns.map(col => (
                        <td key={col.id} style={col.cellStyle || undefined}>
                          {col.render(trans)}
                        </td>
                      ))}
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

