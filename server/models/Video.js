/**
 * Video.js – Mongoose Schema
 * Supports both single-video and multi-clip processing.
 */
const mongoose = require('mongoose');

// ── Sub-schema for each generated clip ───────────────────────────────────────
const clipSchema = new mongoose.Schema(
  {
    clipIndex:    { type: Number, required: true },   // 0-based index
    startTime:    { type: Number, required: true },   // seconds from source
    duration:     { type: Number, required: true },   // clip length (≤30s)
    label:        { type: String, default: null },    // e.g. "Clip 1 – Hook"

    // Processing state per clip
    status:   { type: String, enum: ['pending','processing','completed','failed'], default: 'pending' },
    progress: { type: Number, default: 0 },
    error:    { type: String, default: null },

    // Output files
    outputPath:    { type: String, default: null },
    thumbnailPath: { type: String, default: null },

    // AI analysis per clip
    aiAnalysis: {
      title:           { type: String,   default: null },
      description:     { type: String,   default: null },
      hashtags:        { type: [String], default: [] },
      category:        { type: String,   default: null },
      postingTime:     { type: String,   default: null },
      viralScore:      { type: Number,   default: null },
      titleVariations: { type: [String], default: [] },
      uploadTips:      { type: String,   default: null },
      summary:         { type: String,   default: null },
    },
  },
  { _id: false }
);

// ── Main video schema ─────────────────────────────────────────────────────────
const videoSchema = new mongoose.Schema(
  {
    id:           { type: String, required: true, unique: true, index: true },

    // Original upload metadata
    originalName: { type: String, required: true },
    originalPath: { type: String, required: true },
    originalSize: { type: Number, required: true },
    mimeType:     { type: String, required: true },

    // Overall status (reflects worst clip status)
    status:   { type: String, enum: ['uploaded','processing','completed','failed'], default: 'uploaded' },
    progress: { type: Number, default: 0 },
    error:    { type: String, default: null },

    // Probed metadata from source file
    duration: { type: Number, default: null },
    width:    { type: Number, default: null },
    height:   { type: Number, default: null },
    fps:      { type: Number, default: null },
    codec:    { type: String, default: null },

    // Processing mode
    mode: { type: String, enum: ['single', 'multi'], default: 'single' },

    // Single-mode output (legacy / backward compat)
    outputPath:    { type: String, default: null },
    thumbnailPath: { type: String, default: null },
    aiAnalysis: {
      title:           { type: String,   default: null },
      description:     { type: String,   default: null },
      hashtags:        { type: [String], default: [] },
      category:        { type: String,   default: null },
      postingTime:     { type: String,   default: null },
      viralScore:      { type: Number,   default: null },
      titleVariations: { type: [String], default: [] },
      uploadTips:      { type: String,   default: null },
      summary:         { type: String,   default: null },
    },

    // Multi-mode: array of clip segments
    clips: { type: [clipSchema], default: [] },

    // User options
    options: {
      trimStart:    { type: Number, default: 0 },
      trimDuration: { type: Number, default: 30 },
      language:     { type: String, default: 'en' },
      captionStyle: { type: String, default: 'modern' },
      subtitles:    { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Video', videoSchema);
