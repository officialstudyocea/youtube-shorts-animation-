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
const { generateViralContent, transliterateToHinglish } = require('./services/geminiService');
const { generateBackupContent } = require('./services/openRouterService');

const OUTPUTS_DIR = process.env.CUSTOM_OUTPUT_DIR || path.join(__dirname, 'outputs');
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
          suggestedDuration: Math.min(data.duration || 30, 60)
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
    try {
      const wavPath = audioPath.replace('.mp3', '.wav');
      console.log(`[Whisper] Transcribing ${video.id}...`);
      // Extract up to 10 minutes of audio to give AI more context
      await extractAudioClip(video.originalPath, wavPath, 0, 600); 
      const transcription = await transcribeAudio(wavPath, video.options?.language);
      
      // Format transcript with timestamps for AI analysis
      transcriptionText = (transcription.segments || [])
        .map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`)
        .join('\n');
      segments = transcription.segments || [];
      words = transcription.words || [];
      
      console.log(`[Whisper] Done. Found ${segments.length} segments and ${words.length} words.`);
      if (transcriptionText) {
        console.log(`[Whisper] Sample Text: "${transcriptionText.substring(0, 100)}..."`);
        
        // --- Hinglish Transliteration ---
        if (video.options?.language === 'hi') {
          console.log('[AI] Transliterating Hindi to Hinglish...');
          if (words && words.length > 0) {
            words = await transliterateToHinglish(words);
          } else if (segments && segments.length > 0) {
            segments = await transliterateToHinglish(segments);
          }
        }
      } else {
        console.warn(`[Whisper] Warning: Transcription returned empty text for ${video.id}`);
      }
      
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    } catch (whisperErr) {
      console.warn(`[Whisper] Transcription failed for ${video.id}, continuing without captions:`, whisperErr.message);
    }
  }

  // 2. Analyze & Generate Creative Content (Tiered AI)
  const analysis = await analyzeVideo({ ...video.toObject(), transcript: transcriptionText }); // Groq for fast structural analysis
  const creative = await getAIContent({ ...video.toObject(), transcript: transcriptionText }); // Gemini/OpenRouter for creative

  const ai = { ...analysis, ...creative };

  if (video.options?.subtitles !== false) {
    const hasSegments = segments && segments.length > 0;
    const hasWords = words && words.length > 0;
    
    if (hasSegments || hasWords) {
      console.log(`[Worker] Writing ${segments.length} segments / ${words.length} words to ${subtitlePath}`);
      writeTimedSubtitles(segments, subtitlePath, video.options?.captionStyle, words);
      
      if (fs.existsSync(subtitlePath)) {
        const stats = fs.statSync(subtitlePath);
        console.log(`[Worker] Subtitle file created successfully. Size: ${stats.size} bytes`);
      } else {
        console.error(`[Worker] Failed to create subtitle file at ${subtitlePath}`);
      }
    } else {
      console.warn(`[Worker] No transcription data found for ${video.id}, skipping subtitle file.`);
    }
  }

  const finalDuration = ai.suggestedDuration || video.options?.trimDuration || 30;
  // If the user didn't specify a start time (still 0), let the AI decide the best hook
  const finalStartTime = (video.options?.trimStart === 0 && ai.suggestedStartTime !== null && ai.suggestedStartTime !== undefined)
    ? ai.suggestedStartTime
    : (video.options?.trimStart || 0);

  // 3. FFmpeg Process
  await processVideo({
    inputPath:    video.originalPath,
    outputPath,
    startTime:    finalStartTime,
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
  console.log(`[Worker-Multi] Starting multi-clip processing: ${clips.length} clips to process`);

  if (clips.length === 0) {
    console.warn('[Worker-Multi] No clips defined – nothing to process.');
    await Video.updateOne({ id: video.id }, { status: 'completed', progress: 100 });
    return;
  }

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipId = `${video.id}_c${i}`;
    console.log(`[Worker-Multi] ── Clip ${i + 1}/${clips.length}: "${clip.label}" startTime=${clip.startTime}s duration=${clip.duration}s`);

    const outputPath   = path.join(OUTPUTS_DIR, `short_${clipId}.mp4`);
    const subtitlePath = path.join(OUTPUTS_DIR, `sub_${clipId}.ass`);
    const audioPath    = path.join(OUTPUTS_DIR, `audio_${clipId}.mp3`);

    // Update clip status to 'processing'
    try {
      const freshDoc = await Video.findOne({ id: video.id });
      const freshClips = freshDoc?.clips ? freshDoc.clips.map(c => c.toObject ? c.toObject() : c) : clips.map(c => ({ ...c }));
      if (freshClips[i]) {
        freshClips[i].status = 'processing';
        freshClips[i].progress = 0;
        await Video.updateOne({ id: video.id }, { clips: freshClips });
      }
    } catch (e) {
      console.warn(`[Worker-Multi] Could not update clip ${i} status:`, e.message);
    }

    try {
      let transcriptionText = '';
      let segments = [];
      let words = [];

      if (video.options?.subtitles !== false) {
        try {
          const wavPath = audioPath.replace('.mp3', '.wav');
          console.log(`[Whisper-Multi] Clip ${i}: Extracting audio from ${clip.startTime}s...`);
          await extractAudioClip(video.originalPath, wavPath, clip.startTime, clip.duration || 60);
          const transcription = await transcribeAudio(wavPath, video.options?.language);
          
          transcriptionText = transcription.text || '';
          segments = transcription.segments || [];
          words = transcription.words || [];
          
          console.log(`[Whisper-Multi] Clip ${i}: Found ${segments.length} segments and ${words.length} words.`);
          if (transcriptionText) {
            console.log(`[Whisper-Multi] Clip ${i}: Sample Text: "${transcriptionText.substring(0, 100)}..."`);
            
            // --- Hinglish Transliteration ---
            if (video.options?.language === 'hi') {
              console.log(`[AI-Multi] Clip ${i}: Transliterating Hindi to Hinglish...`);
              if (words && words.length > 0) {
                words = await transliterateToHinglish(words);
              } else if (segments && segments.length > 0) {
                segments = await transliterateToHinglish(segments);
              }
            }
          } else {
            console.warn(`[Whisper-Multi] Clip ${i}: Warning: Transcription returned empty text.`);
          }
          
          if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
        } catch (whisperErr) {
          console.warn(`[Whisper-Multi] Clip ${i}: Transcription failed, skipping captions:`, whisperErr.message);
        }
      }

      // Use safe fallback for AI analysis (prevents rate-limit crashes)
      let analysis = {};
      try {
        analysis = await analyzeVideo({ originalName: clip.label, duration: clip.duration, transcript: transcriptionText });
      } catch (aiErr) {
        console.warn(`[Worker-Multi] Clip ${i}: analyzeVideo failed, using defaults:`, aiErr.message);
        const topic = (clip.label || 'Clip').replace(/[_\-]/g, ' ');
        analysis = {
          title: `${topic} 🔥 #Shorts`,
          description: `Check out this amazing ${topic} clip!`,
          hashtags: ['#Shorts', '#Viral', '#YouTube'],
          category: 'Entertainment',
          viralScore: 7.0,
        };
      }

      let creative = {};
      try {
        creative = await getAIContent({ originalName: clip.label, transcript: transcriptionText });
      } catch (cErr) {
        console.warn(`[Worker-Multi] Clip ${i}: getAIContent failed:`, cErr.message);
      }

      const ai = { ...analysis, ...creative };

      if (video.options?.subtitles !== false) {
        const hasData = (segments && segments.length > 0) || (words && words.length > 0);
        if (hasData) {
          console.log(`[Worker-Multi] Clip ${i}: Writing ${segments.length} segments / ${words.length} words to ${subtitlePath}`);
          writeTimedSubtitles(segments, subtitlePath, video.options?.captionStyle, words);
        } else {
          console.warn(`[Worker-Multi] Clip ${i}: No transcription data found, skipping subtitle file.`);
        }
      }

      console.log(`[Worker-Multi] Clip ${i}: FFmpeg processing startTime=${clip.startTime}s duration=${clip.duration}s...`);
      await processVideo({
        inputPath:    video.originalPath,
        outputPath,
        startTime:    clip.startTime,
        duration:     clip.duration,  // Always use the user-defined clip duration
        subtitlePath: (video.options?.subtitles !== false && fs.existsSync(subtitlePath)) ? subtitlePath : null,
        aspectRatio:  video.options?.aspectRatio || '9:16',
        onProgress:   async (pct) => {
          try {
            const progDoc = await Video.findOne({ id: video.id });
            const progClips = progDoc?.clips ? progDoc.clips.map(c => c.toObject ? c.toObject() : c) : [];
            if (progClips[i]) {
              progClips[i].progress = Math.min(pct, 90);
              await Video.updateOne({ id: video.id }, { clips: progClips });
            }
          } catch {} // Don't crash on progress update failure
        },
      });

      let thumbPath = null;
      try { thumbPath = await extractThumbnail(outputPath, OUTPUTS_DIR, 3000); } catch {}

      // Mark clip as completed
      const latestDoc = await Video.findOne({ id: video.id });
      const latestClips = latestDoc?.clips ? latestDoc.clips.map(c => c.toObject ? c.toObject() : c) : [];
      if (latestClips[i]) {
        latestClips[i] = {
          ...latestClips[i],
          status: 'completed',
          progress: 100,
          outputPath: outputPath,
          thumbnailPath: thumbPath,
          aiAnalysis: ai,
        };
        await Video.updateOne({ id: video.id }, { 
          clips: latestClips,
          progress: Math.round(((i + 1) / clips.length) * 100)
        });
      }
      console.log(`[Worker-Multi] ✅ Clip ${i + 1}/${clips.length} completed.`);

    } catch (clipErr) {
      // Per-clip error: mark THIS clip as failed but continue with the rest
      console.error(`[Worker-Multi] ❌ Clip ${i + 1}/${clips.length} failed:`, clipErr.message);
      try {
        const errDoc = await Video.findOne({ id: video.id });
        const errClips = errDoc?.clips ? errDoc.clips.map(c => c.toObject ? c.toObject() : c) : [];
        if (errClips[i]) {
          errClips[i].status = 'failed';
          errClips[i].error = clipErr.message;
          errClips[i].progress = 0;
          await Video.updateOne({ id: video.id }, { clips: errClips });
        }
      } catch {} // Silently ignore DB update errors here
    }
  }

  // Check if at least one clip succeeded
  const finalDoc = await Video.findOne({ id: video.id });
  const finalClips = finalDoc?.clips ? finalDoc.clips.map(c => c.toObject ? c.toObject() : c) : [];
  const anyCompleted = finalClips.some(c => c.status === 'completed');
  const allFailed = finalClips.every(c => c.status === 'failed');

  if (allFailed) {
    await Video.updateOne({ id: video.id }, { status: 'failed', progress: 0, error: 'All clips failed to process' });
  } else {
    await Video.updateOne({ id: video.id }, { status: 'completed', progress: 100 });
  }
  console.log(`[Worker-Multi] Done. ${finalClips.filter(c => c.status === 'completed').length}/${finalClips.length} clips succeeded.`);
}

module.exports = { processVideoJob };
