/**
 * queueService.js
 * In-memory task queue (Fallback when Redis is unavailable)
 * Handles background video processing jobs without BullMQ.
 */
const { processVideoJob } = require('../worker');

// Mock connection and queue for compatibility
const connection = null;
const videoQueue = {
  add: async () => {}
};

const queue = [];
let processing = false;

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;
  
  const { videoId, mode } = queue.shift();
  try {
    await processVideoJob(videoId, mode);
  } catch (err) {
    console.error(`[In-Memory Queue] Job failed for ${videoId}:`, err);
  }
  
  processing = false;
  // Process next job asynchronously
  setTimeout(processQueue, 1000);
}

/**
 * Adds a video processing task to the queue.
 * @param {string} videoId 
 * @param {string} mode - 'single' | 'multi'
 */
async function addVideoToQueue(videoId, mode) {
  queue.push({ videoId, mode });
  console.log(`[Queue] Added ${mode} job for video ${videoId} to in-memory queue.`);
  processQueue(); // Start processing if not already
}

module.exports = { videoQueue, addVideoToQueue, connection };
