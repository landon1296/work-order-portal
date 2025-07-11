import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginForm from './components/LoginForm';
import ManagerDashboard from './components/ManagerDashboard';
import AssignWorkOrderForm from './components/AssignWorkOrderForm';
import TechDashboard from './components/TechDashboard';
import TechWorkOrderForm from './components/TechWorkOrderForm';
import AccountingDashboard from './components/AccountingDashboard';
import DashboardSwitcher from "./components/DashboardSwitcher";
// 

// Guard for auth
function RequireAuth({ user, children }) {
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function App() {
  const [user, setUser] = useState(null);

  return (
    <Router>
      <Routes>
        {/* Login Route */}
        <Route path="/login" element={<LoginForm onLogin={setUser} />} />

        {/* Default Route */}
        <Route path="/" element={
          user
            ? (
              ['manager', 'accounting', 'analytics', 'owner'].includes(user.role)
                ? <Navigate to="/dashboard" replace />
                : <Navigate to="/tech-dashboard" replace />
              )
            : <Navigate to="/login" replace />
        } />

        {/* Main Dashboard Route */}
        <Route path="/dashboard" element={
          <RequireAuth user={user}>
            {user?.role === 'manager'
              ? <ManagerDashboard user={user} />
              : user?.role === 'accounting'
              ? <AccountingDashboard user={user} />
              : (user?.role === 'analytics' || user?.role === 'owner')
              ? <DashboardSwitcher user={user} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Assign/Edit Work Order (Managers, Accounting, Analytics, Owner) */}
        <Route path="/dashboard/workorder/:id" element={
          <RequireAuth user={user}>
            {(user?.role === 'manager' ||
              user?.role === 'analytics' ||
              user?.role === 'owner' ||
              user?.role === 'accounting')
              ? <AssignWorkOrderForm token={user.token} editMode={true} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Assign New Work Order (Managers, Analytics, Owner) */}
        <Route path="/assign" element={
          <RequireAuth user={user}>
            {user?.role === 'manager' ||
             user?.role === 'analytics' ||
             user?.role === 'owner'
              ? <AssignWorkOrderForm token={user.token} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Technician Dashboard */}
        <Route path="/tech-dashboard" element={
          <RequireAuth user={user}>
            {user?.role === 'technician'
              ? <TechDashboard username={user.username} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />
        <Route path="/tech-dashboard/workorder/:id" element={
          <RequireAuth user={user}>
            {user?.role === 'technician'
              ? <TechWorkOrderForm token={user.token} user= {user} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Fallback Route */}
        <Route path="*" element={
          user
            ? (
              ['manager', 'accounting', 'analytics', 'owner'].includes(user.role)
                ? <Navigate to="/dashboard" replace />
                : <Navigate to="/tech-dashboard" replace />
              )
            : <Navigate to="/login" replace />
        } />
      </Routes>
    </Router>
  );
}

export default App;
