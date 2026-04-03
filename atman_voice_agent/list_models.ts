import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listModels() {
  try {
    const response = await ai.models.list();
    if (response && response.pageInternal) {
       for (const m of response.pageInternal) {
           console.log(m.name);
       }
    }
  } catch (err) {
    console.error(err);
  }
}

listModels();
