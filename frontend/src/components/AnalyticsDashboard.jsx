import React, { useEffect, useState } from "react";
import API from "../api";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line
} from "recharts";

const COLORS = ["#2563eb", "#facc15", "#10b981", "#ef4444", "#818cf8", "#f472b6", "#fb923c"];

const SHOP_OPTIONS = [
  { value: 'All Shops', label: 'All Shops' },
  { value: 'Texas Shop', label: 'Texas Shop' },
  { value: 'Florida Shop', label: 'Florida Shop' },
  { value: 'Peotone Shop', label: 'Peotone Shop' }
];

export default function AnalyticsDashboard({ user }) {
  const [data, setData] = useState(null);
  const [shopFilter, setShopFilter] = useState(() => localStorage.getItem('defaultShopFilter') || 'All Shops');

  useEffect(() => {
    if (!user?.token) return;
    API.get("/api/analytics/summary", {
      headers: { Authorization: `Bearer ${user.token}` }
    }).then(res => setData(res.data));
  }, [user]);

  // Optional: re-apply default on load (good for SPA reloads)
  useEffect(() => {
    const defaultShop = localStorage.getItem('defaultShopFilter');
    if (defaultShop) setShopFilter(defaultShop);
  }, []);

  if (!data) return <div style={{ padding: 30 }}>Loading analytics...</div>;

  // This will be filled with backend work orders in next step
  const orders = data.allWorkOrders || [];
  const filteredOrders = shopFilter === 'All Shops'
    ? orders
    : orders.filter(wo => wo.shop === shopFilter);

  // 💡 PASTE HERE: KPI calculations for filteredOrders
  const closedOrdersCount = filteredOrders.filter(wo =>
    wo.status && wo.status.toLowerCase().includes('closed')
  ).length;

  const waitingPartOrdersCount = filteredOrders.filter(wo =>
    wo.status && (
      wo.status.toLowerCase().includes('pending parts') ||
      wo.status.toLowerCase().includes('waiting on part') ||
      wo.status.toLowerCase().includes('pending part') ||
      wo.status.toLowerCase().includes('awaiting part')
    )
  ).length;

  // Orders This Year/Month
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = (now.getMonth() + 1).toString().padStart(2, '0');

  const ordersThisYearCount = filteredOrders.filter(wo =>
    wo.date && wo.date.startsWith(thisYear.toString())
  ).length;

  const ordersThisMonthCount = filteredOrders.filter(wo =>
    wo.date && wo.date.startsWith(`${thisYear}-${thisMonth}`)
  ).length;

  // Avg Days to Close (filtered)
  let avgDaysToCloseFiltered = null;
  const closedFiltered = filteredOrders.filter(
    wo => wo.closedDays && wo.status && wo.status.toLowerCase().includes('closed')
  );
  if (closedFiltered.length > 0) {
    const totalClosedDays = closedFiltered.reduce((sum, wo) => sum + parseFloat(wo.closedDays || 0), 0);
    avgDaysToCloseFiltered = (totalClosedDays / closedFiltered.length).toFixed(1);
  }

  // 💡 PASTE HERE: Technician workload filtered by shop
  function countByTechnician(orders) {
    const out = {};
    orders.forEach(wo => {
      if (Array.isArray(wo.timeLogs)) {
        wo.timeLogs.forEach(log => {
          if (log.technicianAssigned) {
            out[log.technicianAssigned] = (out[log.technicianAssigned] || 0) + 1;
          }
        });
      }
    });
    return out;
  }
  const techCountsFiltered = countByTechnician(filteredOrders);

  // 💡 Your existing chart helpers are below, no change needed!
  function countByStatus(orders) {
    const out = {};
    orders.forEach(wo => {
      if (wo.status && (!wo.status.toLowerCase().includes('closed'))) {
        out[wo.status] = (out[wo.status] || 0) + 1;
      }
    });
    return out;
  }
  const activeStatusCounts = countByStatus(filteredOrders);

  function countByShop(orders) {
    const out = {};
    orders.forEach(wo => {
      out[wo.shop] = (out[wo.shop] || 0) + 1;
    });
    return out;
  }
  const shopCounts = countByShop(filteredOrders);

  // -- return section starts here! --
  return (
    <div style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 18 }}>Analytics Dashboard</h1>

      {/* Location Filter */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 16 }}>
        <label style={{ fontWeight: 700, fontSize: 18, marginRight: 12 }}>Location Filter:</label>
        <select
          value={shopFilter}
          onChange={e => setShopFilter(e.target.value)}
          style={{ fontSize: 18, padding: "6px 16px", borderRadius: 8, minWidth: 170 }}
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
            localStorage.setItem('defaultShopFilter', shopFilter);
            alert(`Default location set to "${shopFilter}"!`);
          }}
          type="button"
        >
          Set as Default
        </button>
      </div>

      {/* KPIs -- ALL filtered! */}
      <div style={{ display: "flex", gap: 30, marginBottom: 24, flexWrap: "wrap" }}>
        <KPI label="Total Work Orders" value={filteredOrders.length} />
        <KPI label="Closed Work Orders" value={closedOrdersCount} />
        <KPI label="Waiting on Part" value={waitingPartOrdersCount} />
        <KPI label="Orders This Year" value={ordersThisYearCount} />
        <KPI label="Orders This Month" value={ordersThisMonthCount} />
        <KPI label="Avg Days to Close" value={avgDaysToCloseFiltered ?? data.avgDaysToClose} />
      </div>

      {/* Charts Row */}
      <div style={{ display: "flex", gap: 36, flexWrap: "wrap" }}>
        {/* Shop Bar Chart */}
        <ChartCard title="Work Orders by Shop">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={Object.entries(shopCounts).map(([shop, count]) => ({ shop, count }))}>
              <XAxis dataKey="shop" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Status Pie Chart */}
        <ChartCard title="Active Work Orders by Status">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={Object.entries(activeStatusCounts).map(([status, count]) => ({ name: status, value: count }))}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {Object.entries(activeStatusCounts).map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Trends and More */}
      <div style={{ display: "flex", gap: 36, flexWrap: "wrap", marginTop: 36 }}>
        {/* Orders by Month */}
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

        {/* Top Parts */}
        <ChartCard title="Top 5 Most Used Parts">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={getTopParts(filteredOrders)}>
              <XAxis dataKey="partNumber" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Technician Workloads */}
      <div style={{ marginTop: 36 }}>
        <ChartCard title="Work Orders by Technician">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={Object.entries(techCountsFiltered).map(([tech, count]) => ({ tech, count }))}>
              <XAxis dataKey="tech" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#facc15" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Slow Movers */}
      <div style={{ marginTop: 48, maxWidth: 800 }}>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>Slow Movers: Work Orders Open &gt; 10 Days</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
          <thead>
            <tr style={{ background: "#e5e7eb" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Order #</th>
              <th style={{ textAlign: "left", padding: 8 }}>Status</th>
              <th style={{ textAlign: "left", padding: 8 }}>Created At</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.filter(wo => {
              const status = (wo.status || '').toLowerCase();
              if (status.includes('closed')) return false;
              if (!wo.createdAt) return false;
              const daysOpen = (now - new Date(wo.createdAt)) / (1000 * 60 * 60 * 24);
              return daysOpen > 10;
            }).length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 8, textAlign: "center", color: "#aaa" }}>No slow movers!</td>
              </tr>
            )}
            {filteredOrders.filter(wo => {
              const status = (wo.status || '').toLowerCase();
              if (status.includes('closed')) return false;
              if (!wo.createdAt) return false;
              const daysOpen = (now - new Date(wo.createdAt)) / (1000 * 60 * 60 * 24);
              return daysOpen > 10;
            }).map(wo => (
              <tr key={wo.workOrderNo}>
                <td style={{ padding: 8 }}>{wo.workOrderNo}</td>
                <td style={{ padding: 8 }}>{wo.status}</td>
                <td style={{ padding: 8 }}>{wo.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
        const partNum = (part.partNumber || '').trim();
        const desc = (part.description || '').trim();
        if (partNum) {
          if (!partUse[partNum]) partUse[partNum] = { count: 0, description: desc };
          partUse[partNum].count += 1;
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

function KPI({ label, value }) {
  return (
    <div style={{
      background: "#f8fafc",
      borderRadius: 12,
      padding: "18px 30px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      fontWeight: 700,
      minWidth: 140,
      textAlign: "center",
      fontSize: 22
    }}>
      <div style={{ fontSize: 17, fontWeight: 500, color: "#64748b", marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 32, color: "#2563eb" }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      padding: 16,
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      width: 440,
      minWidth: 320,
      maxWidth: "100%",
      marginBottom: 12
    }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}
