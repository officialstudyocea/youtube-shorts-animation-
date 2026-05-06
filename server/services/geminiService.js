/**
 * geminiService.js
 * Handles generating creative content (titles, descriptions, etc.) using Google Gemini Flash.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

async function generateViralContent(data) {
  if (!genAI) throw new Error('GEMINI_API_KEY is missing');

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

module.exports = { generateViralContent };
