/**
 * groqService.js
 * Calls Groq API to generate viral YouTube Shorts metadata from
 * video info + a simple transcript (derived from filename / duration).
 */
const Groq = require('groq-sdk');
const path = require('path');

function getGroqClient() {
  // Collect all keys from GROQ_API_KEY_1, GROQ_API_KEY_2, etc.
  // Also support the older GROQ_API_KEYS (comma separated) or single GROQ_API_KEY
  let keys = [];

  // 1. Check for GROQ_API_KEY_N pattern
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('GROQ_API_KEY_')) {
      const val = process.env[key].trim().split('#')[0].trim();
      if (val) keys.push(val);
    }
  });

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
You are a viral YouTube Shorts content strategist. Analyze this video clip and generate optimized content metadata.

Video Details:
- Topic/Filename: "${topic}"
- Duration: ${duration ? Math.round(duration) + ' seconds' : 'unknown'}
- Resolution: ${width}x${height}
- Target Language: ${language}
- Transcript: "${transcript || 'No transcript available'}"

Generate a JSON response with EXACTLY this structure:
{
  "title": "Compelling clickbait but clean title under 60 chars",
  "description": "SEO-optimized description 150-200 chars with keywords",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"],
  "category": "One of: Gaming, Education, Entertainment, Lifestyle, Tech, Sports, Music, Comedy, News, DIY",
  "postingTime": "Best time to post e.g. 'Friday 7PM EST'",
  "viralScore": 7.5,
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
- Title must be attention-grabbing, use power words, emojis OK
- Hashtags must be trending and relevant
- viralScore between 1-10 (be honest)
- suggestedDuration: You MUST analyze the transcript and suggest a duration (in seconds) that captures a complete thought, hook, or exciting moment. Do NOT just return a default value like 25. It MUST be between 10 and 40 seconds. Aim for the longest possible engaging segment without filler.
- Respond ONLY with valid JSON, no markdown, no extra text
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
        suggestedDuration: typeof parsed.suggestedDuration === 'number' ? Math.min(parsed.suggestedDuration, 40) : null,
        language:        videoData.language     || 'en',
      };
    } catch (err) {
      attempts++;
      if (err.status === 401 && attempts < maxAttempts) {
        console.warn(`[Groq] Key failed (401). Retrying with another key... (Attempt ${attempts}/${maxAttempts})`);
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
      const client = getGroqClient();
      const options = {
        file: fs.createReadStream(filePath),
        model: 'whisper-large-v3',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      };
      
      if (language) options.language = language;

      const transcription = await client.audio.transcriptions.create(options);
      
      console.log(`[Whisper] Transcribed ${path.basename(filePath)}: "${(transcription.text || '').substring(0, 50)}..." (${transcription.segments?.length || 0} segments)`);

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
      if (err.status === 401 && attempts < maxAttempts) {
        console.warn(`[Whisper] Key failed (401). Retrying with another key... (Attempt ${attempts}/${maxAttempts})`);
        continue;
      }
      console.error('[Whisper] Transcription failed:', err);
      throw err;
    }
  }
}

module.exports = { analyzeVideo, transcribeAudio };
