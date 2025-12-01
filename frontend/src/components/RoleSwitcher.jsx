// RoleSwitcher.jsx - For users with multiple roles
import React, { useState } from "react";
import ManagerDashboard from "./ManagerDashboard";
import TechDashboard from "./TechDashboard";
import AccountingDashboard from "./AccountingDashboard";
import AnalyticsDashboard from "./AnalyticsDashboard";
import AllTechDashboard from "./AllTechDashboard";
import ReceptionDashboard from "./ReceptionDashboard";
import SchedulerDashboard from "./SchedulerDashboard";
import SalesDashboard from "./SalesDashboard";
import DashboardSwitcher from "./DashboardSwitcher";

const RoleSwitcher = ({ user }) => {
  const userRoles = user.roles || [user.role];
  const primaryRole = user.primaryRole || user.role;
  const [selectedRole, setSelectedRole] = useState(primaryRole);

  // Map roles to their display names and component factories
  const roleConfig = {
    tech: {
      name: "Tech Dashboard",
      getComponent: () => <TechDashboard username={user.username} user={user} />
    },
    technician: {
      name: "Tech Dashboard",
      getComponent: () => <TechDashboard username={user.username} user={user} />
    },
    manager: {
      name: "Manager Dashboard", 
      getComponent: () => <ManagerDashboard user={user} />
    },
    accounting: {
      name: "Accounting Dashboard",
      getComponent: () => <AccountingDashboard user={user} />
    },
    analytics: {
      name: "Analytics Dashboard",
      getComponent: () => <AnalyticsDashboard user={user} />
    },
    owner: {
      name: "Owner Dashboard",
      getComponent: () => <DashboardSwitcher user={user} />
    },
    reception: {
      name: "Reception Dashboard",
      getComponent: () => <ReceptionDashboard user={user} />
    },
    sales: {
      name: "Sales Dashboard",
      getComponent: () => <SalesDashboard user={user} />
    }
  };

  // Filter available roles based on user's roles
  const availableRoles = userRoles.filter(role => roleConfig[role]);

  // If user only has one role, don't show the switcher
  if (availableRoles.length <= 1) {
    const singleRole = availableRoles[0];
    const config = roleConfig[singleRole];
    return config?.getComponent ? config.getComponent() : <div>No valid role found</div>;
  }

  const selectedConfig = roleConfig[selectedRole];

  return (
    <div>
      {/* Role Switcher Header */}
      <div style={{ 
        background: '#f8f9fa', 
        padding: '16px 24px', 
        borderBottom: '1px solid #dee2e6',
        marginBottom: '20px'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#495057' }}>
              Welcome, {user.username}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6c757d' }}>
              You have access to multiple dashboards
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            {availableRoles.map(role => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                style={{
                  background: selectedRole === role ? '#007bff' : '#ffffff',
                  color: selectedRole === role ? '#ffffff' : '#495057',
                  border: selectedRole === role ? '1px solid #007bff' : '1px solid #ced4da',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: selectedRole === role ? '600' : '400',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedRole === role ? '0 2px 4px rgba(0,123,255,0.25)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (selectedRole !== role) {
                    e.target.style.background = '#f8f9fa';
                    e.target.style.borderColor = '#adb5bd';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedRole !== role) {
                    e.target.style.background = '#ffffff';
                    e.target.style.borderColor = '#ced4da';
                  }
                }}
              >
                {roleConfig[role].name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Dashboard */}
      <div>
        {selectedConfig?.getComponent ? selectedConfig.getComponent() : <div>Dashboard not found</div>}
      </div>
    </div>
  );
};

export default RoleSwitcher;
