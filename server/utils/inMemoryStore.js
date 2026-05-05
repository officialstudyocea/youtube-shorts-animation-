/**
 * inMemoryStore.js
 * Drop-in replacement for Mongoose Video model operations.
 * Used automatically when MongoDB is unavailable (dev without Mongo).
 */
const { v4: uuidv4 } = require('uuid');

// Plain JS Map – survives the process lifetime
const store = new Map();

const InMemoryVideo = {
  // ── Create & save ──────────────────────────────────────────────────────────
  create(data) {
    const now = new Date();
    const doc = {
      _id: uuidv4(),
      id: data.id,
      originalName: data.originalName,
      originalPath: data.originalPath,
      originalSize: data.originalSize,
      mimeType: data.mimeType,
      status: data.status || 'uploaded',
      progress: data.progress || 0,
      error: data.error || null,
      outputPath: data.outputPath || null,
      thumbnailPath: data.thumbnailPath || null,
      duration: data.duration || null,
      width: data.width || null,
      height: data.height || null,
      fps: data.fps || null,
      codec: data.codec || null,
      mode: data.mode || 'single',      // ← single or multi
      options: data.options || {},
      aiAnalysis: data.aiAnalysis || {
        title: null, description: null, hashtags: [],
        category: null, postingTime: null, viralScore: null,
        titleVariations: [], language: 'en', summary: null,
      },
      clips: data.clips || [],         // ← multi-clip array
      createdAt: now,
      updatedAt: now,
    };
    store.set(doc.id, doc);

    // Return an object that mimics a Mongoose document
    return wrapDoc(doc);
  },

  // ── Find one by id ─────────────────────────────────────────────────────────
  async findOne(query) {
    const id = query?.id;
    if (!id) return null;
    const doc = store.get(id);
    return doc ? wrapDoc(doc) : null;
  },

  // ── Find all (sorted newest first) ────────────────────────────────────────
  async find() {
    const all = [...store.values()].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return all.map(wrapDoc);
  },

  // ── Update fields by id ───────────────────────────────────────────────────
  async updateOne(query, update) {
    const id = query?.id;
    if (!id || !store.has(id)) return;
    const current = store.get(id);
    // Merge nested objects (aiAnalysis, options, clips)
    const merged = {
      ...current,
      ...update,
      aiAnalysis: { ...(current.aiAnalysis || {}), ...(update.aiAnalysis || {}) },
      options:    { ...(current.options    || {}), ...(update.options    || {}) },
      clips:      update.clips !== undefined ? update.clips : (current.clips || []),
      updatedAt:  new Date(),
    };
    store.set(id, merged);
  },

  // ── Delete by id ──────────────────────────────────────────────────────────
  async deleteOne(query) {
    store.delete(query?.id);
  },
};

/** Wrap a raw doc to expose .toObject() and .save() */
function wrapDoc(doc) {
  return {
    ...doc,
    toObject() { return { ...store.get(doc.id) || doc }; },
    async save() {
      store.set(this.id, { ...store.get(this.id), ...this, updatedAt: new Date() });
      return this;
    },
  };
}

module.exports = InMemoryVideo;
