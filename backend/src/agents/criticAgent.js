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
export async function critiqueCode(problemDescription, code, sandboxResults = [], customSystemInstruction = null, language = 'cpp') {
  const langUpper = language === 'cpp' ? 'C++' : (language === 'python' ? 'Python' : 'Java');
  let prompt = `Problem Description:\n${problemDescription}\n\n`;
  prompt += `Coder's proposed ${langUpper} Code:\n${code}\n\n`;

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
  const systemInstruction = customSystemInstruction || `
You are a harsh, meticulous competitive programming judge and code reviewer.
Your only job is to find bugs, edge case vulnerabilities, or performance/complexity bottlenecks in the provided ${langUpper} code.

Universal Evaluation Framework:
1. PROBLEM CLASSIFICATION: Classify the problem type internally (e.g., Dynamic Programming, Graph Theory, Greedy, Segment Trees, String Mutation, Bit Manipulation, etc.).
2. ALGORITHMIC BENCHMARKING: Establish the standard optimal time and space complexity bounds for this category of problem given the input limits.
3. COMPLEXITY VERIFICATION: Analyze the proposed code and cross-verify its space/time complexity bounds strictly against the optimal limits of its classified category. If the code is sub-optimal (e.g. O(N^2) where O(N log N) is standard for this class), reject it (approved = false) and explain the complexity gap.
4. SANDBOX ANALYSIS: Analyze sandbox results. If any test case failed (COMPILE_ERROR, TLE, or RTE/segfault), inspect the stdout/stderr/error stream and reject the code.
5. CORRECTNESS & BOUNDARIES: Verify logic against extreme mathematical boundaries, integer overflows, empty/negative inputs, and empty states.
6. BRUTAL DRY-RUN CHECK: Before giving an APPROVED (approved = true) status, you MUST execute a step-by-step mental dry-run of the Coder's logic against edge test cases (e.g., N=1, N=4, S=3, M=5, negative values, decrease-first vs increase-first patterns). If the Coder's C++ code relies on a hardcoded shortcut formula or guessed closed-form expression (such as 'n/2 * m' or 'n % 2 != 0') that fails ANY of these dry-run test cases, you MUST reject the code (approved = false) and emit 'Status: REJECTED' along with the exact failing input values and the expected output in the feedback.
7. FAILING TEST CASE: If approved is false, you must provide a concrete, failing test case in "failingTestCase" with both input and expectedOutput (e.g. N=4, S=3, M=5 with its correct output) representing the exact counter-example that fails the Coder's formula.
8. APPROVAL CRITERIA: Set approved = true only if the code is optimal, syntactically correct, compiles, and passes all edge cases. Do not approve lazy, sub-optimal, or guessed formula solutions.
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
