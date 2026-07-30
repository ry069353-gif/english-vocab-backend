/* ============================================
   Admin Panel Routes
   ============================================ */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { issueAdminToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

/**
 * POST /api/admin/login
 * Body: { username, password }
 * Returns admin session token
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Simple constant-time comparison
  const userMatch = username === ADMIN_USERNAME;
  const passMatch = password === ADMIN_PASSWORD;

  if (!userMatch || !passMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = issueAdminToken(username);
  res.json({ success: true, token, username });
});

/**
 * GET /api/admin/users
 * Returns all users (admin only)
 */
router.get('/users', requireAdmin, (req, res) => {
  db.all(
    `SELECT
       u.id, u.google_id, u.email, u.name, u.picture,
       u.joined_at, u.last_login, u.login_count, u.is_active,
       (SELECT COUNT(*) FROM login_history WHERE user_id = u.id) AS total_logins,
       (SELECT MAX(login_at) FROM login_history WHERE user_id = u.id) AS last_login_recorded
     FROM users u
     ORDER BY u.joined_at DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('DB error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true, count: rows.length, users: rows });
    }
  );
});

/**
 * GET /api/admin/users/:id
 * Returns single user with login history
 */
router.get('/users/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.all(
      'SELECT login_at, ip_address, user_agent FROM login_history WHERE user_id = ? ORDER BY login_at DESC LIMIT 50',
      [userId],
      (err, history) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ user, history });
      }
    );
  });
});

/**
 * GET /api/admin/stats
 * Returns overall statistics
 */
router.get('/stats', requireAdmin, (req, res) => {
  const queries = [
    { key: 'totalUsers', sql: 'SELECT COUNT(*) as count FROM users' },
    { key: 'activeUsers', sql: 'SELECT COUNT(*) as count FROM users WHERE is_active = 1' },
    { key: 'newUsersToday', sql: "SELECT COUNT(*) as count FROM users WHERE DATE(joined_at) = DATE('now')" },
    { key: 'newUsersWeek', sql: "SELECT COUNT(*) as count FROM users WHERE joined_at >= DATE('now', '-7 days')" },
    { key: 'totalLogins', sql: 'SELECT COUNT(*) as count FROM login_history' },
    { key: 'loginsToday', sql: "SELECT COUNT(*) as count FROM login_history WHERE DATE(login_at) = DATE('now')" },
    { key: 'topUsers', sql: 'SELECT name, email, login_count FROM users ORDER BY login_count DESC LIMIT 5' }
  ];

  const results = {};
  let pending = queries.length;

  queries.forEach(q => {
    db.all(q.sql, [], (err, rows) => {
      if (err) {
        results[q.key] = { error: err.message };
      } else {
        results[q.key] = q.key === 'topUsers' ? rows : (rows[0]?.count || 0);
      }
      pending--;
      if (pending === 0) {
        res.json({ success: true, stats: results });
      }
    });
  });
});

/**
 * DELETE /api/admin/users/:id
 * Deactivates a user (doesn't delete, for audit trail)
 */
router.delete('/users/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  db.run('UPDATE users SET is_active = 0 WHERE id = ?', [userId], function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User deactivated' });
  });
});

/**
 * POST /api/admin/users/:id/activate
 * Reactivates a user
 */
router.post('/users/:id/activate', requireAdmin, (req, res) => {
  const userId = req.params.id;
  db.run('UPDATE users SET is_active = 1 WHERE id = ?', [userId], function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User activated' });
  });
});

module.exports = router;
