/* ============================================
   English Vocab - Backend Server
   Google OAuth + User Database + Admin Panel
   ============================================ */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ====== MIDDLEWARE ======
app.use(helmet({
  contentSecurityPolicy: false, // We host the frontend separately
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: '*', // In production, restrict to your frontend domain
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// ====== ROUTES ======
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'English Vocab Backend',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// ====== FRONTEND (optional) ======
// If you want to serve the frontend from this same server, uncomment below
// and put the frontend files in ../ (one level up from backend/)
/*
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin.html'));
});
*/

// ====== ERROR HANDLER ======
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// ====== START ======
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  📚 English Vocab Backend');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  🚀 Server running on port ${PORT}`);
  console.log(`  🌐 Health:  http://localhost:${PORT}/api/health`);
  console.log(`  🔐 Auth:    http://localhost:${PORT}/api/auth/google`);
  console.log(`  👑 Admin:   http://localhost:${PORT}/api/admin/login`);
  console.log(`  🌍 Mode:    ${NODE_ENV}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
});
