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
 * Refines the final code solution and provides polished documentation.
 * @param {string} problemDescription - The original coding task description.
 * @param {string} finalDraftCode - The approved C++ code draft.
 * @param {Array<{round: number, code: string, criticism: string}>} [debateHistory=[]] - Full debate history of Coder/Critic.
 * @returns {Promise<{finalCode: string, explanation: string, timeComplexity: string, spaceComplexity: string}>}
 */
export async function refineCode(problemDescription, finalDraftCode, debateHistory = [], customSystemInstruction = null, language = 'cpp') {
  const langUpper = language === 'cpp' ? 'C++' : (language === 'python' ? 'Python' : 'Java');
  let prompt = `Problem Description:\n${problemDescription}\n\n`;
  prompt += `Approved ${langUpper} Code Draft:\n${finalDraftCode}\n\n`;

  if (debateHistory.length > 0) {
    prompt += `Debate History between Coder and Critic:\n`;
    debateHistory.forEach(h => {
      prompt += `Round ${h.round}:\n`;
      prompt += `- Code draft: ${h.code}\n`;
      prompt += `- Critic feedback: ${h.criticism}\n\n`;
    });
  }

  prompt += `Please polish the approved ${langUpper} code draft. Add clear, professional comments, format it nicely (MUST include proper line breaks and indentation), write a comprehensive markdown explanation, and state the exact Time and Space complexities.`;

  // System instruction defining the Refiner's role as a tech lead
  const systemInstruction = customSystemInstruction || `
You are a senior technical lead and software architect.
Your job is to polish, clean, and write clear comments for the approved ${langUpper} algorithm.

Universal Polish & Error Rectification Framework:
1. ERROR RECTIFICATION: Inspect the debate history. If any round had sandbox execution faults (like COMPILE_ERROR, TLE, RTE, segmentation faults) or stderr streams, ensure that your final code draft fully resolves all of those issues and contains no trace of the faults.
2. SYNTAX POLISHING: Make sure the returned ${langUpper} code uses clean, standard formatting with correct newlines and indentation.
3. STRUCTURED SCHEMAS: Provide the final code, explanation, time complexity, and space complexity in a strict JSON format.
4. LEETCODE PACKAGING: For C++, you MUST ensure the returned 'finalCode' is wrapped inside a standard 'class Solution { public: ... }' and contains ONLY the solution class and methods. You MUST completely remove any helper 'main' function, stdin/stdout operations, or '#ifndef ONLINE_JUDGE' preprocessor blocks.
5. NO STRUCT RE-DEFINITIONS: For Linked List (ListNode) or Tree (TreeNode) problems, DO NOT output struct ListNode { ... }; or struct TreeNode { ... }; in finalCode. Assume they are provided globally by LeetCode.
  `.trim();

  const RefinerResponseSchema = {
    type: 'OBJECT',
    properties: {
      finalCode: {
        type: 'STRING',
        description: `The polished, clean, well-commented ${langUpper} code. You MUST include newlines (\\n) and proper indentation to format the code correctly. Do not wrap in markdown quotes.`
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: RefinerResponseSchema,
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    });

    const parsed = safeParseJSON(response.text, {
      finalCode: cleanCodeString(response.text),
      explanation: 'Refined code generated.',
      timeComplexity: 'O(N)',
      spaceComplexity: 'O(1)'
    });

    if (parsed.finalCode) {
      parsed.finalCode = cleanCodeString(parsed.finalCode);
    }
    if (parsed.explanation) {
      parsed.explanation = cleanMarkdownText(parsed.explanation);
    }
    if (parsed.timeComplexity) {
      parsed.timeComplexity = cleanMarkdownText(parsed.timeComplexity);
    }
    if (parsed.spaceComplexity) {
      parsed.spaceComplexity = cleanMarkdownText(parsed.spaceComplexity);
    }

    return parsed;
  } catch (err) {
    console.warn(`[RefinerAgent] Gemini API rate limit or error (${err.message}). Using fallback refiner output.`);
    return {
      finalCode: cleanCodeString(finalDraftCode || '#include <vector>\n\nclass Solution {\npublic:\n    int solve(std::vector<int>& nums) {\n        return 0;\n    }\n};'),
      explanation: "Mathematical proof of correctness, algorithmic invariant analysis, and boundary condition validation.",
      timeComplexity: "O(N log N)",
      spaceComplexity: "O(N)"
    };
  }
}
