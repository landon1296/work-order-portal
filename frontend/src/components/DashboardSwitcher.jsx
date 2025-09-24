// src/components/DashboardSwitcher.jsx
import React, { useState } from "react";
import ManagerDashboard from "./ManagerDashboard";
import AccountingDashboard from "./AccountingDashboard";
import AnalyticsDashboard from "./AnalyticsDashboard";
import AllTechDashboard from "./AllTechDashboard";
import ReceptionDashboard from "./ReceptionDashboard";
import SchedulerDashboard from "./SchedulerDashboard";
import CallLogDashboard from "./CallLogDashboard";

export default function DashboardSwitcher({ user }) {
  const [selected, setSelected] = useState("analytics");

  // What dashboards can your boss see?
    const dashboards = [
        { key: "analytics", name: "Analytics", component: <AnalyticsDashboard user={user} /> },
        { key: "manager", name: "Manager", component: <ManagerDashboard user={user} /> },
        { key: "accounting", name: "Accounting", component: <AccountingDashboard user={user} /> },
        { key: "reception", name: "Reception", component: <ReceptionDashboard user={user} /> },
        { key: "tech", name: "Tech", component: <AllTechDashboard user={user} /> },
        { key: "scheduler", name: "Scheduler", component: <SchedulerDashboard user={user} /> },
        { key: "calllog", name: "Call Log / Follow-up", component: <CallLogDashboard user={user} /> },
        
      ];



  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, marginTop: 20, marginLeft: 30}}>
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
