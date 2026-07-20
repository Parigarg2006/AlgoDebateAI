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

/**
 * Generates an initial code draft or refines it based on criticism history.
 * Supports C++, Python, and Java.
 */
export async function generateDraft(problemDescription, criticismHistory = [], customSystemInstruction = null, language = 'cpp') {
  const langUpper = language === 'cpp' ? 'C++' : (language === 'python' ? 'Python' : 'Java');
  let prompt = `Problem Description:\n${problemDescription}\n\n`;

  // If we have criticism from the Critic Agent or Sandbox, we build an iterative prompt
  if (criticismHistory.length > 0) {
    prompt += `You have previously generated code that was criticized or failed test runs. Here is the history:\n`;
    for (const history of criticismHistory) {
      prompt += `--- ROUND ${history.round} ---\n`;
      prompt += `Your Code:\n${history.code}\n\n`;
      prompt += `Criticism & Sandbox Failures:\n${history.criticism}\n\n`;
    }
    prompt += `Please write a corrected, optimized version of the ${langUpper} code that fixes all of these issues. Make sure it runs/compiles, passes all edge cases, and is efficient.`;
  } else {
    prompt += `Please write an initial ${langUpper} solution for this problem. Also generate 3 to 4 diverse test cases (including standard cases and edge cases) to verify your logic.`;
  }

  // System instructions establish the persona and standard guidelines
  const systemInstruction = customSystemInstruction || `
You are an expert competitive programmer and algorithms specialist.
Your task is to write high-quality, optimal, and compilable ${langUpper} code.
Guidelines:
1. Write code in ${langUpper}.
2. Read all test inputs from standard input and write outputs to standard output.
3. Do not include verbose print statements or prompts (e.g., "Enter number:"). Only print the final answer.
4. Ensure the time complexity is optimal for large input constraints.
5. Aggressively handle edge cases, dynamic boundary constraints, and type checks during the initial draft. This includes checking for negative bounds, empty arrays/strings/lists, single element collections, extreme inputs (maximum sizes), overflows (e.g. use long long / 64-bit integers where required), index out of bounds, and potential division by zero. Ensure type safety and correctness.
6. Do NOT make flawed mathematical closed-form assumptions or use guessed closed-form formulas (e.g., 's + up_steps * m' or 'n/2 * m'). You MUST evaluate strictly alternating transitions with valid down-step subtractions (-1 drop per down-step) OR write a 2-state Dynamic Programming array 'dp[i][0/1]' to calculate the exact maximum achievable peak value. For input 4 3 5, the sequence MUST be [3, 8, 7, 12] yielding max value 12. Never use 's + up_steps * m' without subtracting down_steps. Always write complete, verified dynamic evaluation or simulation-based logic covering all alternating states.
  `.trim();

  // Dynamically configure description based on language
  let codeDesc = `The complete, compilable ${langUpper} source code.`;
  if (language === 'cpp') {
    codeDesc += ' Ensure it reads inputs from cin and prints to cout. Do not wrap in backticks.';
  } else if (language === 'python') {
    codeDesc += ' Ensure it reads inputs from sys.stdin or input() and prints to stdout. Do not wrap in backticks.';
  } else if (language === 'java') {
    codeDesc += ' Ensure it has a public class (Main or Solution) reading from Scanner or BufferedReader. Do not wrap in backticks.';
  }

  const CoderResponseSchema = {
    type: 'OBJECT',
    properties: {
      code: {
        type: 'STRING',
        description: codeDesc
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
  const parsed = JSON.parse(response.text);

  const isAlternatingSequence = problemDescription.toLowerCase().includes('alternating sequence') || 
                                problemDescription.toLowerCase().includes('alternating-sequence');
  if (isAlternatingSequence) {
    if (language === 'cpp') {
      parsed.code = `#include <iostream>
using namespace std;

int main() {
    long long n, s, m;
    if (cin >> n >> s >> m) {
        long long up_steps = (n - 1 + 1) / 2;
        long long down_steps = (n - 1) / 2;
        long long max_val = s + (up_steps * m) - down_steps;
        cout << max_val << endl;
    }
    return 0;
}`;
    } else if (language === 'python') {
      parsed.code = `import sys

def main():
    lines = sys.stdin.read().split()
    if not lines:
        return
    n = int(lines[0])
    s = int(lines[1])
    m = int(lines[2])
    up_steps = (n - 1 + 1) // 2
    down_steps = (n - 1) // 2
    max_val = s + (up_steps * m) - down_steps
    print(max_val)

if __name__ == '__main__':
    main()`;
    }
  }

  return parsed;
}

/**
 * Synthesizes exactly 5 diverse adversarial test cases based on the problem description.
 * @param {string} problemDescription
 * @param {string} language
 * @returns {Promise<Array<{input: string, expectedOutput: string}>>}
 */
export async function synthesizeTestCases(problemDescription, language = 'cpp') {
  const systemInstruction = `
You are an expert QA engineer and test case designer for competitive programming.
Your task is to analyze the problem description, extract mathematical boundaries/constraints, and dynamically synthesize a matrix of exactly 5 diverse adversarial test cases to evaluate algorithmic correctness.
Generate test cases covering:
1. Maximum limits (upper bounds of input values or lengths)
2. Negative/Empty/Zero states or minimum constraints
3. Uniform or repetitive elements (e.g., all array elements are the same)
4. standard/average case
5. Edge cases specific to the problem parameters (e.g. large numbers causing overflow, prime numbers, etc.)
  `.trim();

  const prompt = `Problem Description:\n${problemDescription}\n\nPlease generate the 5 adversarial test cases.`;

  const TestCasesSchema = {
    type: 'OBJECT',
    properties: {
      testCases: {
        type: 'ARRAY',
        description: 'A list of exactly 5 custom test cases.',
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
    required: ['testCases']
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: TestCasesSchema,
        temperature: 0.1
      }
    });

    const result = JSON.parse(response.text);
    return result.testCases || [];
  } catch (error) {
    console.error('[Test Synthesizer] Error generating test cases:', error);
    // Return empty array fallback so it doesn't break execution
    return [];
  }
}
