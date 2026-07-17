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
const CoderResponseSchema = {
  type: 'OBJECT',
  properties: {
    code: {
      type: 'STRING',
      description: 'The complete, compilable C++ source code. Ensure it reads inputs from standard input (cin) and prints expected results to standard output (cout). Do not wrap in markdown backticks.'
    },
    testCases: {
      type: 'ARRAY',
      description: 'A list of 3 to 4 custom test cases to verify the code.',
      items: {
        type: 'OBJECT',
        properties: {
          input: {
            type: 'STRING',
            description: 'The input data to feed into stdin.'
          },
          expectedOutput: {
            type: 'STRING',
            description: 'The expected output to compare against stdout.'
          }
        },
        required: ['input', 'expectedOutput']
      }
    }
  },
  required: ['code', 'testCases']
};

/**
 * Generates an initial C++ code draft or refines it based on criticism history.
 * @param {string} problemDescription - The coding task description.
 * @param {Array<{round: number, code: string, criticism: string}>} [criticismHistory=[]] - Feedback history from previous rounds.
 * @returns {Promise<{code: string, testCases: Array<{input: string, expectedOutput: string}>}>}
 */
export async function generateDraft(problemDescription, criticismHistory = []) {
  let prompt = `Problem Description:\n${problemDescription}\n\n`;

  // If we have criticism from the Critic Agent or Sandbox, we build an iterative prompt
  if (criticismHistory.length > 0) {
    prompt += `You have previously generated code that was criticized or failed test runs. Here is the history:\n`;
    for (const history of criticismHistory) {
      prompt += `--- ROUND ${history.round} ---\n`;
      prompt += `Your Code:\n${history.code}\n\n`;
      prompt += `Criticism & Sandbox Failures:\n${history.criticism}\n\n`;
    }
    prompt += `Please write a corrected, optimized version of the C++ code that fixes all of these issues. Make sure it compiles, passes all edge cases, and is efficient.`;
  } else {
    prompt += `Please write an initial C++ solution for this problem. Also generate 3 to 4 diverse test cases (including standard cases and edge cases) to verify your logic.`;
  }

  // System instructions establish the persona and standard guidelines
  const systemInstruction = `
You are an expert competitive programmer and algorithms specialist.
Your task is to write high-quality, optimal, and compilable C++ code.
Guidelines:
1. Use standard C++ headers and include proper namespaces (e.g. #include <iostream>, using namespace std;).
2. Read all test inputs from standard input (cin) and write outputs to standard output (cout).
3. Do not include verbose print statements or prompts (e.g., "Enter number:"). Only print the final answer.
4. Ensure the time complexity is optimal for large input constraints.
5. Pay attention to edge cases: empty arrays, negative numbers, very large numbers (use long long if needed).
  `.trim();

  // Call the Gemini API with structured output configuration
  const response = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: CoderResponseSchema,
      temperature: 0.1 // Low temperature to make output more logical and deterministic
    }
  });

  // The SDK automatically validates that response.text matches our CoderResponseSchema structure.
  // We can safely parse the response text as JSON.
  return JSON.parse(response.text);
}
