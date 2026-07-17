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
const CriticResponseSchema = {
  type: 'OBJECT',
  properties: {
    approved: {
      type: 'BOOLEAN',
      description: 'Set to true only if the code is optimal, correct, compiles without issues, and passes all edge cases. Set to false if there are compile issues, failing test cases, O(N^2) bottlenecks where O(N) is possible, or logic bugs.'
    },
    reasoning: {
      type: 'STRING',
      description: 'A detailed explanation of why the code is correct, or what specific bugs/edge-cases/performance issues you found.'
    },
    failingTestCase: {
      type: 'OBJECT',
      description: 'If approved is false, provide a test case that will fail on the current code implementation (must include both input and expectedOutput). Leave empty if approved is true.',
      properties: {
        input: {
          type: 'STRING',
          description: 'The stdin input designed to fail the code.'
        },
        expectedOutput: {
          type: 'STRING',
          description: 'The expected correct output.'
        }
      },
      required: ['input', 'expectedOutput']
    }
  },
  required: ['approved', 'reasoning']
};

/**
 * Critiques the Coder's solution based on problem description and sandbox execution results.
 * @param {string} problemDescription - The original coding task.
 * @param {string} code - The C++ code drafted by the Coder.
 * @param {Array<any>} [sandboxResults=[]] - Results from running test cases in the executor sandbox.
 * @returns {Promise<{approved: boolean, reasoning: string, failingTestCase?: {input: string, expectedOutput: string}}>}
 */
export async function critiqueCode(problemDescription, code, sandboxResults = []) {
  let prompt = `Problem Description:\n${problemDescription}\n\n`;
  prompt += `Coder's proposed C++ Code:\n${code}\n\n`;

  if (sandboxResults.length > 0) {
    prompt += `Sandbox Execution Results:\n`;
    sandboxResults.forEach((res, index) => {
      prompt += `Test Case ${index + 1}:\n`;
      prompt += `- Input fed to stdin: "${res.input}"\n`;
      prompt += `- Expected output from stdout: "${res.expectedOutput}"\n`;
      prompt += `- Actual output from stdout: "${res.actualOutput}"\n`;
      prompt += `- Status: ${res.status}\n`;
      if (res.error) {
        prompt += `- Error/Stderr: "${res.error}"\n`;
      }
      prompt += `\n`;
    });
  } else {
    prompt += `Note: No sandbox execution results are available yet. Review the code statically.\n`;
  }

  // Define the Critic persona: A strict competitive programming judge
  const systemInstruction = `
You are a harsh, meticulous competitive programming judge and code reviewer.
Your only job is to find bugs, edge case vulnerabilities, or performance/complexity bottlenecks in the provided C++ code.
Review guidelines:
1. Check for compilation errors (if sandbox results indicate compiler failures).
2. Check for logic errors: Are there any off-by-one errors? Is there potential for integer overflow?
3. Check for edge cases: How does the code handle empty arrays, N=0, N=1, negative numbers, extremely large numbers?
4. Check for time complexity: Is the code optimal? If the problem has N <= 10^5 and the code runs in O(N^2) using nested loops, reject it (approved = false) and explain that it will TLE (Time Limit Exceeded).
5. If you find a flaw, you must provide a concrete, failing test case in "failingTestCase" that proves the flaw.
6. If the code is correct, optimal, and passes all edge cases, set approved = true. Be extremely thorough; do not approve lazy or sub-optimal solutions.
  `.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: CriticResponseSchema,
      temperature: 0.1
    }
  });

  return JSON.parse(response.text);
}
