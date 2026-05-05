/**
 * worker.js
 * Background worker for BullMQ.
 * Processes single and multi-clip video jobs.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Video = require('./models/Video');
const { 
  extractThumbnail, writeSubtitles, writeTimedSubtitles, extractAudioClip, processVideo 
} = require('./services/ffmpegService');
const { analyzeVideo, transcribeAudio } = require('./services/groqService');
const { generateViralContent } = require('./services/geminiService');
const { generateBackupContent } = require('./services/openRouterService');

const OUTPUTS_DIR = path.join(__dirname, 'outputs');
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

async function processVideoJob(videoId, mode) {
  console.log(`[Worker] Processing ${mode} job for ${videoId}...`);

  const video = await Video.findOne({ id: videoId });
  if (!video) throw new Error(`Video ${videoId} not found`);

  try {
    if (mode === 'multi') {
      await handleMultiClip(video);
    } else {
      await handleSingleClip(video);
    }
  } catch (err) {
    console.error(`[Worker] Job failed for ${videoId}:`, err.message);
    await Video.updateOne({ id: videoId }, { status: 'failed', error: err.message });
    throw err;
  }
}

/**
 * Tiered AI Content Generation
 */
async function getAIContent(data) {
  try {
    // 1. Primary: Gemini Flash for creative content
    console.log('[AI] Trying Gemini Flash...');
    return await generateViralContent(data);
  } catch (err) {
    console.warn('[AI] Gemini failed, trying Groq backup...', err.message);
    try {
      // 2. Secondary: Groq (Llama 70B)
      return await analyzeVideo(data);
    } catch (groqErr) {
      console.warn('[AI] Groq failed, trying OpenRouter backup...', groqErr.message);
      try {
        // 3. Final Fallback: OpenRouter
        return await generateBackupContent(data);
      } catch (orErr) {
        console.error('[AI] All AI services failed. Using fallback defaults.');
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
          summary: 'Metadata generated via fallback.',
          suggestedDuration: data.duration || 30
        };
      }
    }
  }
}

async function handleSingleClip(video) {
  const outputPath   = path.join(OUTPUTS_DIR, `short_${video.id}.mp4`);
  const subtitlePath = path.join(OUTPUTS_DIR, `sub_${video.id}.ass`);
  const audioPath    = path.join(OUTPUTS_DIR, `audio_${video.id}.mp3`);

  let transcriptionText = '';
  let segments = [];
  let words = [];

  // 1. Transcribe (Groq)
  if (video.options?.subtitles !== false) {
    const wavPath = audioPath.replace('.mp3', '.wav');
    console.log(`[Whisper] Transcribing ${video.id}...`);
    await extractAudioClip(video.originalPath, wavPath, video.options?.trimStart || 0, 40);
    const transcription = await transcribeAudio(wavPath, video.options?.language);
    
    transcriptionText = transcription.text;
    segments = transcription.segments || [];
    words = transcription.words || [];
    
    console.log(`[Whisper] Done. Found ${segments.length} segments and ${words.length} words.`);
    
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
  }

  // 2. Analyze & Generate Creative Content (Tiered AI)
  const analysis = await analyzeVideo({ ...video.toObject(), transcript: transcriptionText }); // Groq for fast structural analysis
  const creative = await getAIContent({ ...video.toObject(), transcript: transcriptionText }); // Gemini/OpenRouter for creative

  const ai = { ...analysis, ...creative };

  if (video.options?.subtitles !== false) {
    writeTimedSubtitles(segments, subtitlePath, video.options?.captionStyle, words);
  }

  const finalDuration = ai.suggestedDuration || video.options?.trimDuration || 30;

  // 3. FFmpeg Process
  await processVideo({
    inputPath:    video.originalPath,
    outputPath,
    startTime:    video.options?.trimStart || 0,
    duration:     finalDuration,
    subtitlePath: video.options?.subtitles !== false ? subtitlePath : null,
    aspectRatio:  video.options?.aspectRatio || '9:16',
    onProgress:   async (pct) => {
      await Video.updateOne({ id: video.id }, { progress: Math.min(pct, 90) });
    },
  });

  // 4. Post-process (Thumb + S3)
  let thumbPath = null;
  try { thumbPath = await extractThumbnail(outputPath, OUTPUTS_DIR, 5000); } catch {}

  await Video.updateOne({ id: video.id }, {
    status: 'completed', progress: 100,
    outputPath: outputPath,
    thumbnailPath: thumbPath,
    aiAnalysis: ai,
  });
}

async function handleMultiClip(video) {
  const clips = video.clips || [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipId = `${video.id}_c${i}`;
    const outputPath   = path.join(OUTPUTS_DIR, `short_${clipId}.mp4`);
    const subtitlePath = path.join(OUTPUTS_DIR, `sub_${clipId}.ass`);
    const audioPath    = path.join(OUTPUTS_DIR, `audio_${clipId}.mp3`);

    // Update clip status
    const freshDoc = await Video.findOne({ id: video.id });
    const freshClips = freshDoc?.clips ? freshDoc.clips.map(c => c.toObject ? c.toObject() : c) : clips;
    freshClips[i].status = 'processing';
    await Video.updateOne({ id: video.id }, { clips: freshClips });

    let transcriptionText = '';
    let segments = [];
    let words = [];

    if (video.options?.subtitles !== false) {
      const wavPath = audioPath.replace('.mp3', '.wav');
      await extractAudioClip(video.originalPath, wavPath, clip.startTime, 40);
      const transcription = await transcribeAudio(wavPath, video.options?.language);
      
      transcriptionText = transcription.text;
      segments = transcription.segments || [];
      words = transcription.words || [];
      
      console.log(`[Whisper-Multi] Clip ${i}: Found ${segments.length} segments.`);
      
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    }

    const analysis = await analyzeVideo({ originalName: clip.label, duration: clip.duration, transcript: transcriptionText });
    const creative = await getAIContent({ originalName: clip.label, transcript: transcriptionText });
    const ai = { ...analysis, ...creative };

    if (video.options?.subtitles !== false) {
      writeTimedSubtitles(segments, subtitlePath, video.options?.captionStyle, words);
    }

    await processVideo({
      inputPath:    video.originalPath,
      outputPath,
      startTime:    clip.startTime,
      duration:     ai.suggestedDuration || clip.duration,
      subtitlePath: video.options?.subtitles !== false ? subtitlePath : null,
      aspectRatio:  video.options?.aspectRatio || '9:16',
      onProgress:   async (pct) => {
        const progDoc = await Video.findOne({ id: video.id });
        const progClips = progDoc?.clips ? progDoc.clips.map(c => c.toObject ? c.toObject() : c) : [];
        if (progClips[i]) {
          progClips[i].progress = Math.min(pct, 90);
          await Video.updateOne({ id: video.id }, { clips: progClips });
        }
      },
    });

    let thumbPath = null;
    try { thumbPath = await extractThumbnail(outputPath, OUTPUTS_DIR, 3000); } catch {}

    let s3Url = outputPath;
    let s3Thumb = thumbPath;

    const latestDoc = await Video.findOne({ id: video.id });
    const latestClips = latestDoc?.clips ? latestDoc.clips.map(c => c.toObject ? c.toObject() : c) : [];
    if (latestClips[i]) {
      latestClips[i] = {
        ...latestClips[i], status: 'completed', progress: 100,
        outputPath: s3Url || outputPath,
        thumbnailPath: s3Thumb || thumbPath,
        aiAnalysis: ai,
      };
      await Video.updateOne({ id: video.id }, { 
        clips: latestClips,
        progress: Math.round(((i + 1) / clips.length) * 100)
      });
    }
  }
  await Video.updateOne({ id: video.id }, { status: 'completed', progress: 100 });
}

module.exports = { processVideoJob };
