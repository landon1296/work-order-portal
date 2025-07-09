const jwt = require('jsonwebtoken');

// Only allows users with 'analytics' or 'owner' role
function requireAnalyticsRole(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.replace(/^Bearer /, '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role === 'analytics' || decoded.role === 'owner') {
      req.user = decoded; // attach user info if needed
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: analytics role required' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAnalyticsRole };
