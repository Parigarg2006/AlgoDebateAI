import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Reconstruct __dirname for ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environmental variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

// Define the response schema to enforce JSON output structure
const RefinerResponseSchema = {
  type: 'OBJECT',
  properties: {
    finalCode: {
      type: 'STRING',
      description: 'The polished, clean, well-commented C++ code. You MUST include newlines (\\n) and proper indentation to format the code correctly. Do not wrap in markdown quotes.'
    },
    explanation: {
      type: 'STRING',
      description: 'A markdown explanation of the algorithm, why it is correct, and the optimization choices.'
    },
    timeComplexity: {
      type: 'STRING',
      description: 'The time complexity in Big O notation (e.g., O(N)).'
    },
    spaceComplexity: {
      type: 'STRING',
      description: 'The space complexity in Big O notation (e.g., O(1)).'
    }
  },
  required: ['finalCode', 'explanation', 'timeComplexity', 'spaceComplexity']
};

/**
 * Refines the final code solution and provides polished documentation.
 * @param {string} problemDescription - The original coding task description.
 * @param {string} finalDraftCode - The approved C++ code draft.
 * @param {Array<{round: number, code: string, criticism: string}>} [debateHistory=[]] - Full debate history of Coder/Critic.
 * @returns {Promise<{finalCode: string, explanation: string, timeComplexity: string, spaceComplexity: string}>}
 */
export async function refineCode(problemDescription, finalDraftCode, debateHistory = []) {
  let prompt = `Problem Description:\n${problemDescription}\n\n`;
  prompt += `Approved C++ Code Draft:\n${finalDraftCode}\n\n`;

  if (debateHistory.length > 0) {
    prompt += `Debate History between Coder and Critic:\n`;
    debateHistory.forEach(h => {
      prompt += `Round ${h.round}:\n`;
      prompt += `- Code draft: ${h.code}\n`;
      prompt += `- Critic feedback: ${h.criticism}\n\n`;
    });
  }

  prompt += `Please polish the approved C++ code draft. Add clear, professional comments, format it nicely (MUST include proper line breaks and indentation), write a comprehensive markdown explanation, and state the exact Time and Space complexities.`;

  // System instruction defining the Refiner's role as a tech lead
  const systemInstruction = `
You are a senior technical lead and software architect.
Your job is to polish, clean, and write clear comments for the approved C++ algorithm.
Make sure the returned C++ code uses clean, standard formatting with correct newlines and indentation.
Provide the final code, explanation, time complexity, and space complexity in a strict JSON format.
  `.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: RefinerResponseSchema,
      temperature: 0.1
    }
  });

  return JSON.parse(response.text);
}
