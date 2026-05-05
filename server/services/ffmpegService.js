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
// On Railway/Linux, the system FFmpeg is more reliable for subtitles (libass).
const ffmpegPath  = process.env.FFMPEG_PATH  || 'ffmpeg'; 
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

try {
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
} catch (e) {
  // Fallback to static if system version is missing
  const staticFF = require('ffmpeg-static');
  const staticFP = require('ffprobe-static').path;
  ffmpeg.setFfmpegPath(staticFF);
  ffmpeg.setFfprobePath(staticFP);
}

console.log('🎬 FFmpeg  :', ffmpegPath);
console.log('🔍 FFprobe :', ffprobePath);

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
Style: Default,Impact,64,${s.colour},&H000000FF,${s.outline},${s.shadow},-1,0,0,0,110,110,0,0,1,4,2,2,60,60,100,1

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
    events += `Dialogue: 0,${fmt(start)},${fmt(end)},Default,,0,0,0,,${line.trim()}\n`;
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
Style: Default,Impact,64,${s.colour},&H000000FF,${s.outline},${s.shadow},-1,0,0,0,110,110,0,0,1,4,2,2,60,60,100,1

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
    
    events += `Dialogue: 0,${fmt(item.start)},${fmt(item.end)},Default,,0,0,0,,${effect}${text}\n`;
  }
  fs.writeFileSync(outputPath, header + events, 'utf8');
}

/**
 * Extract a short audio clip as mono MP3 for Whisper transcription.
 */
function extractAudioClip(inputPath, outputPath, startTime = 0, duration = 40) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(startTime)
      .duration(Math.min(duration, 40))
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('64k')
      .audioChannels(1)
      .audioFrequency(16000)  // Whisper works best at 16 kHz
      .output(outputPath)
      .on('end', resolve)
      .on('error', (err) => reject(new Error(`Audio extraction failed: ${err.message}`)))
      .run();
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
function processVideo({ inputPath, outputPath, startTime = 0, duration = 40, subtitlePath, aspectRatio = '9:16', onProgress }) {
  return new Promise((resolve, reject) => {
    const clipDuration = Math.min(duration, 40);

    let cmd = ffmpeg(inputPath)
      .seekInput(startTime)
      .duration(clipDuration)
      .outputOptions([
        '-preset fast',
        '-crf 23',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        '-r 30',
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
      const escaped = subtitlePath
        .replace(/\\/g, '/')
        .replace(/:/g, '\\:')
        .replace(/ /g, '\\ ');
      filters.push(`ass='${escaped}'`);
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

module.exports = { probeVideo, extractThumbnail, writeSubtitles, writeTimedSubtitles, extractAudioClip, processVideo };

