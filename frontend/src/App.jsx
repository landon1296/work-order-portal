import React, { useState, Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoadingSpinner from './components/LoadingSpinner';
import OfflineStatus from './components/OfflineStatus';
import ErrorBoundary from './components/ErrorBoundary';
import { register } from './utils/serviceWorker';
import './utils/debugCache'; // Load debug utilities
import './utils/swDiagnostics'; // Load service worker diagnostics
import './utils/swTest'; // Load service worker test utilities

// Lazy load all components for code splitting
const LoginForm = lazy(() => import('./components/LoginForm'));
const ManagerDashboard = lazy(() => import('./components/ManagerDashboard'));
const AssignWorkOrderForm = lazy(() => import('./components/AssignWorkOrderForm'));
const TechDashboard = lazy(() => import('./components/TechDashboard'));
const TechWorkOrderForm = lazy(() => import('./components/TechWorkOrderForm'));
const AccountingDashboard = lazy(() => import('./components/AccountingDashboard'));
const ReceptionDashboard = lazy(() => import('./components/ReceptionDashboard'));
const TroubleshootForm = lazy(() => import('./components/TroubleshootForm'));
const DashboardSwitcher = lazy(() => import('./components/DashboardSwitcher'));
const RoleSwitcher = lazy(() => import('./components/RoleSwitcher'));
const SalesDashboard = lazy(() => import('./components/SalesDashboard'));
const OfflineTest = lazy(() => import('./components/OfflineTest'));

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

  // Register service worker on app load
  useEffect(() => {
    register();
  }, []);

  return (
    <ErrorBoundary>
      <div className="App">
        <OfflineStatus />
        <Router>
          <LoginBackgroundWatcher />
          <Suspense fallback={<LoadingSpinner message="Loading dashboard..." />}>
            <Routes>
          {/* Login Route */}
          <Route path="/login" element={
            <Suspense fallback={<LoadingSpinner message="Loading login..." />}>
              <LoginForm onLogin={setUser} />
            </Suspense>
          } />

          {/* Default Route */}
          <Route path="/" element={
            user
              ? (
                hasRole(user, ['manager', 'accounting', 'analytics', 'owner'])
                  ? <Navigate to="/dashboard" replace />
                  : hasRole(user, 'reception')
                  ? <Navigate to="/reception-dashboard" replace />
                  : hasRole(user, 'sales')
                  ? <Navigate to="/sales-dashboard" replace />
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
              {hasRole(user, ['manager', 'analytics', 'owner', 'accounting', 'reception'])
                ? <Suspense fallback={<LoadingSpinner message="Loading work order form..." />}>
                    <AssignWorkOrderForm token={user.token} user={user} editMode={true} />
                  </Suspense>
                : <Navigate to="/" />
              }
            </RequireAuth>
          } />

          {/* Assign New Work Order (Managers, Analytics, Owner) */}
          <Route path="/assign" element={
            <RequireAuth user={user}>
              {hasRole(user, ['manager', 'analytics', 'owner'])
                ? <Suspense fallback={<LoadingSpinner message="Loading work order form..." />}>
                    <AssignWorkOrderForm token={user.token} user={user} />
                  </Suspense>
                : <Navigate to="/" />
              }
            </RequireAuth>
          } />

          {/* Troubleshoot Form (Reception, Analytics, Owner, Manager) */}
          <Route path="/troubleshoot" element={
            <RequireAuth user={user}>
              {hasRole(user, ['reception', 'analytics', 'owner', 'manager'])
                ? <Suspense fallback={<LoadingSpinner message="Loading troubleshoot form..." />}>
                    <TroubleshootForm token={user.token} user={user} />
                  </Suspense>
                : <Navigate to="/" />
              }
            </RequireAuth>
          } />

          {/* Edit Troubleshoot Form (Reception, Technicians, Analytics, Owner, Manager) */}
          <Route path="/troubleshoot/:id" element={
            <RequireAuth user={user}>
              {hasRole(user, ['reception', 'technician', 'analytics', 'owner', 'manager'])
                ? <Suspense fallback={<LoadingSpinner message="Loading troubleshoot form..." />}>
                    <TroubleshootForm token={user.token} user={user} editMode={true} />
                  </Suspense>
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
                    : <Suspense fallback={<LoadingSpinner message="Loading technician dashboard..." />}>
                        <TechDashboard username={user.username} user={user} />
                      </Suspense>
                  )
                : <Navigate to="/" />
              }
            </RequireAuth>
          } />
          <Route path="/tech-dashboard/workorder/:id" element={
            <RequireAuth user={user}>
              {hasRole(user, ['technician', 'tech'])
                ? <Suspense fallback={<LoadingSpinner message="Loading work order form..." />}>
                    <TechWorkOrderForm token={user.token} user={user} />
                  </Suspense>
                : <Navigate to="/" />
              }
            </RequireAuth>
          } />

          {/* Reception Dashboard */}
          <Route path="/reception-dashboard" element={
            <RequireAuth user={user}>
              {hasRole(user, ['reception', 'analytics', 'owner', 'manager'])
                ? <Suspense fallback={<LoadingSpinner message="Loading reception dashboard..." />}>
                    <ReceptionDashboard user={user} />
                  </Suspense>
                : <Navigate to="/" />
              }
            </RequireAuth>
          } />

          {/* Sales Dashboard */}
          <Route path="/sales-dashboard" element={
            <RequireAuth user={user}>
              {hasRole(user, ['sales', 'analytics', 'owner', 'manager'])
                ? (user?.roles && user.roles.length > 1
                    ? <RoleSwitcher user={user} />
                    : <Suspense fallback={<LoadingSpinner message="Loading sales dashboard..." />}>
                        <SalesDashboard user={user} />
                      </Suspense>
                  )
                : <Navigate to="/" />
              }
            </RequireAuth>
          } />

                   {/* Offline Test Page */}
                   <Route path="/offline-test" element={
                     <RequireAuth user={user}>
                       <Suspense fallback={<LoadingSpinner message="Loading offline test..." />}>
                         <OfflineTest />
                       </Suspense>
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
                  : user.role === 'sales'
                  ? <Navigate to="/sales-dashboard" replace />
                  : <Navigate to="/tech-dashboard" replace />
                )
              : <Navigate to="/login" replace />
          } />
            </Routes>
          </Suspense>
        </Router>
      </div>
    </ErrorBoundary>
  );
}

export default App;
