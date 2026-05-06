/**
 * geminiService.js
 * Handles generating creative content (titles, descriptions, etc.) using Google Gemini Flash.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

async function generateViralContent(data) {
  if (!genAI) throw new Error('GEMINI_API_KEY is missing');

  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const prompt = `
    You are an expert YouTube Shorts content creator. 
    Based on the following transcript and context, generate viral metadata.
    
    Context:
    - Video Title: ${data.originalName}
    - Transcript: ${data.transcript}
    
    Return ONLY a JSON object with:
    {
      "title": "A catchy, viral hook title",
      "description": "Engaging SEO description with keywords",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
      "titleVariations": ["Alt Title 1", "Alt Title 2", "Alt Title 3"],
      "summary": "1-sentence summary of the clip"
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    // Extract JSON from response (handling potential markdown formatting)
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || text;
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('[Gemini] Generation failed:', err);
    throw err;
  }
}

/**
 * Transliterate segments from Devanagari to Romanized Hindi (Hinglish)
 */
async function transliterateToHinglish(segments) {
  if (!genAI || !segments || segments.length === 0) return segments;
  
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Prepare a combined string
  const textToTransliterate = segments.map((s, i) => `ID:${i} | ${s.text || s.word}`).join('\n');
  
  const prompt = `
    You are a professional Hinglish translator. 
    Convert the following Hindi Devanagari text into Romanized Hindi (Hinglish).
    
    Example:
    "क्या हाल है भाई" -> "kya haal hai bhai"
    
    Format:
    ID:0 | transliterated_text
    ID:1 | transliterated_text
    
    Rules:
    - Keep the ID:N | prefix exactly.
    - Use natural Hinglish spelling.
    - Return ONLY the converted lines.
    
    Text:
    ${textToTransliterate}
  `.trim();

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const lines = response.text().split('\n');
    
    const newSegments = JSON.parse(JSON.stringify(segments)); // Deep copy
    lines.forEach(line => {
      const parts = line.split('|');
      if (parts.length >= 2) {
        const idMatch = parts[0].match(/ID:(\d+)/);
        if (idMatch) {
          const index = parseInt(idMatch[1]);
          const transliterated = parts.slice(1).join('|').trim();
          if (newSegments[index]) {
            if ('word' in newSegments[index]) newSegments[index].word = transliterated;
            if ('text' in newSegments[index]) newSegments[index].text = transliterated;
          }
        }
      }
    });
    
    return newSegments;
  } catch (err) {
    console.error('[Gemini] Transliteration failed:', err.message);
    return segments;
  }
}

module.exports = { generateViralContent, transliterateToHinglish };
