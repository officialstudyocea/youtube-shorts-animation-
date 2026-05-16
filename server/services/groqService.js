/**
 * groqService.js
 * Calls Groq API to generate viral YouTube Shorts metadata from
 * video info + a simple transcript (derived from filename / duration).
 */
const Groq = require('groq-sdk');
const path = require('path');

function getGroqClient() {
  let keys = [];

  // 1. Check for GROQ_API_KEY_N pattern
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('GROQ_API_KEY_')) {
      const val = process.env[key].trim().split('#')[0].trim();
      if (val) keys.push(val);
    }
  });

  // 2. Check for single GROQ_API_KEY
  if (process.env.GROQ_API_KEY) {
    const val = process.env.GROQ_API_KEY.trim().split('#')[0].trim();
    if (val) keys.push(val);
  }

  // 3. Check for comma-separated GROQ_API_KEYS
  if (process.env.GROQ_API_KEYS) {
    const split = process.env.GROQ_API_KEYS.split(',');
    split.forEach(k => {
      const val = k.trim().split('#')[0].trim();
      if (val) keys.push(val);
    });
  }

  const uniqueKeys = [...new Set(keys)].filter(Boolean);

  if (uniqueKeys.length === 0) {
    throw new Error('No valid Groq API keys found (checked GROQ_API_KEYS, GROQ_API_KEY, and GROQ_API_KEY_N)');
  }

  // Pick a random key to distribute load
  const randomIndex = Math.floor(Math.random() * uniqueKeys.length);
  const selectedKey = uniqueKeys[randomIndex];

  return new Groq({ apiKey: selectedKey });
}

/**
 * Build a descriptive prompt for Groq from video metadata.
 */
function buildPrompt({ originalName, duration, width, height, language = 'en', transcript = '' }) {
  const topic = originalName.replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ');
  return `
You are a viral YouTube Shorts content strategist. Analyze this video transcript and identify the most engaging, viral segment to clip.

Video Details:
- Topic/Filename: "${topic}"
- Original Duration: ${duration ? Math.round(duration) + ' seconds' : 'unknown'}
- Target Language: ${language}
- Transcript (with timestamps): 
"${transcript || 'No transcript available'}"

Your goal is to find a segment that captures a COMPLETE thought, a hook, or an exciting moment. 
CRITICAL: Do NOT cut mid-sentence. Analyze the timestamps and ensure the clip starts at the beginning of a sentence and ends at a natural pause.

Generate a JSON response with EXACTLY this structure:
{
  "title": "Compelling clickbait but clean title under 60 chars",
  "description": "SEO-optimized description 150-200 chars with keywords",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"],
  "category": "One of: Gaming, Education, Entertainment, Lifestyle, Tech, Sports, Music, Comedy, News, DIY",
  "postingTime": "Best time to post e.g. 'Friday 7PM EST'",
  "viralScore": 7.5,
  "suggestedStartTime": 15.5,
  "suggestedDuration": 35,
  "summary": "A concise summary of what was discussed in the clip (2-3 sentences)",
  "titleVariations": [
    "Alternative title 1",
    "Alternative title 2",
    "Alternative title 3"
  ],
  "uploadTips": "One actionable tip to maximize views"
}

Rules:
- suggestedStartTime: The timestamp (in seconds) where the best segment starts.
- suggestedDuration: The length of the segment in seconds. 
- The duration MUST be between 10 and 60 seconds.
- The segment MUST capture a complete thought. Use the timestamps to be precise.
- Respond ONLY with valid JSON, no markdown, no extra text.
`.trim();
}

/**
 * Analyse video metadata with Groq and return structured AI suggestions.
 *
 * @param {object} videoData  Fields from the Video MongoDB document
 * @returns {Promise<object>} Parsed AI analysis object
 */
async function analyzeVideo(videoData) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const client = getGroqClient();
      const prompt = buildPrompt(videoData);

      const chatCompletion = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are an expert YouTube content strategist specializing in viral Shorts. Always respond with valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.85,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      });

      const raw = chatCompletion.choices[0]?.message?.content || '{}';
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      }

      return {
        title:           parsed.title           || 'Amazing Video Clip 🔥',
        description:     parsed.description     || 'Watch this incredible video!',
        hashtags:        Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#Shorts', '#Viral'],
        category:        parsed.category        || 'Entertainment',
        postingTime:     parsed.postingTime     || 'Friday 7PM EST',
        viralScore:      typeof parsed.viralScore === 'number' ? parsed.viralScore : 7.0,
        titleVariations: Array.isArray(parsed.titleVariations) ? parsed.titleVariations : [],
        uploadTips:      parsed.uploadTips      || 'Post consistently for best results.',
        summary:         parsed.summary         || 'No summary available.',
        suggestedStartTime: typeof parsed.suggestedStartTime === 'number' ? parsed.suggestedStartTime : null,
        suggestedDuration: typeof parsed.suggestedDuration === 'number' ? Math.min(parsed.suggestedDuration, 60) : null,
        language:        videoData.language     || 'en',
      };
    } catch (err) {
      attempts++;
      // Retry on 401 (Invalid Key) or 429 (Rate Limit)
      if ((err.status === 401 || err.status === 429) && attempts < maxAttempts) {
        console.warn(`[Groq] Key failed (${err.status}). Retrying with another key... (Attempt ${attempts}/${maxAttempts})`);
        continue;
      }
      console.error('[Groq] Analysis failed:', err);
      throw err;
    }
  }
}

/**
 * Transcribe audio file using Groq Whisper.
 * @param {string} filePath Path to audio file (mp3)
 * @returns {Promise<object>} { text, segments: [{start, end, text}, ...] }
 */
async function transcribeAudio(filePath, language = null) {
  let attempts = 0;
  const maxAttempts = 3;
  const fs = require('fs');

  while (attempts < maxAttempts) {
    try {
      console.log(`[Whisper] Starting transcription for: ${path.basename(filePath)} (Attempt ${attempts + 1})`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Audio file not found: ${filePath}`);
      }

      const client = getGroqClient();
      const options = {
        file: fs.createReadStream(filePath),
        model: 'whisper-large-v3',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      };
      
      if (language) {
        console.log(`[Whisper] Forcing language: ${language}`);
        options.language = language;
      }

      const transcription = await client.audio.transcriptions.create(options);
      
      const textSnippet = (transcription.text || '').substring(0, 50);
      const segmentCount = transcription.segments?.length || 0;
      const wordCount = transcription.words?.length || 0;

      console.log(`[Whisper] API Success. Text: "${textSnippet}..."`);
      console.log(`[Whisper] Stats: ${segmentCount} segments, ${wordCount} words.`);

      if (segmentCount === 0) {
        console.warn('[Whisper] No segments returned. Captions will be empty.');
      }

      return {
        text: transcription.text || '',
        segments: (transcription.segments || []).map(s => ({
          start: s.start,
          end: s.end,
          text: s.text
        })),
        words: (transcription.words || []).map(w => ({
          start: w.start,
          end: w.end,
          word: w.word
        }))
      };
    } catch (err) {
      attempts++;
      console.error(`[Whisper] Error on attempt ${attempts}:`, err.message);
      // Retry on 401 (Invalid Key) or 429 (Rate Limit)
      if ((err.status === 401 || err.status === 429) && attempts < maxAttempts) {
        console.warn(`[Whisper] Retrying with another key...`);
        continue;
      }
      throw err;
    }
  }
}

module.exports = { analyzeVideo, transcribeAudio };
