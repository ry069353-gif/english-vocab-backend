/* ============================================
   Authentication Middleware
   ============================================ */

const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const JWT_EXPIRES_IN = '30d';

// Issue a session JWT for a user
function issueUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      google_id: user.google_id,
      email: user.email,
      name: user.name,
      type: 'user'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Issue an admin JWT
function issueAdminToken(username) {
  return jwt.sign(
    { sub: username, type: 'admin' },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// Verify user token middleware
function requireUser(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = auth.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'user') {
      return res.status(403).json({ error: 'Invalid token type' });
    }
    // Verify user still exists in DB
    db.get('SELECT * FROM users WHERE id = ?', [decoded.sub], (err, user) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!user) return res.status(401).json({ error: 'User not found' });
      req.user = user;
      next();
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Verify admin token middleware
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = auth.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = { username: decoded.sub };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  issueUserToken,
  issueAdminToken,
  requireUser,
  requireAdmin,
  JWT_SECRET
};
