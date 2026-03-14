import { GoogleGenAI } from '@google/genai';

let clientInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!clientInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    clientInstance = new GoogleGenAI({ apiKey });
  }
  return clientInstance;
}
