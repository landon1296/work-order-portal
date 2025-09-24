import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginForm from './components/LoginForm';
import ManagerDashboard from './components/ManagerDashboard';
import AssignWorkOrderForm from './components/AssignWorkOrderForm';
import TechDashboard from './components/TechDashboard';
import TechWorkOrderForm from './components/TechWorkOrderForm';
import AccountingDashboard from './components/AccountingDashboard';
import ReceptionDashboard from './components/ReceptionDashboard';
import TroubleshootForm from './components/TroubleshootForm';
import DashboardSwitcher from "./components/DashboardSwitcher";
import RoleSwitcher from "./components/RoleSwitcher";
import CallLogDashboard from './components/CallLogDashboard';
import { useEffect } from 'react';

// Utility function to check if user has specific role(s)
const hasRole = (user, roleOrRoles) => {
  if (!user) return false;
  
  const userRoles = user.roles || [user.role];
  if (Array.isArray(roleOrRoles)) {
    return roleOrRoles.some(role => userRoles.includes(role));
  }
  return userRoles.includes(roleOrRoles);
};

// 


// Guard for auth
function RequireAuth({ user, children }) {
  const location = useLocation();

  
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function LoginBackgroundWatcher() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/login') {
      document.body.classList.add('login-page');
    } else {
      document.body.classList.remove('login-page');
    }
  }, [location.pathname]);

  return null;
}

function App() {
  const [user, setUser] = useState(null);

  return (
    <div className="App">
      {/* <OfflineStatus /> */}
      <Router>
        <LoginBackgroundWatcher />
        <Routes>
        {/* Login Route */}
        <Route path="/login" element={<LoginForm onLogin={setUser} />} />

        {/* Default Route */}
        <Route path="/" element={
          user
            ? (
              hasRole(user, ['manager', 'accounting', 'analytics', 'owner'])
                ? <Navigate to="/dashboard" replace />
                : hasRole(user, 'reception')
                ? <Navigate to="/reception-dashboard" replace />
                : <Navigate to="/tech-dashboard" replace />
              )
            : <Navigate to="/login" replace />
        } />

        {/* Main Dashboard Route */}
        <Route path="/dashboard" element={
          <RequireAuth user={user}>
            {hasRole(user, ['manager', 'accounting', 'analytics', 'owner'])
              ? (user?.roles && user.roles.length > 1 
                  ? <RoleSwitcher user={user} />
                  : user?.role === 'manager'
                  ? <ManagerDashboard user={user} />
                  : user?.role === 'accounting'
                  ? <AccountingDashboard user={user} />
                  : (user?.role === 'analytics' || user?.role === 'owner')
                  ? <DashboardSwitcher user={user} />
                  : <Navigate to="/" />
                )
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Assign/Edit Work Order (Managers, Accounting, Analytics, Owner, Reception) */}
        <Route path="/dashboard/workorder/:id" element={
          <RequireAuth user={user}>
            {(user?.role === 'manager' ||
              user?.role === 'analytics' ||
              user?.role === 'owner' ||
              user?.role === 'accounting' ||
              user?.role === 'reception')
              ? <AssignWorkOrderForm token={user.token} user={user} editMode={true} />
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
              ? <AssignWorkOrderForm token={user.token} user={user} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Troubleshoot Form (Reception, Analytics, Owner) */}
        <Route path="/troubleshoot" element={
          <RequireAuth user={user}>
            {(user?.role === 'reception' || user?.role === 'analytics' || user?.role === 'owner')
              ? <TroubleshootForm token={user.token} user={user} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Edit Troubleshoot Form (Reception, Technicians, Analytics, Owner) */}
        <Route path="/troubleshoot/:id" element={
          <RequireAuth user={user}>
            {(user?.role === 'reception' || user?.role === 'technician' || user?.role === 'analytics' || user?.role === 'owner')
              ? <TroubleshootForm token={user.token} user={user} editMode={true} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Technician Dashboard */}
        <Route path="/tech-dashboard" element={
          <RequireAuth user={user}>
            {hasRole(user, ['technician', 'tech'])
              ? (user?.roles && user.roles.length > 1
                  ? <RoleSwitcher user={user} />
                  : <TechDashboard username={user.username} />
                )
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />
        <Route path="/tech-dashboard/workorder/:id" element={
          <RequireAuth user={user}>
            {hasRole(user, ['technician', 'tech'])
              ? <TechWorkOrderForm token={user.token} user= {user} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Reception Dashboard */}
        <Route path="/reception-dashboard" element={
          <RequireAuth user={user}>
            {user?.role === 'reception'
              ? <ReceptionDashboard user={user} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Call Log Dashboard */}
        <Route path="/call-log-dashboard" element={
          <RequireAuth user={user}>
            {hasRole(user, ['manager', 'accounting', 'analytics', 'owner', 'reception'])
              ? <CallLogDashboard user={user} />
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
                 : user.role === 'reception'
                 ? <Navigate to="/reception-dashboard" replace />
                 : <Navigate to="/tech-dashboard" replace />
               )
             : <Navigate to="/login" replace />
         } />
       </Routes>
     </Router>
   </div>
  );
}

export default App;
