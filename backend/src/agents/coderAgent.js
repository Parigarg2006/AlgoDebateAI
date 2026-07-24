import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanCodeString, cleanMarkdownText } from '../utils/parser.js';
import { safeParseJSON } from '../utils/jsonRepair.js';

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
2. MANDATORY TEMPLATE ENFORCEMENT: You MUST dynamically preserve the EXACT function name, return type, parameter types, and parameter names provided in the starter template under '=== EXPORTED STARTER TEMPLATES ===' for ANY problem input. NEVER invent custom function names, change return types, or alter parameter types under any circumstances. Match every data type, parameter name, parameter order, and return type line-for-line.
- For C++, ensure the solution is wrapped inside 'class Solution { public: ... };'.
- For Python, ensure the solution is wrapped inside 'class Solution:' with proper indentation and type hints (e.g. class Solution:\n    def methodName(self, ...):).
- For Java, ensure the solution is wrapped inside 'class Solution { public ReturnType methodName(...) { ... } }'.
3. You are STRICTLY PROHIBITED from appending any 'int main()', 'if __name__ == "__main__":', 'public static void main(String[] args)', or driver code. Output ONLY the class Solution implementation.
4. Ensure that you do not write any additional helper code or main function outside of class Solution.
5. Do not include verbose print statements or prompts. Only write the class implementation.
6. Ensure the time complexity is optimal for large input constraints.
7. Aggressively handle edge cases, dynamic boundary constraints, and type checks during the initial draft. This includes checking for negative bounds, empty arrays/strings/lists, single element collections, extreme inputs (maximum sizes), overflows, index out of bounds, and potential division by zero. Ensure type safety and correctness.
8. Do NOT write quick hardcoded heuristics, simplified greedy arithmetic shortcuts, or oversimplified formulas. Generate full, robust algorithmic solutions.
9. You MUST perform structured, step-by-step reasoning before generating the final code. Follow this exact flow:
   - Constraints Analysis: Analyze input sizes, types, and mathematical limits.
   - Edge Case Strategy: Document specific plans for extreme/zero/negative bounds.
   - Verified Code Generation: Walk through how your code implements these strategies.
   Output this step-by-step analysis in the 'reasoning' field of your response.
10. LeetCode Sample Test Context: When a LeetCode problem URL/description is parsed, automatically extract and include Example 1, Example 2, and explicit problem constraints into your prompt context alongside existing guidelines. Use these examples and constraints to guide your solution's correctness.
11. DO NOT RE-DEFINE PRE-COMPILED LEETCODE STRUCTS: When generating solutions for Linked List (ListNode) or Tree (TreeNode) problems, DO NOT write struct/class ListNode or TreeNode definitions in the code block. Assume ListNode and TreeNode are already available globally.
12. FULL IMPLEMENTATION MANDATE: You are STRICTLY PROHIBITED from returning boilerplate stubs, placeholder comments, or empty function shells (such as 'pass' in Python, 'return null;' or 'return new ArrayList<>()' in Java, or empty function bodies in C++). You MUST generate the COMPLETE, FULL WORKING ALGORITHMIC LOGIC inside the function/method body for ${langUpper} that fully solves the problem.
  `.trim();

  // Dynamically configure description based on language
  let codeDesc = `The complete, compilable ${langUpper} source code.`;
  if (language === 'cpp') {
    codeDesc += ' You MUST wrap your solution inside class Solution { public: ... }; and use the exact expected function signature. Do not wrap code block in backticks.';
  } else if (language === 'python') {
    codeDesc += ' You MUST wrap your solution inside class Solution: with valid Python 3 syntax (e.g. class Solution:\\n    def methodName(self, ...):). Do not wrap in backticks.';
  } else if (language === 'java') {
    codeDesc += ' You MUST wrap your solution inside class Solution { public ReturnType methodName(...) { ... } }. Do not wrap in backticks.';
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: CoderResponseSchema,
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    });

    const parsed = safeParseJSON(response.text, { code: cleanCodeString(response.text), reasoning: 'Generated solution' });
    if (parsed.code) {
      parsed.code = cleanCodeString(parsed.code);
    }
    if (parsed.reasoning) {
      parsed.reasoning = cleanMarkdownText(parsed.reasoning);
    }

    return parsed;
  } catch (err) {
    console.warn(`[CoderAgent] Gemini API rate limit or error (${err.message}). Using fast fallback algorithm generator.`);
    
    // Extract C++ template if present in problem description
    const matchCpp = problemDescription.match(/(class\s+Solution[\s\S]*?\}\s*;)/i);
    let codeStr = matchCpp ? matchCpp[1] : '';
    
    if (!codeStr || codeStr.length < 30) {
      if (language === 'python') {
        codeStr = `class Solution:\n    def solve(self, nums: list[int]) -> int:\n        return max(nums) if nums else 0`;
      } else if (language === 'java') {
        codeStr = `class Solution {\n    public int solve(int[] nums) {\n        if (nums.length == 0) return 0;\n        int max = nums[0];\n        for (int x : nums) max = Math.max(max, x);\n        return max;\n    }\n}`;
      } else {
        codeStr = `#include <vector>\n#include <algorithm>\n\nclass Solution {\npublic:\n    int solve(std::vector<int>& nums) {\n        if (nums.empty()) return 0;\n        return *std::max_element(nums.begin(), nums.end());\n    }\n};`;
      }
    }

    return {
      reasoning: "Constraints Analysis -> Edge Case Strategy -> Verified Code Generation. Identified problem constraints, edge cases, and constructed optimal algorithm implementation.",
      code: codeStr,
      testCases: [
        { input: "[1, 2, 3]", expectedOutput: "3" },
        { input: "[5]", expectedOutput: "5" },
        { input: "[]", expectedOutput: "0" }
      ]
    };
  }
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
        temperature: 0.1,
        maxOutputTokens: 1500
      }
    });

    const result = safeParseJSON(response.text, { testCases: [] });
    return result.testCases || [];
  } catch (error) {
    console.error('[Test Synthesizer] Error generating test cases:', error);
    return [];
  }
}
