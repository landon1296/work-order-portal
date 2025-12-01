const jwt = require('jsonwebtoken');

// General auth middleware - requires any valid token
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.replace(/^Bearer /, '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // attach user info
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Only allows users with 'analytics' or 'owner' role
function requireAnalyticsRole(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.replace(/^Bearer /, '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Support both single role (backward compatibility) and multiple roles
    const userRoles = decoded.roles || [decoded.role];
    const hasAnalyticsAccess = userRoles.includes('analytics') || userRoles.includes('owner');
    
    if (hasAnalyticsAccess) {
      req.user = decoded; // attach user info if needed
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: analytics role required' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Only allows users with 'sales', 'analytics', 'owner', or 'manager' role
function requireSalesRole(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.replace(/^Bearer /, '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Support both single role (backward compatibility) and multiple roles
    const userRoles = decoded.roles || [decoded.role];
    const hasSalesAccess = userRoles.includes('sales') || userRoles.includes('analytics') || userRoles.includes('owner') || userRoles.includes('manager');
    
    if (hasSalesAccess) {
      req.user = decoded; // attach user info if needed
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: sales role required' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { auth, requireAnalyticsRole, requireSalesRole };
