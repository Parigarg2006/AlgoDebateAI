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
2. You MUST strictly comply with the LeetCode starter templates. Locate the exact code snippet matching the active language under '=== EXPORTED STARTER TEMPLATES ===' in the problem description, and inject your solution logic STRICTLY inside that template. Do NOT change class names, function names, parameter names, parameter types, or return types. For C++, ensure the solution is wrapped inside 'class Solution { public: ... }' using the exact method name and parameter types specified (e.g. 'long long maximumValue(int n, int s, int m)').
3. For C++, you are STRICTLY PROHIBITED from appending any 'int main()', '#ifndef ONLINE_JUDGE', or standard I/O driver code. The output MUST end strictly with '};' right after the 'class Solution' block. Do NOT generate any test case parsing or driver main function.
4. Ensure that you do not write any additional helper code or main function outside of the class Solution. The final C++ code must end with '};'.
5. Do not include verbose print statements or prompts. Only write the class implementation.
6. Ensure the time complexity is optimal for large input constraints.
7. Aggressively handle edge cases, dynamic boundary constraints, and type checks during the initial draft. This includes checking for negative bounds, empty arrays/strings/lists, single element collections, extreme inputs (maximum sizes), overflows (e.g. use long long / 64-bit integers where required), index out of bounds, and potential division by zero. Ensure type safety and correctness.
8. Do NOT write quick hardcoded heuristics, simplified greedy arithmetic shortcuts, or oversimplified formulas. Specifically for alternating sequence problems, ABSOLUTELY FORBID greedy shortcuts, parity assumptions, or fast formulas like s + (n/2)*m. The Coder MUST generate full Dynamic Programming (DP) state-transition tables or explicit state machine simulations (or mathematically derived O(1) calculations directly from the DP relations: dp[i][UP] = dp[i-1][DOWN] + m and dp[i][DOWN] = dp[i-1][UP] - 1) to find optimal alternating sequence peaks. Ensure your code passes all general edge cases and boundary limits instead of fitting a single reference test case.
9. You MUST perform structured, step-by-step reasoning before generating the final code. Follow this exact flow:
   - Constraints Analysis: Analyze input sizes, types, and mathematical limits.
   - Edge Case Strategy: Document specific plans for extreme/zero/negative bounds.
   - Verified Code Generation: Walk through how your code implements these strategies.
   Output this step-by-step analysis in the 'reasoning' field of your response.
10. LeetCode Sample Test Context: When a LeetCode problem URL/description is parsed, automatically extract and include Example 1, Example 2, and explicit problem constraints into your prompt context alongside existing guidelines. Use these examples and constraints to guide your solution's correctness.
  `.trim();

  // Dynamically configure description based on language
  let codeDesc = `The complete, compilable ${langUpper} source code.`;
  if (language === 'cpp') {
    codeDesc += ' You MUST wrap your solution inside class Solution { public: ... } and use the exact expected function signature parsed from the description. You are STRICTLY PROHIBITED from appending any main() function, #ifndef ONLINE_JUDGE, or driver code. The code must end strictly with "};". Do not wrap code block in backticks.';
  } else if (language === 'python') {
    codeDesc += ' Ensure it reads inputs from sys.stdin or input() and prints to stdout. Do not wrap in backticks.';
  } else if (language === 'java') {
    codeDesc += ' Ensure it has a public class (Main or Solution) reading from Scanner or BufferedReader. Do not wrap in backticks.';
  }

  const CoderResponseSchema = {
    type: 'OBJECT',
    properties: {
      reasoning: {
        type: 'STRING',
        description: 'Structured step-by-step reasoning following: Constraints Analysis -> Edge Case Strategy -> Verified Code Generation.'
      },
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
    required: ['reasoning', 'code', 'testCases']
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
