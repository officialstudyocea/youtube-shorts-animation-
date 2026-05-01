/**
 * videoController.js
 * Handles upload, single-clip processing, multi-clip processing,
 * status polling, result retrieval, download, and delete.
 */
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const Video = require('../models/Video');
const {
  probeVideo, extractThumbnail, writeSubtitles, writeTimedSubtitles, extractAudioClip, processVideo
} = require('../services/ffmpegService');
const { analyzeVideo, transcribeAudio } = require('../services/groqService');
const { addVideoToQueue } = require('../services/queueService');

const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upload
// ─────────────────────────────────────────────────────────────────────────────
async function uploadVideo(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No video file provided' });

    const id = uuidv4();
    const originalPath = req.file.path;

    // Probe video
    let metadata;
    try {
      metadata = await probeVideo(originalPath);
    } catch {
      fs.unlinkSync(originalPath);
      return res.status(422).json({ error: 'Cannot read video. Is it a valid video file?' });
    }

    const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
    const duration = parseFloat(metadata.format.duration || 0);

    // Parse clip definitions from body (multi-clip)
    // clips JSON: [{ startTime, duration, label? }, ...]
    let clips = [];
    try {
      clips = req.body.clips ? JSON.parse(req.body.clips) : [];
    } catch { clips = []; }

    const mode = clips.length > 0 ? 'multi' : 'single';

    // Build clip entries for multi mode
    const clipEntries = clips.map((c, i) => ({
      clipIndex: i,
      startTime: parseFloat(c.startTime || 0),
      duration: Math.min(parseFloat(c.duration || 40), 40),
      label: c.label || `Clip ${i + 1}`,
      status: 'pending',
      progress: 0,
    }));

    const options = {
      trimStart: parseFloat(req.body.trimStart || 0),
      trimDuration: Math.min(parseFloat(req.body.duration || 40), 40),
      language: req.body.language || 'en',
      captionStyle: req.body.captionStyle || 'modern',
      subtitles: req.body.subtitles !== 'false',
      aspectRatio: req.body.aspectRatio || '9:16',
    };

    // Handle both Mongoose and InMemory store
    let video;
    const docData = {
      id,
      originalName: req.file.originalname,
      originalPath,
      originalSize: req.file.size,
      mimeType: req.file.mimetype,
      duration: duration || null,
      width: videoStream?.width || null,
      height: videoStream?.height || null,
      fps: videoStream?.r_frame_rate ? evalFps(videoStream.r_frame_rate) : null,
      codec: videoStream?.codec_name || null,
      mode,
      options,
      clips: clipEntries,
      status: 'uploaded',
    };

    if (typeof Video.create === 'function' && global.__DB_DRIVER__ === 'memory') {
      // In-memory store
      video = Video.create(docData);
    } else {
      // Mongoose
      video = new Video(docData);
      await video.save();
    }

    return res.status(201).json({
      message: 'Video uploaded successfully',
      video: sanitize(video),
    });
  } catch (err) {
    console.error('[uploadVideo]', err);
    return res.status(500).json({ error: 'Upload failed', details: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/process/:id
// ─────────────────────────────────────────────────────────────────────────────
async function processVideoById(req, res) {
  try {
    const video = await Video.findOne({ id: req.params.id });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (video.status === 'processing') {
      return res.status(409).json({ error: 'Already processing' });
    }

    // Update status
    await Video.updateOne({ id: video.id }, { status: 'processing', progress: 0, error: null });

    // Respond immediately – processing runs in background via Queue
    res.json({ message: 'Processing started', videoId: video.id, mode: video.mode });

    // Launch queue job
    await addVideoToQueue(video.id, video.mode);
  } catch (err) {
    console.error('[processVideoById]', err);
    return res.status(500).json({ error: err.message });
  }
}

// Background processing has been moved to worker.js for better stability and queue management.

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/status/:id
// ─────────────────────────────────────────────────────────────────────────────
async function getVideoStatus(req, res) {
  try {
    const video = await Video.findOne({ id: req.params.id });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    return res.json({
      id: video.id,
      status: video.status,
      progress: video.progress,
      error: video.error,
      mode: video.mode,
      clips: (video.clips || []).map((c) => ({
        clipIndex: c.clipIndex,
        label: c.label,
        status: c.status,
        progress: c.progress,
        error: c.error,
      })),
    });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/result/:id
// ─────────────────────────────────────────────────────────────────────────────
async function getVideoResult(req, res) {
  try {
    const video = await Video.findOne({ id: req.params.id });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (video.status !== 'completed') {
      return res.status(202).json({ message: 'Not ready yet', status: video.status });
    }
    return res.json({ video: sanitize(video) });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/videos
// ─────────────────────────────────────────────────────────────────────────────
async function getAllVideos(_req, res) {
  try {
    const videos = await Video.find();
    return res.json({ videos: videos.slice(0, 50).map(sanitize) });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/video/:id
// ─────────────────────────────────────────────────────────────────────────────
async function deleteVideo(req, res) {
  try {
    const video = await Video.findOne({ id: req.params.id });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    // Delete source file
    safeUnlink(video.originalPath);
    // Delete single-mode output
    safeUnlink(video.outputPath);
    safeUnlink(video.thumbnailPath);
    // Delete multi-clip outputs
    (video.clips || []).forEach((c) => { safeUnlink(c.outputPath); safeUnlink(c.thumbnailPath); });
    // Delete subtitle files
    const subGlob = path.join(OUTPUTS_DIR, `sub_${video.id}*.ass`);
    fs.readdirSync(OUTPUTS_DIR).filter((f) => f.startsWith(`sub_${video.id}`)).forEach((f) => {
      safeUnlink(path.join(OUTPUTS_DIR, f));
    });

    await Video.deleteOne({ id: video.id });
    return res.json({ message: 'Deleted' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/download/:id?clip=0
// ─────────────────────────────────────────────────────────────────────────────
async function downloadVideo(req, res) {
  try {
    const video = await Video.findOne({ id: req.params.id });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    let filePath;
    const clipIdx = req.query.clip !== undefined ? parseInt(req.query.clip, 10) : -1;

    if (clipIdx >= 0 && video.clips?.[clipIdx]) {
      filePath = video.clips[clipIdx].outputPath;
    } else {
      filePath = video.outputPath;
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Output file not found' });
    }

    const label = clipIdx >= 0 ? `_clip${clipIdx + 1}` : '';
    const filename = `short${label}_${video.originalName}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function safeUnlink(p) {
  if (p && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
}

function evalFps(str) {
  try {
    const [n, d] = str.split('/').map(Number);
    return d ? n / d : n;
  } catch { return null; }
}

function buildSubLines(name) {
  const topic = (name || 'Video').replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ').toUpperCase();
  return [
    topic,
    'Watch till the end! 👀',
    'Like & Subscribe 🔥',
    'Share this!',
    `${topic.split(' ').slice(0, 3).join(' ')} 💯`,
    'Follow for more!',
    '#Shorts #Viral',
    'Drop a comment 👇',
    "You won't believe this!",
    'Mind-blowing 🤯',
    'AI Optimized Duration ⚡',
  ];
}

async function safeAnalyze(data) {
  try { return await analyzeVideo(data); }
  catch (e) {
    console.warn('[Groq] fallback AI:', e.message);
    const topic = (data.originalName || 'Video').replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ');
    return {
      title: `${topic} 🔥 #Shorts`,
      description: `Check out this amazing ${topic} clip! Like & subscribe for more content.`,
      hashtags: ['#Shorts', '#Viral', '#YouTube', '#Trending', '#fyp'],
      category: 'Entertainment',
      postingTime: 'Friday 7PM EST',
      viralScore: 7.0,
      titleVariations: [`${topic} goes CRAZY 😱`, `POV: ${topic} 💯`, `Nobody talks about ${topic}...`],
      uploadTips: 'Post consistently for best results.',
    };
  }
}

function sanitize(video) {
  const obj = video?.toObject ? video.toObject() : (video || {});

  const sanitizeClip = (c) => ({
    clipIndex: c.clipIndex,
    label: c.label,
    startTime: c.startTime,
    duration: c.duration,
    status: c.status,
    progress: c.progress,
    error: c.error,
    hasOutput: !!(c.outputPath && fs.existsSync(c.outputPath)),
    hasThumb: !!(c.thumbnailPath && fs.existsSync(c.thumbnailPath)),
    outputFile: c.outputPath ? path.basename(c.outputPath) : null,
    thumbnailFile: c.thumbnailPath ? path.basename(c.thumbnailPath) : null,
    aiAnalysis: c.aiAnalysis || {},
  });

  return {
    id: obj.id,
    originalName: obj.originalName,
    originalSize: obj.originalSize,
    mimeType: obj.mimeType,
    status: obj.status,
    progress: obj.progress,
    error: obj.error,
    duration: obj.duration,
    width: obj.width,
    height: obj.height,
    fps: obj.fps,
    codec: obj.codec,
    mode: obj.mode || 'single',
    options: obj.options,
    aiAnalysis: obj.aiAnalysis,
    hasOutput: !!(obj.outputPath && fs.existsSync(obj.outputPath)),
    hasThumb: !!(obj.thumbnailPath && fs.existsSync(obj.thumbnailPath)),
    outputFile: obj.outputPath ? path.basename(obj.outputPath) : null,
    thumbnailFile: obj.thumbnailPath ? path.basename(obj.thumbnailPath) : null,
    clips: (obj.clips || []).map(sanitizeClip),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

module.exports = {
  uploadVideo, processVideoById, getVideoStatus,
  getVideoResult, getAllVideos, deleteVideo, downloadVideo,
};
