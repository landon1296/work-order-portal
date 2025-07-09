import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginForm from './components/LoginForm';
import ManagerDashboard from './components/ManagerDashboard';
import AssignWorkOrderForm from './components/AssignWorkOrderForm';
import TechDashboard from './components/TechDashboard';
import TechWorkOrderForm from './components/TechWorkOrderForm';
import AccountingDashboard from './components/AccountingDashboard';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import DashboardSwitcher from "./components/DashboardSwitcher";



// A "guard" to require auth
function RequireAuth({ user, children }) {
  const location = useLocation();
  if (!user) {
    // Redirect to login, but preserve where we tried to go
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

        {/* Default route: redirect based on role */}
        <Route path="/" element={
          user
            ? (user.role === 'manager'
                ? <Navigate to="/dashboard" replace />
                : user.role === 'accounting'
                  ? <Navigate to="/accounting-dashboard" replace />
                  : (user.role === 'analytics' || user.role === 'owner')
                    ? <Navigate to="/analytics" replace />
                    : <Navigate to="/tech-dashboard" replace />
              )
            : <Navigate to="/login" replace />
        } />



        {/* Manager Routes */}
        <Route path="/dashboard" element={
          <RequireAuth user={user}>
            {user?.role === 'manager' || user?.role === 'analytics' || user?.role === 'owner'
 ? <ManagerDashboard token={user.token} /> : <Navigate to="/" />}
          </RequireAuth>
        } />
        <Route path="/dashboard/workorder/:id" element={
          <RequireAuth user={user}>
            {(user?.role === 'manager' || user?.role === 'analytics' || user?.role === 'owner'
 || user?.role === 'accounting')
              ? <AssignWorkOrderForm token={user.token} editMode={true} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />
        <Route path="/assign" element={
          <RequireAuth user={user}>
            {user?.role === 'manager' || user?.role === 'analytics' || user?.role === 'owner'

              ? <AssignWorkOrderForm token={user.token} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        {/* Technician Routes */}
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
              ? <TechWorkOrderForm token={user.token} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />

        <Route path="/accounting-dashboard" element={
          <RequireAuth user={user}>
            {user?.role === 'accounting' || user?.role === 'analytics' || user?.role === 'owner'

              ? <AccountingDashboard token={user.token} />
              : <Navigate to="/" />
            }
          </RequireAuth>
        } />
          <Route path="/analytics" element={
            <RequireAuth user={user}>
              {/* NEW */}
              {user?.role === 'analytics' || user?.role === 'owner'
                ? <DashboardSwitcher user={user} />
                : <Navigate to="/" />
              }
            </RequireAuth>
          } />



        {/* Fallback: redirect unknown routes */}
        <Route path="*" element={
          user
            ? (user.role === 'manager'
                ? <Navigate to="/dashboard" replace />
                : user.role === 'accounting'
                  ? <Navigate to="/accounting-dashboard" replace />
                  : (user.role === 'analytics' || user.role === 'owner')
                    ? <Navigate to="/analytics" replace />
                    : <Navigate to="/tech-dashboard" replace />
              )
            : <Navigate to="/login" replace />
        } />


      </Routes>
    </Router>
  );
}

export default App;
