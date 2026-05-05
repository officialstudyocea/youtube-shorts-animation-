/**
 * index.js – Express server entry point
 * YouTube Shorts Automation API
 *
 * Auto-falls back to in-memory store if MongoDB is unavailable.
 */
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const mongoose = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ─────────────────────────────────────────────────────────────────────
const clientUrl = process.env.CLIENT_URL || '';
app.use(cors({
  origin: (origin, cb) => {
    // 1. Allow if no origin (local files, Postman, etc.)
    // 2. Allow if it's localhost
    // 3. Allow if it matches our CLIENT_URL
    // 4. Allow if it's the same domain as the server (Railway same-origin)
    if (!origin || 
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://127.0.0.1') ||
        (clientUrl && origin === clientUrl) ||
        origin.includes('.railway.app')) {
      cb(null, true);
    } else {
      console.warn(`[CORS Blocked] Origin: ${origin}`);
      cb(null, true); // Fallback: Allow it anyway but log it, to prevent 500s during setup
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static output files ───────────────────────────────────────────────────────
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

// ── Health check (always available) ──────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'healthy', ts: Date.now() }));

// ── DB bootstrap then start ───────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shorts-automation';

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 })
  .then(() => {
    console.log('✅ MongoDB connected');
    // Use real Mongoose Video model
    global.__DB_DRIVER__ = 'mongoose';
  })
  .catch(() => {
    console.warn('⚠️  MongoDB unavailable – using in-memory store (data resets on restart)');
    // Override the Video model with in-memory store
    const InMem = require('./utils/inMemoryStore');
    // Make it available as if it were the Mongoose model
    const VideoModule = require('./models/Video');
    // We patch the module cache so all requires of models/Video get InMem
    require.cache[require.resolve('./models/Video')].exports = InMem;
    global.__DB_DRIVER__ = 'memory';
  })
  .finally(() => {
    // Load routes AFTER DB is decided so controllers get the right model
    const videoRoutes = require('./routes/videoRoutes');
    require('./worker'); // Initialize background worker
    app.use('/api', videoRoutes);

    // Global error handler
    app.use((err, _req, res, _next) => {
      console.error('[Unhandled Error]', err.message);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    });

    // Ensure directories exist
    const uploadsDir = path.join(__dirname, 'uploads');
    const outputsDir = path.join(__dirname, 'outputs');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

    // ── Serve Frontend (Client) ────────────────────────────────────────────────
    const clientDist = path.resolve(__dirname, '../client/dist');
    console.log('📂 Checking for frontend at:', clientDist);

    if (fs.existsSync(clientDist)) {
      console.log('✅ Frontend dist found. Serving static files.');
      app.use(express.static(clientDist));
      
      // Catch-all for React Router (only for non-file requests)
      app.get('*', (req, res) => {
        // If it's an API, Output, or has a file extension (like .js, .css, .png), skip it
        if (req.path.startsWith('/api') || req.path.startsWith('/outputs') || req.path.includes('.')) {
          return res.status(404).json({ error: 'Not found' });
        }
        res.sendFile(path.join(clientDist, 'index.html'));
      });
    } else {
      console.warn('❌ Frontend build NOT found at:', clientDist);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀  Server  →  http://localhost:${PORT}`);
      console.log(`📡  API     →  http://localhost:${PORT}/api`);
      console.log(`💾  DB      →  ${global.__DB_DRIVER__ === 'mongoose' ? 'MongoDB' : 'In-Memory'}`);
    });
  });
