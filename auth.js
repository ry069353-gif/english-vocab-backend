/* ============================================
   Google OAuth Authentication Routes
   ============================================ */

const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const { issueUserToken } = require('../middleware/auth');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Rate limit for auth endpoints
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 min per IP
  message: { error: 'Too many login attempts, please try again later' }
});

router.use(authLimiter);

/**
 * POST /api/auth/google
 * Body: { credential: "<google_jwt>" }
 * Verifies Google JWT, creates/updates user, returns session token
 */
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'your-client-id-here.apps.googleusercontent.com') {
    return res.status(500).json({
      error: 'Server is not configured. Set GOOGLE_CLIENT_ID in .env file. See SETUP.md'
    });
  }

  try {
    // Verify the Google JWT
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    // Extract user info
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || email.split('@')[0];
    const picture = payload.picture || null;
    const emailVerified = payload.email_verified || false;

    if (!emailVerified) {
      return res.status(400).json({ error: 'Email not verified by Google' });
    }

    // Check if user exists
    db.get(
      'SELECT * FROM users WHERE google_id = ? OR email = ?',
      [googleId, email],
      (err, existingUser) => {
        if (err) {
          console.error('DB error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';

        if (existingUser) {
          // Update existing user
          db.run(
            `UPDATE users
             SET name = ?, picture = ?, last_login = CURRENT_TIMESTAMP, login_count = login_count + 1, is_active = 1
             WHERE id = ?`,
            [name, picture, existingUser.id],
            (err) => {
              if (err) {
                console.error('Update error:', err);
                return res.status(500).json({ error: 'Update failed' });
              }

              // Log login
              db.run(
                'INSERT INTO login_history (user_id, ip_address, user_agent) VALUES (?, ?, ?)',
                [existingUser.id, ip, userAgent]
              );

              // Get updated user
              db.get('SELECT * FROM users WHERE id = ?', [existingUser.id], (err, updatedUser) => {
                if (err) {
                  console.error('Fetch error:', err);
                  return res.status(500).json({ error: 'Fetch failed' });
                }
                const token = issueUserToken(updatedUser);
                res.json({
                  success: true,
                  isNewUser: false,
                  token,
                  user: {
                    id: updatedUser.id,
                    google_id: updatedUser.google_id,
                    email: updatedUser.email,
                    name: updatedUser.name,
                    picture: updatedUser.picture,
                    joined_at: updatedUser.joined_at,
                    login_count: updatedUser.login_count
                  }
                });
              });
            }
          );
        } else {
          // Create new user
          db.run(
            `INSERT INTO users (google_id, email, name, picture, last_login, login_count)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)`,
            [googleId, email, name, picture],
            function (err) {
              if (err) {
                console.error('Insert error:', err);
                return res.status(500).json({ error: 'Could not create user' });
              }

              const userId = this.lastID;

              // Log login
              db.run(
                'INSERT INTO login_history (user_id, ip_address, user_agent) VALUES (?, ?, ?)',
                [userId, ip, userAgent]
              );

              db.get('SELECT * FROM users WHERE id = ?', [userId], (err, newUser) => {
                if (err) {
                  console.error('Fetch error:', err);
                  return res.status(500).json({ error: 'Fetch failed' });
                }
                const token = issueUserToken(newUser);
                res.json({
                  success: true,
                  isNewUser: true,
                  token,
                  user: {
                    id: newUser.id,
                    google_id: newUser.google_id,
                    email: newUser.email,
                    name: newUser.name,
                    picture: newUser.picture,
                    joined_at: newUser.joined_at,
                    login_count: newUser.login_count
                  }
                });
              });
            }
          );
        }
      }
    );
  } catch (err) {
    console.error('Google verify error:', err);
    return res.status(401).json({ error: 'Invalid Google credential' });
  }
});

/**
 * GET /api/auth/me
 * Returns current user info
 */
router.get('/me', require('../middleware/auth').requireUser, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
