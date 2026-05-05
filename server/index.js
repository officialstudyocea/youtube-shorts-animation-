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
// Allow any localhost origin in dev so the proxy + direct calls both work
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman) and localhost
    if (!origin || origin.startsWith('http://localhost') || origin === clientUrl) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: origin ${origin} not allowed`));
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
    const clientDist = path.join(__dirname, '../client/dist');
    if (fs.existsSync(clientDist)) {
      console.log('🌐 Serving frontend from:', clientDist);
      app.use(express.static(clientDist));
      // Catch-all for React Router
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api') && !req.path.startsWith('/outputs')) {
          res.sendFile(path.join(clientDist, 'index.html'));
        }
      });
    } else {
      console.warn('⚠️  Frontend build not found at:', clientDist);
      console.warn('Run "npm run build" in the root directory to build the frontend.');
    }

    app.listen(PORT, () => {
      console.log(`🚀  Server  →  http://localhost:${PORT}`);
      console.log(`📡  API     →  http://localhost:${PORT}/api`);
      console.log(`💾  DB      →  ${global.__DB_DRIVER__ === 'mongoose' ? 'MongoDB' : 'In-Memory'}`);
    });
  });
