// src/components/DashboardSwitcher.jsx
import React, { useState } from "react";
import ManagerDashboard from "./ManagerDashboard";
import AccountingDashboard from "./AccountingDashboard";
import AnalyticsDashboard from "./AnalyticsDashboard";

export default function DashboardSwitcher({ user }) {
  const [selected, setSelected] = useState("analytics");

  // What dashboards can your boss see?
    const dashboards = [
        { key: "analytics", name: "Analytics", component: <AnalyticsDashboard user={user} /> },
        { key: "manager", name: "Manager", component: <ManagerDashboard user={user} /> },
        { key: "accounting", name: "Accounting", component: <AccountingDashboard user={user} /> },
      ];



  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {dashboards.map(d => (
          <button
            key={d.key}
            style={{
              background: selected === d.key ? "#2563eb" : "#e5e7eb",
              color: selected === d.key ? "#fff" : "#222",
              padding: "10px 20px",
              border: "none",
              borderRadius: 6,
              fontWeight: "bold",
              cursor: "pointer"
            }}
            onClick={() => setSelected(d.key)}
          >
            {d.name}
          </button>
        ))}
      </div>
      <div>
        {dashboards.find(d => d.key === selected)?.component}
      </div>
    </div>
  );
}
