/**
 * openRouterService.js
 * Backup service for metadata generation using OpenRouter.
 */
const axios = require('axios');

const apiKey = process.env.OPENROUTER_API_KEY;

async function generateBackupContent(data) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing');

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'meta-llama/llama-3-70b-instruct',
      messages: [
        {
          role: 'user',
          content: `Generate viral YouTube Shorts metadata (JSON format) for: ${data.originalName}. Transcript: ${data.transcript}. 
          Return: { title, description, hashtags, titleVariations, summary }`
        }
      ],
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.GITHUB_URL || 'https://github.com/officialstudyocea',
        'Content-Type': 'application/json'
      }
    });

    return JSON.parse(response.data.choices[0].message.content);
  } catch (err) {
    console.error('[OpenRouter] Backup failed:', err);
    throw err;
  }
}

module.exports = { generateBackupContent };
