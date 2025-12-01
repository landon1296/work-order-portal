import React, { useEffect, useState, useMemo, useCallback } from "react";
import API from "../api";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line
} from "recharts";
import GLLSLogo from '../assets/GLLSLogo.png';
import { getStatusColor } from '../utils/statusColors';
import { useNavigate } from "react-router-dom";

// Constants
const COLORS = ["#2563eb", "#facc15", "#10b981", "#ef4444", "#818cf8", "#f472b6", "#fb923c"];

const SHOP_OPTIONS = [
  { value: 'All Shops', label: 'All Shops' },
  { value: 'Texas Shop', label: 'Texas Shop' },
  { value: 'Florida Shop', label: 'Florida Shop' },
  { value: 'Peotone Shop', label: 'Peotone Shop' }
];

const SLOW_MOVER_THRESHOLD_DAYS = 10;
const STATUS_PART_KEYWORDS = ['pending parts', 'waiting on part', 'pending part', 'awaiting part'];

// Utility functions
const calculateDaysOpen = (createdAt) => {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  const now = new Date();
  return Math.max(0, (now - created) / (1000 * 60 * 60 * 24));
};

const isWorkOrderClosed = (workOrder) => {
  if (!workOrder.status_history || !Array.isArray(workOrder.status_history)) return false;
  const lastStatus = workOrder.status_history.at(-1);
  return lastStatus && lastStatus.status && lastStatus.status.toLowerCase() === "closed";
};

const isWaitingOnParts = (workOrder) => {
  const status = (workOrder.status || '').toLowerCase();
  const hasPartStatus = STATUS_PART_KEYWORDS.some(keyword => status.includes(keyword));
  const hasWaitingParts = Array.isArray(workOrder.parts) && workOrder.parts.some(p => p.waiting === true);
  return hasPartStatus || hasWaitingParts;
};

const getTechniciansFromTimeLogs = (timeLogs) => {
  if (!Array.isArray(timeLogs)) return new Set();
  return new Set(timeLogs.map(log => log.technician_assigned).filter(Boolean));
};

const normalizeStatus = (status) => {
  if (!status) return "Assigned";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

const getWeekStartDate = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay();
  const diff = (day + 6) % 7; // move to Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
};

const formatWeekLabel = (date) => {
  return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

const addToWeeklyBucket = (buckets, rawDate, days) => {
  const weekStart = getWeekStartDate(rawDate);
  if (!weekStart || days === null || Number.isNaN(days)) return;
  const key = weekStart.toISOString().slice(0, 10);
  if (!buckets[key]) {
    buckets[key] = { total: 0, count: 0, label: formatWeekLabel(weekStart) };
  }
  buckets[key].total += days;
  buckets[key].count += 1;
};

const finalizeWeeklyTrend = (buckets, valueKey) => {
  const sortedEntries = Object.entries(buckets).sort(
    (a, b) => new Date(a[0]) - new Date(b[0])
  );
  let runningTotal = 0;
  let runningCount = 0;
  return sortedEntries.map(([, bucket]) => {
    runningTotal += bucket.total;
    runningCount += bucket.count;
    return {
      week: bucket.label,
      [valueKey]: Number((runningTotal / runningCount).toFixed(1))
    };
  });
};

const calculateAvgDaysToCloseStats = (closedOrders, invoicedButNotClosedOrders = []) => {
  const weeklyBuckets = {};
  const allDaysArray = [];

  closedOrders.forEach(wo => {
    if (!wo.created_at || !Array.isArray(wo.status_history)) return;
    const createdAt = new Date(wo.created_at);
    const closedEntry = [...wo.status_history].reverse().find(
      entry => (entry.status || "").toLowerCase() === "closed"
    );
    if (!createdAt || !closedEntry || !closedEntry.date) return;
    const closedAt = new Date(closedEntry.date);
    const days = Math.max(0, (closedAt - createdAt) / (1000 * 60 * 60 * 24));
    allDaysArray.push(days);
    addToWeeklyBucket(weeklyBuckets, closedAt, days);
  });

  invoicedButNotClosedOrders.forEach(wo => {
    if (!wo.created_at || !Array.isArray(wo.status_history)) return;
    const createdAt = new Date(wo.created_at);
    const today = new Date();
    const days = Math.max(0, (today - createdAt) / (1000 * 60 * 60 * 24));
    allDaysArray.push(days);
    addToWeeklyBucket(weeklyBuckets, today, days);
  });

  const weeklySeries = finalizeWeeklyTrend(weeklyBuckets, 'avgDaysToClose');
  if (allDaysArray.length === 0) {
    return { average: null, weeklySeries };
  }
  const totalDays = allDaysArray.reduce((sum, days) => sum + days, 0);
  return { average: (totalDays / allDaysArray.length).toFixed(1), weeklySeries };
};

const calculateAvgDaysToCustomerInvoicedStats = (orders) => {
  const weeklyBuckets = {};
  const invoicedDaysArray = [];

  orders.forEach(wo => {
    if (!wo.created_at || !Array.isArray(wo.status_history)) return;
    const createdAt = new Date(wo.created_at);
    const invoicedEntry = [...wo.status_history].reverse().find(entry => {
      const status = (entry.status || "").toLowerCase();
      return status.includes("customer invoiced") ||
             status.includes("submitted for billing") ||
             status === "customer invoiced";
    });
    if (!createdAt || !invoicedEntry || !invoicedEntry.date) return;
    const invoicedAt = new Date(invoicedEntry.date);
    const days = Math.max(0, (invoicedAt - createdAt) / (1000 * 60 * 60 * 24));
    invoicedDaysArray.push(days);
    addToWeeklyBucket(weeklyBuckets, invoicedAt, days);
  });

  const weeklySeries = finalizeWeeklyTrend(weeklyBuckets, 'avgWorkingDays');
  if (invoicedDaysArray.length === 0) {
    return { average: null, weeklySeries };
  }
  const totalInvoicedDays = invoicedDaysArray.reduce((sum, days) => sum + days, 0);
  return { average: (totalInvoicedDays / invoicedDaysArray.length).toFixed(1), weeklySeries };
};

// Custom hooks
const useAnalyticsData = (user) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(() => {
    if (!user?.token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    API.get("/api/analytics/summary", {
      headers: { Authorization: `Bearer ${user.token}` }
    })
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch analytics data:', err);
        setError('Failed to load analytics data. Please try again.');
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};

const useShopFilter = () => {
  const [shopFilter, setShopFilter] = useState(() => 
    localStorage.getItem('defaultShopFilter') || 'All Shops'
  );

  const setDefaultShopFilter = useCallback((filter) => {
    localStorage.setItem('defaultShopFilter', filter);
    setShopFilter(filter);
  }, []);

  return { shopFilter, setShopFilter, setDefaultShopFilter };
};

// Main component
export default function AnalyticsDashboard({ user }) {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useAnalyticsData(user);
  const { shopFilter, setShopFilter, setDefaultShopFilter } = useShopFilter();

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Memoized calculations
  const {
    filteredOrders,
    slowMoversFiltered,
    waitingOnPartsFiltered,
    kpiData,
    chartData
  } = useMemo(() => {
    if (!data) return {
      filteredOrders: [],
      slowMoversFiltered: [],
      waitingOnPartsFiltered: [],
      kpiData: {},
      chartData: {}
    };

    const orders = data.allWorkOrders || [];
    const filteredOrders = shopFilter === 'All Shops' 
      ? orders 
      : orders.filter(wo => wo.shop === shopFilter);

    const slowMoversFiltered = filteredOrders.filter(wo => {
      if (!wo.created_at || !wo.status_history) return false;
      if (isWorkOrderClosed(wo)) return false;
      return calculateDaysOpen(wo.created_at) > SLOW_MOVER_THRESHOLD_DAYS;
    });

    const waitingOnPartsFiltered = filteredOrders.filter(isWaitingOnParts);

    // KPI calculations
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = (now.getMonth() + 1).toString().padStart(2, '0');

    const closedOrdersCount = filteredOrders.filter(wo =>
      wo.status && wo.status.toLowerCase().includes('closed')
    ).length;

    const waitingPartOrdersCount = filteredOrders.filter(wo =>
      wo.status && STATUS_PART_KEYWORDS.some(keyword => 
        wo.status.toLowerCase().includes(keyword)
      )
    ).length;

    const ordersThisYearCount = filteredOrders.filter(wo =>
      wo.date && wo.date.startsWith(thisYear.toString())
    ).length;

    const ordersThisMonthCount = filteredOrders.filter(wo =>
      wo.date && wo.date.startsWith(`${thisYear}-${thisMonth}`)
    ).length;

    const closedFiltered = filteredOrders.filter(wo =>
      wo.status && wo.status.toLowerCase().includes("closed") &&
      Array.isArray(wo.status_history) && wo.created_at
    );

    // Find work orders that are at "customer invoiced" but not yet closed
    const invoicedButNotClosedFiltered = filteredOrders.filter(wo =>
      wo.status && 
      !wo.status.toLowerCase().includes("closed") &&
      Array.isArray(wo.status_history) && 
      wo.created_at &&
      wo.status_history.some(entry => {
        const status = (entry.status || "").toLowerCase();
        return status.includes("customer invoiced") || 
               status.includes("submitted for billing") ||
               status === "customer invoiced";
      })
    );

    const {
      average: avgDaysToCloseFiltered,
      weeklySeries: avgDaysToCloseTrend
    } = calculateAvgDaysToCloseStats(closedFiltered, invoicedButNotClosedFiltered);

    // Calculate average days to customer invoiced (work actually finished)
    const invoicedFiltered = filteredOrders.filter(wo =>
      Array.isArray(wo.status_history) && wo.created_at &&
      wo.status_history.some(entry => {
        const status = (entry.status || "").toLowerCase();
        return status.includes("customer invoiced") || 
               status.includes("submitted for billing") ||
               status === "customer invoiced";
      })
    );

    const {
      average: avgDaysToCustomerInvoiced,
      weeklySeries: avgWorkingDaysTrend
    } = calculateAvgDaysToCustomerInvoicedStats(invoicedFiltered);

    // Chart data calculations
    const countByTechnician = (orders) => {
      const techOrders = {};
      orders.forEach(wo => {
        if (!isWorkOrderClosed(wo)) {
          const techs = getTechniciansFromTimeLogs(wo.timeLogs);
          techs.forEach(tech => {
            techOrders[tech] = (techOrders[tech] || 0) + 1;
          });
        }
      });
      return techOrders;
    };

    const countByStatus = (orders) => {
      const out = {};
      orders.forEach(wo => {
        const status = normalizeStatus(wo.status);
        if (!status.toLowerCase().includes("closed")) {
          out[status] = (out[status] || 0) + 1;
        }
      });
      return out;
    };

    const activeWorkOrdersCount = filteredOrders.filter(wo => !isWorkOrderClosed(wo)).length;

    const countByShop = (orders) => {
      const out = {};
      orders.forEach(wo => {
        if (!isWorkOrderClosed(wo)) {
          out[wo.shop] = (out[wo.shop] || 0) + 1;
        }
      });
      return out;
    };

    const countAllOrdersByTechnician = (orders) => {
      const techCounts = {};
      orders.forEach(wo => {
        const techs = getTechniciansFromTimeLogs(wo.timeLogs);
        techs.forEach(tech => {
          techCounts[tech] = (techCounts[tech] || 0) + 1;
        });
      });
      return techCounts;
    };

    return {
      filteredOrders,
      slowMoversFiltered,
      waitingOnPartsFiltered,
      kpiData: {
        totalOrders: filteredOrders.length,
        activeWorkOrdersCount,
        closedOrdersCount,
        waitingPartOrdersCount,
        slowMoversCount: slowMoversFiltered.length,
        ordersThisYearCount,
        ordersThisMonthCount,
        avgDaysToCloseFiltered,
        avgDaysToCustomerInvoiced
      },
      chartData: {
        techCountsFiltered: countByTechnician(filteredOrders),
        activeStatusCounts: countByStatus(filteredOrders),
        shopCounts: countByShop(filteredOrders),
        allTimeTechCounts: countAllOrdersByTechnician(orders),
        avgWorkingDaysTrend,
        avgDaysToCloseTrend
      }
    };
  }, [data, shopFilter]);

  // Loading and error states
  if (loading) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: '18px'
      }}>
        Loading analytics...
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

  if (!data) {
    return (
      <div style={{ 
        padding: 30, 
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center'
      }}>
        No data available
      </div>
    );
  }

  return (
    <div>
      <Header onLogout={() => window.location.href = '/login'} onRefresh={handleRefresh} />
      
      <LocationFilter 
        shopFilter={shopFilter}
        setShopFilter={setShopFilter}
        onSetDefault={setDefaultShopFilter}
      />

      <KPISection kpiData={kpiData} />

      <div style={{ display: "flex", gap: 36, marginLeft: 0, marginRight: 0 }}>
        {/* Left Column - Charts */}
        <div style={{ flex: 1 }}>
          <ChartsSection chartData={chartData} filteredOrders={filteredOrders} />
        </div>

        {/* Right Column - Tables */}
        <div style={{ flex: 1, maxWidth: 800, marginRight: 30 }}>
          <TablesSection 
            slowMoversFiltered={slowMoversFiltered}
            waitingOnPartsFiltered={waitingOnPartsFiltered}
            onNavigateToWorkOrder={(workOrderNo) => navigate(`/dashboard/workorder/${workOrderNo}`)}
          />
        </div>
      </div>
    </div>
  );
}

// Sub-components
const Header = ({ onLogout, onRefresh }) => (
  <div style={{ 
    display: 'flex', 
    alignItems: 'flex-start', 
    justifyContent: 'space-between', 
    marginBottom: 8, 
    fontFamily: 'Arial, sans-serif' 
  }}>
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'flex-start', 
      marginLeft: 30, 
      fontFamily: 'Arial, sans-serif' 
    }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: 10 }}>
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
            cursor: 'pointer'
          }}
          aria-label="Log out"
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
            cursor: 'pointer'
          }}
          aria-label="Refresh dashboard data"
        >
          Refresh
        </button>
      </div>
      <h1 style={{ margin: 0 }}>Analytics Dashboard</h1>
    </div>
    <img src={GLLSLogo} alt="Company Logo" style={{ height: 100, marginRight: 0 }} />
  </div>
);

const LocationFilter = ({ shopFilter, setShopFilter, onSetDefault }) => (
  <div style={{ 
    marginBottom: 28, 
    display: "flex", 
    alignItems: "center", 
    gap: 16, 
    fontFamily: 'Arial, sans-serif',
    marginLeft: 30
  }}>
    <label style={{ fontWeight: 700, fontSize: 18, marginRight: 12,}}>
      Location Filter:
    </label>
    <select
      value={shopFilter}
      onChange={e => setShopFilter(e.target.value)}
      style={{ fontSize: 18, padding: "6px 16px", borderRadius: 8, minWidth: 170, backgroundColor: "#f4f3f2"}}
      aria-label="Select shop filter"
    >
      {SHOP_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    <button
      style={{
        marginLeft: 8,
        padding: "6px 16px",
        borderRadius: 8,
        background: "#e5e7eb",
        color: "#334155",
        fontWeight: 600,
        border: "1px solid #cbd5e1",
        cursor: "pointer"
      }}
      onClick={() => {
        onSetDefault(shopFilter);
        alert(`Default location set to "${shopFilter}"!`);
      }}
      type="button"
      aria-label={`Set ${shopFilter} as default location`}
    >
      Set as Default
    </button>
  </div>
);

const KPISection = ({ kpiData }) => (
  <div style={{ 
    display: "flex", 
    gap: 30, 
    marginBottom: 24, 
    marginLeft: 30,
    flexWrap: "wrap", 
    fontFamily: 'Arial, sans-serif'
  }}>
    <KPI label="Total Work Orders" value={kpiData.totalOrders}/>
    <KPI label="Active Work Orders" value={kpiData.activeWorkOrdersCount} />
    <KPI 
      label="Waiting on Part" 
      value={kpiData.waitingPartOrdersCount} 
      styleOverride={
        kpiData.waitingPartOrdersCount > 0
          ? {
              background: "#fef9c3",
              color: "#a16207",
              border: "2px solid #facc15"
            } 
          : {}
      }
    />
    <KPI
      label="Slow Movers (>10d)"
      value={kpiData.slowMoversCount}
      styleOverride={
        kpiData.slowMoversCount > 0
          ? {
              background: "#fee2e2",
              color: "#b91c1c",
              border: "2px solid #ef4444"
            }
          : {}
      }
    />
    <KPI label="Orders This Year" value={kpiData.ordersThisYearCount} />
    <KPI label="Orders This Month" value={kpiData.ordersThisMonthCount} />
    <KPI 
      label="Avg working days" 
      value={kpiData.avgDaysToCustomerInvoiced || "N/A"} 
      styleOverride={{ minWidth: 100 }}
    />
    <KPI 
      label="Avg Days to Close" 
      value={kpiData.avgDaysToCloseFiltered || "N/A"} 
    />
  </div>
);

const ChartsSection = ({ chartData, filteredOrders }) => (
  <>
    {/* Charts Row */}
    <div style={{ 
      display: "flex", 
      gap: 36, 
      marginLeft: 30,
      flexWrap: "wrap", 
      fontFamily: 'Arial, sans-serif' 
    }}>
      <ChartCard title="Active Work Orders by Shop">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={Object.entries(chartData.shopCounts).map(([shop, count]) => ({ shop, count }))}>
            <XAxis dataKey="shop" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Active Work Orders by Status">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={Object.entries(chartData.activeStatusCounts).map(([status, count]) => ({ name: status, value: count }))}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label
            >
              {Object.entries(chartData.activeStatusCounts).map(([status], idx) => (
                <Cell key={idx} fill={getStatusColor(status)} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>

    {/* Trends and More */}
    <div style={{ 
      display: "flex", 
      gap: 36, 
      flexWrap: "wrap", 
      marginTop: 36, 
      marginLeft: 30,
      fontFamily: 'Arial, sans-serif' 
    }}>
      <ChartCard title="New Work Orders per Month">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={getOrdersByMonth(filteredOrders)}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Top 5 Most Used Parts">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={getTopParts(filteredOrders)}>
            <XAxis dataKey="partNumber" />
            <YAxis />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div style={{
                      background: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      padding: '8px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                      <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>
                        Part: {data.partNumber}
                      </p>
                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
                        {data.description || 'No description available'}
                      </p>
                      <p style={{ margin: '0', fontWeight: 'bold', color: '#10b981' }}>
                        Count: {data.count}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Avg Working Days (Weekly)">
        {chartData.avgWorkingDaysTrend?.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData.avgWorkingDaysTrend}>
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip formatter={(value) => [`${value} days`, 'Avg Working Days']} />
              <Line type="monotone" dataKey="avgWorkingDays" stroke="#34d399" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: 16, color: '#94a3b8' }}>Not enough data yet.</div>
        )}
      </ChartCard>

      <ChartCard title="Avg Days to Close (Weekly)">
        {chartData.avgDaysToCloseTrend?.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData.avgDaysToCloseTrend}>
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip formatter={(value) => [`${value} days`, 'Avg Days to Close']} />
              <Line type="monotone" dataKey="avgDaysToClose" stroke="#f97316" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: 16, color: '#94a3b8' }}>Not enough data yet.</div>
        )}
      </ChartCard>
    </div>

    {/* Technician Workloads + Leaderboard */}
    <div style={{ 
      marginTop: 36, 
      marginLeft: 30,
      display: 'flex', 
      gap: 36, 
      flexWrap: 'wrap', 
      fontFamily: 'Arial, sans-serif' 
    }}>
      <ChartCard title="Active Work Orders by Technician" >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={Object.entries(chartData.techCountsFiltered).map(([tech, count]) => ({ tech, count }))}>
            <XAxis dataKey="tech" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#facc15" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Technician Leaderboard (All-Time)">
        <div style={{ padding: '0 12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>Technician</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Work Orders (All-Time)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(chartData.allTimeTechCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([tech, count]) => (
                  <tr key={tech}>
                    <td style={{ padding: 8 }}>{tech}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{count}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  </>
);

const TablesSection = ({ slowMoversFiltered, waitingOnPartsFiltered, onNavigateToWorkOrder }) => (
  <div style={{ marginTop: 0, marginLeft: 0, maxWidth: 800, fontFamily: 'Arial, sans-serif', backgroundColor: "#fff", padding: 30, borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.50)", }}>
    <WaitingPartsTable 
      waitingOnPartsFiltered={waitingOnPartsFiltered}
      onNavigateToWorkOrder={onNavigateToWorkOrder}
    />
    
    <SlowMoversTable 
      slowMoversFiltered={slowMoversFiltered} 
      onNavigateToWorkOrder={onNavigateToWorkOrder}
    />
    
    <WaitingOnPartsTable 
      waitingOnPartsFiltered={waitingOnPartsFiltered}
      onNavigateToWorkOrder={onNavigateToWorkOrder}
    />
  </div>
);

const SlowMoversTable = ({ slowMoversFiltered, onNavigateToWorkOrder }) => (
  <>
    <h2 style={{ 
      fontSize: 22, 
      marginBottom: 8, 
      borderBottom: '3px solid #2563eb', 
      paddingBottom: 4 
    }}>
      Slow Movers: Work Orders Open &gt; 10 Days
    </h2>
    <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
      <thead>
        <tr style={{ background: "#e5e7eb" }}>
          <th style={{ textAlign: "left", padding: 8 }}>Order #</th>
          <th style={{ textAlign: "left", padding: 8 }}>Status</th>
          <th style={{ textAlign: "left", padding: 8 }}>Created At</th>
          <th style={{ textAlign: "left", padding: 8 }}>Technician</th>
          <th style={{ textAlign: "left", padding: 8 }}>Actions</th>
        </tr>
      </thead>
      <tbody style={{fontFamily: 'Arial, sans-serif'}}>
        {slowMoversFiltered.length === 0 ? (
          <tr>
            <td colSpan={5} style={{ padding: 8, textAlign: "center", color: "#aaa" }}>
              No slow movers!
            </td>
          </tr>
        ) : (
          slowMoversFiltered.map(wo => {
            const tech = wo.timeLogs?.[0]?.technician_assigned || '';
            return (
              <tr key={wo.work_order_no}>
                <td style={{ padding: 8, fontFamily: 'Arial, sans-serif' }}>{wo.work_order_no}</td>
                <td style={{ padding: 8, fontFamily: 'Arial, sans-serif' }}>
                  <StatusBadge status={wo.status} />
                </td>
                <td style={{ padding: 8, fontFamily: 'Arial, sans-serif'}}>
                  {wo.created_at ? new Date(wo.created_at).toLocaleDateString() : ''}
                </td>
                <td style={{ padding: 8 }}>{tech}</td>
                <td style={{ padding: 8 }}>
                  <button
                    onClick={() => onNavigateToWorkOrder(wo.work_order_no)}
                    style={{
                      background: "#64748b",
                      color: "white",
                      padding: "4px 10px",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer"
                    }}
                    aria-label={`View work order ${wo.work_order_no}`}
                  >
                    View / Edit
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </>
);

const WaitingOnPartsTable = ({ waitingOnPartsFiltered, onNavigateToWorkOrder }) => (
  <div style={{ marginTop: 48, maxWidth: 800 }}>
    <h2 style={{ 
      fontSize: 22, 
      marginBottom: 8, 
      borderBottom: '3px solid #2563eb', 
      paddingBottom: 4 
    }}>
      Work Orders Waiting on Parts
    </h2>
    <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
      <thead>
        <tr style={{ background: "#e5e7eb" }}>
          <th style={{ textAlign: "left", padding: 8 }}>Order #</th>
          <th style={{ textAlign: "left", padding: 8 }}>Status</th>
          <th style={{ textAlign: "left", padding: 8 }}>Created At</th>
          <th style={{ textAlign: "left", padding: 8 }}>Technician</th>
          <th style={{ textAlign: "left", padding: 8 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {waitingOnPartsFiltered.length === 0 ? (
          <tr>
            <td colSpan={5} style={{ padding: 8, textAlign: "center", color: "#aaa" }}>
              No work orders waiting on parts!
            </td>
          </tr>
        ) : (
          waitingOnPartsFiltered.map(wo => {
            const tech = wo.timeLogs?.[0]?.technician_assigned || '';
            return (
              <tr key={wo.work_order_no}>
                <td style={{ padding: 8 }}>{wo.work_order_no}</td>
                <td style={{ padding: 8 }}>
                  <StatusBadge status={wo.status} />
                </td>
                <td style={{ padding: 8 }}>
                  {wo.created_at ? new Date(wo.created_at).toLocaleDateString() : ""}
                </td>
                <td style={{ padding: 8 }}>{tech}</td>
                <td style={{ padding: 8 }}>
                  <button
                    onClick={() => onNavigateToWorkOrder(wo.work_order_no)}
                    style={{
                      background: "#64748b",
                      color: "white",
                      padding: "4px 10px",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer"
                    }}
                    aria-label={`View work order ${wo.work_order_no}`}
                  >
                    View / Edit
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
);



const WaitingPartsTable = ({ waitingOnPartsFiltered, onNavigateToWorkOrder }) => {
  // Flatten all waiting parts from all work orders
  const allWaitingParts = [];
  waitingOnPartsFiltered.forEach(wo => {
    if (Array.isArray(wo.parts)) {
      wo.parts.forEach(part => {
        if (part.waiting) {
          allWaitingParts.push({
            workOrderNo: wo.work_order_no,
            partNumber: part.partNumber || part.part_number || '',
            description: part.description || 'No description',
            quantity: part.quantity || 1,
            waitingDays: part.waiting_days || part.waitingDays || 0
          });
        }
      });
    }
  });

  // Sort by days waiting (most recent first)
  allWaitingParts.sort((a, b) => {
    const daysA = Number(a.waitingDays) || 0;
    const daysB = Number(b.waitingDays) || 0;
    return daysB - daysA;
  });

  return (
    <div>
      <h2 style={{ 
        fontSize: 22, 
        marginBottom: 8, 
        marginTop: 0,
        borderBottom: '3px solid #2563eb', 
        paddingBottom: 4 
      }}>
        Parts Marked "Waiting on Part"
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
        <thead>
          <tr style={{ background: "#e5e7eb" }}>
            <th style={{ textAlign: "left", padding: 8 }}>Work Order #</th>
            <th style={{ textAlign: "left", padding: 8 }}>Part Number</th>
            <th style={{ textAlign: "left", padding: 8 }}>Description</th>
            <th style={{ textAlign: "left", padding: 8 }}>Quantity</th>
            <th style={{ textAlign: "center", padding: 8 }}>Days Waiting</th>
            <th style={{ textAlign: "left", padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {allWaitingParts.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: 8, textAlign: "center", color: "#aaa" }}>
                No parts currently waiting on!
              </td>
            </tr>
          ) : (
            allWaitingParts.map((part, index) => {
              const daysWaiting = Number(part.waitingDays) || 0;
              
              return (
                <tr key={`${part.workOrderNo}-${part.partNumber}-${index}`}>
                  <td style={{ padding: 8, fontWeight: 'bold' }}>{part.workOrderNo}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace' }}>{part.partNumber}</td>
                  <td style={{ padding: 8 }}>{part.description}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{part.quantity}</td>
                  <td style={{ 
                    padding: 8, 
                    textAlign: "center",
                    color: daysWaiting > 7 ? '#dc2626' : daysWaiting > 3 ? '#f59e0b' : '#10b981',
                    fontWeight: 'bold'
                  }}>
                    {daysWaiting.toFixed(0)}
                  </td>
                  <td style={{ padding: 8 }}>
                    <button
                      onClick={() => onNavigateToWorkOrder(part.workOrderNo)}
                      style={{
                        background: "#64748b",
                        color: "white",
                        padding: "4px 10px",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer"
                      }}
                      aria-label={`View work order ${part.workOrderNo}`}
                    >
                      View / Edit
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};


const StatusBadge = ({ status }) => (
  <span style={{
    display: 'inline-block',
    padding: '4px 10px',
    background: getStatusColor(status),
    color: '#fff',
    borderRadius: '12px',
    fontFamily: 'Arial, sans-serif',
    fontWeight: 600,
    fontSize: '13px'
  }}>
    {status}
  </span>
);

// Your existing chart helpers below (no change needed!)
function getOrdersByMonth(orders) {
  const byMonth = {};
  orders.forEach(wo => {
    if (wo.date && /^\d{4}-\d{2}/.test(wo.date)) {
      const ym = wo.date.slice(0, 7); // yyyy-mm
      byMonth[ym] = (byMonth[ym] || 0) + 1;
    }
  });
  return Object.entries(byMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));
}

function getTopParts(orders) {
  const partUse = {};
  orders.forEach(wo => {
    if (Array.isArray(wo.parts)) {
      wo.parts.forEach(part => {
        const partNum = (part.part_number || '').trim();
        const desc = (part.description || '').trim();
        const quantity = parseInt(part.quantity) || 1; // Default to 1 if quantity is not available

        if (partNum) {
          if (!partUse[partNum]) partUse[partNum] = { count: 0, description: desc };
          partUse[partNum].count += quantity; // Add the actual quantity instead of just 1
        }
      });
    }
  });
  return Object.entries(partUse)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([partNumber, data]) => ({
      partNumber,
      description: data.description,
      count: data.count,
    }));
}

function KPI({ label, value, styleOverride = {} }) {
  const renderValue = () => {
    const valueStr = (value ?? "").toString();
    return valueStr.split("").map((char, idx) => {
      const style = { margin: "0 1px", verticalAlign: "middle" };

      if (label === "Total Work Orders" && char === "5") {
        return (
          <img
            key={idx}
            src="/sb5.svg"
            alt="5"
            style={{ height: 50, objectFit: "contain", ...style }}
          />
        );
      }

      return (
        <span key={idx} style={{ fontSize: 40, ...style }}>
          {char}
        </span>
      );
    });
  };

  return (
    <div className="kpi-hover" style={{
      background: "#f8fafc",
      borderRadius: 12,
      padding: "18px 30px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.50)",
      fontWeight: 700,
      minWidth: 140,
      textAlign: "center",
      fontSize: 22,
      ...styleOverride
    }}>
      <div style={{
        fontSize: 17,
        fontWeight: 500,
        color: styleOverride.color || "#64748b",
        marginBottom: 7
      }}>{label}</div>
      <div style={{
        fontSize: 32,
        color: styleOverride.color || "#2563eb",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 2
      }}>
        {renderValue()}
      </div>
    </div>
  );
}

function ChartCard({ title, children, style = {} }) {
  return (
    <div className="card-style" style={{
      background: "#fff",
      borderRadius: 16,
      padding: 16,
      width: 440,
      minWidth: 320,
      maxWidth: "100%",
      marginBottom: 12,
      ...style
    }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}
