/**
 * ffmpegService.js
 * Core FFmpeg processing logic:
 *  - Probe video metadata
 *  - Probe video metadata
 *  - Convert to 1:1 Square (e.g., 1080×1080)
 *  - Center-crop input to square
 *  - Burn ASS subtitles
 *  - Export compressed MP4
 */
const ffmpeg = require('fluent-ffmpeg');
const path   = require('path');
const fs     = require('fs');

// ── FFmpeg binaries ─────────────────────────────────────────────────────────
let ffmpegPath = 'ffmpeg';
let ffprobePath = 'ffprobe';

// 1. Check for system FFmpeg (Railway/Linux)
try {
  const { execSync } = require('child_process');
  execSync('ffmpeg -version', { stdio: 'ignore' });
  console.log('✅ Using System FFmpeg');
} catch (e) {
  // 2. Fallback to static if system version is missing
  console.warn('⚠️  System FFmpeg not found, falling back to static binaries.');
  try {
    ffmpegPath = require('ffmpeg-static');
    ffprobePath = require('ffprobe-static').path;
  } catch (err) {
    console.error('❌ Failed to load static FFmpeg binaries:', err.message);
  }
}

// 3. Allow manual overrides via Env
ffmpegPath = process.env.FFMPEG_PATH || ffmpegPath;
ffprobePath = process.env.FFPROBE_PATH || ffprobePath;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

console.log('🎬 FFmpeg Path:', ffmpegPath);
console.log('🔍 FFprobe Path:', ffprobePath);

const fontName = process.platform === 'win32' ? 'Arial Black' : 'DejaVu Sans';
console.log('🔡 Using Font:', fontName);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Probe a video file and return its metadata.
 * @param {string} filePath  Absolute path to the video
 * @returns {Promise<object>}
 */
function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });
}

/**
 * Extract a thumbnail frame at a given timestamp.
 * @param {string} inputPath   Source video
 * @param {string} outputDir   Directory to save the PNG
 * @param {number} timeMs      Timestamp in milliseconds
 * @returns {Promise<string>}  Path to the generated thumbnail
 */
function extractThumbnail(inputPath, outputDir, timeMs = 5000) {
  return new Promise((resolve, reject) => {
    const thumbName = `thumb_${Date.now()}.png`;
    const thumbPath = path.join(outputDir, thumbName);

    ffmpeg(inputPath)
      .seekInput(timeMs / 1000)
      .frames(1)
      .output(thumbPath)
      .on('end', () => resolve(thumbPath))
      .on('error', reject)
      .run();
  });
}

/**
 * Write a minimal ASS subtitle file from a plain-text transcript.
 * Each line is displayed for ~3 seconds in a large, bold, drop-shadow style.
 *
 * @param {string[]} lines     Transcript lines
 * @param {string}   outputPath  Where to save the .ass file
 * @param {string}   style     'modern' | 'classic' | 'minimal'
 */
function writeSubtitles(lines, outputPath, style = 'modern') {
  // ASS colour: &HAABBGGRR  (00 = fully opaque)
  const styleMap = {
    modern:  { colour: '&H0000FFFF', outline: '&H00000000', shadow: '&H80000000', size: 48 }, // Bold Yellow
    classic: { colour: '&H00FFFFFF', outline: '&H00000000', shadow: '&H00000000', size: 40 }, // White
    minimal: { colour: '&H00FFFFFF', outline: '&H00808080', shadow: '&H00000000', size: 36 },
  };
  const s = styleMap[style] || styleMap.modern;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1080
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},84,${s.colour},&H000000FF,${s.outline},${s.shadow},-1,0,0,0,100,100,0,0,1,4,2,2,60,60,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let events = '';
  lines.forEach((line, i) => {
    const start = i * 3;
    const end   = start + 3;
    const fmt   = (s) => {
      const h = Math.floor(s / 3600).toString().padStart(1, '0');
      const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
      const sec = (s % 60).toFixed(2).toString().padStart(5, '0');
      return `${h}:${m}:${sec}`;
    };
    events += `Dialogue: 0,${fmt(start)},${fmt(end)},Default,,0,0,0,,${line.trim().toUpperCase()}\n`;
  });

  fs.writeFileSync(outputPath, header + events, 'utf8');
}

// ── Main processing functions ────────────────────────────────────────────────

/**
 * Write ASS subtitles from real speech-to-text segments or words (Groq Whisper output).
 * @param {Array}  segments   [{start, end, text}, ...]
 * @param {string} outputPath Where to save the .ass file
 * @param {string} style      'modern' | 'classic' | 'minimal'
 * @param {Array}  words      [{start, end, word}, ...] (Optional word-level timestamps)
 */
function writeTimedSubtitles(segments, outputPath, style = 'modern', words = []) {
  const styleMap = {
    modern:  { colour: '&H0000FFFF', outline: '&H00000000', shadow: '&H80000000', size: 48 },
    classic: { colour: '&H00FFFFFF', outline: '&H00000000', shadow: '&H00000000', size: 40 },
    minimal: { colour: '&H00FFFFFF', outline: '&H00808080', shadow: '&H00000000', size: 36 },
  };
  const s = styleMap[style] || styleMap.modern;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1080
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},84,${s.colour},&H000000FF,${s.outline},${s.shadow},-1,0,0,0,100,100,0,0,1,4,2,2,60,60,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const fmt = (sec) => {
    const h  = Math.floor(sec / 3600).toString().padStart(1, '0');
    const m  = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s2 = (sec % 60).toFixed(2).toString().padStart(5, '0');
    return `${h}:${m}:${s2}`;
  };
  let events = '';

  // Use words if available for more dynamic "highlighting"
  const items = (words && words.length > 0) ? words : segments;
  
  for (const item of items) {
    const text = (item.word || item.text || '').trim().replace(/\n/g, '\\N');
    if (!text) continue;

    // Word-by-word mode usually needs a faster pop
    const isWord = !!item.word;
    const effect = isWord 
      ? '{\\fscx125\\fscy125\\t(0,80,\\fscx100\\fscy100)}' 
      : '{\\fscx115\\fscy115\\t(0,100,\\fscx100\\fscy100)}';
    
    events += `Dialogue: 0,${fmt(item.start)},${fmt(item.end)},Default,,0,0,0,,${effect}${text.toUpperCase()}\n`;
  }
  fs.writeFileSync(outputPath, header + events, 'utf8');
}

/**
 * Append a red "SUBSCRIBE" button overlay event to an existing ASS subtitle file.
 * The button appears for ~3 seconds centred at the bottom of the frame,
 * timed to the middle of the clip so it feels natural.
 *
 * @param {string} assPath        Path to the existing .ass file to patch
 * @param {number} videoDuration  Total clip duration in seconds
 */
function appendSubscribeOverlay(assPath, videoDuration) {
  const start = Math.max(1, Math.floor(videoDuration / 2) - 1.5); // centered window
  const duration = 3.5;
  const end = start + duration;

  const fmt = (sec) => {
    const h = Math.floor(sec / 3600).toString().padStart(1, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s2 = (sec % 60).toFixed(2).toString().padStart(5, '0');
    return `${h}:${m}:${s2}`;
  };

  const t_start = start;
  const t_click = start + 1.2;    // click moment
  const t_done  = start + 1.4;    // state change
  const t_end   = end;

  // --- STYLES ---
  // Using explicit \pos and \an5 for perfect centering of both shape and text
  const baseY = 800; // Adjusted Y to clear captions better
  const btnCommon = `{\\an5\\pos(540,${baseY})\\bord3\\3c&H000000&\\shad0\\p1}`;
  const redBtnStyle = `${btnCommon}{\\1c&H0000FF&}`; // Pure Red
  const greyBtnStyle = `${btnCommon}{\\1c&H888888&}`;

  // Robust Pill Path: 560x100 centered at 0,0
  const pillPath = 'm -250 -50 l 250 -50 b 280 -50 280 50 250 50 l -250 50 b -280 50 -280 -50 -250 -50';

  // Mouse Cursor Path (Clean Arrow)
  const cursorPath = 'm 0 0 l 0 25 l 7 20 l 12 30 l 16 28 l 11 18 l 22 17 z';
  const cursorDraw = `{\\bord1\\3c&H000000&\\1c&HFFFFFF&\\p1}${cursorPath}{\\p0}`;

  // --- EVENTS ---
  let events = '';

  // 1. THE BUTTON BOX (Red -> Grey)
  events += `Dialogue: 0,${fmt(t_start)},${fmt(t_done)},Subscribe,,0,0,0,,{\\fscx0\\fscy0\\t(0,250,\\fscx100\\fscy100)}${redBtnStyle}${pillPath}{\\p0}\n`;
  events += `Dialogue: 0,${fmt(t_done)},${fmt(t_end)},Subscribe,,0,0,0,,${greyBtnStyle}${pillPath}{\\p0}\n`;

  // 2. THE TEXT (SUBSCRIBE -> SUBSCRIBED)
  const textCommon = `{\\an5\\pos(540,${baseY})\\b1}`;
  events += `Dialogue: 1,${fmt(t_start)},${fmt(t_done)},Subscribe,,0,0,0,,${textCommon}{\\fscx0\\fscy0\\t(0,250,\\fscx100\\fscy100)\\1c&HFFFFFF&}SUBSCRIBE\n`;
  events += `Dialogue: 1,${fmt(t_done)},${fmt(t_end)},Subscribe,,0,0,0,,${textCommon}{\\1c&HCCCCCC&}SUBSCRIBED\n`;

  // 3. THE CURSOR ANIMATION
  const cursorX1 = 900, cursorY1 = 1000;
  const cursorX2 = 540, cursorY2 = baseY;
  
  events += `Dialogue: 2,${fmt(t_start)},${fmt(t_click)},Subscribe,,0,0,0,,{\\move(${cursorX1},${cursorY1},${cursorX2},${cursorY2},0,1100)}${cursorDraw}\n`;
  events += `Dialogue: 2,${fmt(t_click)},${fmt(t_done)},Subscribe,,0,0,0,,{\\pos(${cursorX2},${cursorY2})\\fscx80\\fscy80}${cursorDraw}\n`;
  events += `Dialogue: 2,${fmt(t_done)},${fmt(t_end)},Subscribe,,0,0,0,,{\\move(${cursorX2},${cursorY2},${cursorX1},${cursorY1},0,600)\\alpha&HAA&}${cursorDraw}\n`;

  let content = fs.readFileSync(assPath, 'utf8');

  // Inject/Update Subscribe style: Alignment 2 (Bottom-Center), MarginV: 160 (closer to bottom)
  const fontName = process.platform === 'win32' ? 'Arial Black' : 'DejaVu Sans';
  const subscribeStyle = `Style: Subscribe,${fontName},54,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,0,2,10,10,160,1`;
  
  if (content.includes('Style: Subscribe')) {
    content = content.replace(/^Style: Subscribe.*$/m, subscribeStyle);
  } else {
    content = content.replace(/^(Style: Default.+)$/m, `$1\n${subscribeStyle}`);
  }

  // Append dialogue events
  content = content.trimEnd() + '\n' + events;
  fs.writeFileSync(assPath, content, 'utf8');
  console.log(`[Subscribe] 🖱️ Fixed bottom-center overlay with synchronized animation at ${fmt(start)}`);
}

/**
 * Extract a short audio clip as mono MP3 for Whisper transcription.
 */
function extractAudioClip(inputPath, outputPath, startTime = 0, duration = 40) {
  return new Promise((resolve, reject) => {
    // Ensure we use the correct format for WAV
    ffmpeg(inputPath)
      .seekInput(startTime)
      .duration(Math.min(duration, 40))
      .noVideo()
      .toFormat('wav')
      .audioChannels(1)
      .audioFrequency(16000)
      .on('end', () => {
        console.log(`✅ Audio extracted to ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[FFmpeg] Audio extraction failed: ${err.message}`);
        reject(new Error(`Audio extraction failed: ${err.message}`));
      })
      .save(outputPath);
  });
}

/**
 * Trim a video clip and crop it to 1:1 square aspect ratio.
 * Audio is preserved. Optionally burns ASS subtitles.
 *
 * @param {object} opts
 * @param {string}   opts.inputPath
 * @param {string}   opts.outputPath
 * @param {number}   [opts.startTime=0]
 * @param {number}   [opts.duration=40]
 * @param {string}   [opts.subtitlePath]
 * @param {Function} [opts.onProgress]
 * @returns {Promise<void>}
 */
function processVideo({ inputPath, outputPath, startTime = 0, duration = 40, subtitlePath, aspectRatio = '9:16', onProgress, subscribeButton = true }) {
  return new Promise((resolve, reject) => {
    const clipDuration = Math.min(duration, 40);

    let cmd = ffmpeg(inputPath)
      .seekInput(startTime)
      .duration(clipDuration)
      .outputOptions([
        '-preset ultrafast', // 🚀 Max speed
        '-crf 26',           // Slightly lower quality for much faster render
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        '-r 30',
        '-threads 0',        // Use all available CPU cores
      ])
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate('128k');

    // Crop + Burn ASS subtitles
    const filters = [];
    if (aspectRatio === '1:1') {
      filters.push("crop='trunc(min(iw,ih)/2)*2':'trunc(min(iw,ih)/2)*2'");
    } else {
      // 9:16 vertical crop
      filters.push("crop='trunc((ih*9/16)/2)*2':'trunc(ih/2)*2'");
    }

    if (subtitlePath && fs.existsSync(subtitlePath)) {
      // Inject subscribe button overlay into the ASS file before burning
      if (subscribeButton) {
        try { appendSubscribeOverlay(subtitlePath, clipDuration); } catch (e) {
          console.warn('[Subscribe] Could not inject overlay:', e.message);
        }
      }
      console.log('📝 Burning subtitles from:', subtitlePath);
      
      const isWindows = process.platform === 'win32';
      console.log(`[FFmpeg] Platform: ${process.platform}, isWindows: ${isWindows}`);
      console.log(`[FFmpeg] Target Font: ${fontName}`);

      let escaped = subtitlePath.replace(/\\/g, '/');
      
      if (isWindows) {
        // Windows needs special escaping for the colon: C\:/path/to/sub.ass
        escaped = escaped.replace(':', '\\:');
      } else {
        // Linux: Ensure absolute paths are handled correctly. 
        // We use single quotes and escape any single quotes inside the path.
        escaped = escaped.replace(/'/g, "'\\\\''");
      }

      const assFilter = `ass='${escaped}'`;
      console.log(`[FFmpeg] Final ASS filter: ${assFilter}`);
      filters.push(assFilter);
    } else {
      console.warn(`[FFmpeg] Subtitles skipped: Path not found or file missing at ${subtitlePath}`);
    }
    cmd = cmd.videoFilters(filters);

    cmd
      .output(outputPath)
      .on('progress', (info) => {
        if (onProgress && info.percent) onProgress(Math.round(info.percent));
      })
      .on('end', resolve)
      .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
}

module.exports = { probeVideo, extractThumbnail, writeSubtitles, writeTimedSubtitles, extractAudioClip, processVideo, appendSubscribeOverlay };

