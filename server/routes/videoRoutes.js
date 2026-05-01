/**
 * videoRoutes.js
 * All /api/* routes for video management.
 */
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const {
  uploadVideo,
  processVideoById,
  getVideoStatus,
  getVideoResult,
  getAllVideos,
  deleteVideo,
  downloadVideo,
} = require('../controllers/videoController');

const router = express.Router();

// ── Multer storage config ────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/avi', 'video/webm'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '1073741824', 10) },
});

// ── Routes ───────────────────────────────────────────────────────────────────
router.get('/',                  (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));
router.post('/upload',           upload.single('video'), uploadVideo);
router.post('/process/:id',      processVideoById);
router.get('/status/:id',        getVideoStatus);
router.get('/result/:id',        getVideoResult);
router.get('/videos',            getAllVideos);
router.delete('/video/:id',      deleteVideo);
router.get('/download/:id',      downloadVideo);

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Max 1 GB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
});

module.exports = router;
