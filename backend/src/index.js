import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { debateQueue, debateWorker } from './orchestrator/queue.js';
import { extractSampleTestCases } from './utils/parser.js';

const app = express();
const httpServer = createServer(app);

// Enable CORS for our React app (default Vite dev server runs on 5173)
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Initialize Socket.io attached to our HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

/**
 * Helper to fetch a LeetCode problem description using the public GraphQL API.
 * Extracts content slug directly from LeetCode URL, requests questionContent from GraphQL,
 * and formats the HTML result into clean markdown description text.
 */
async function fetchLeetCodeProblem(problemUrl) {
  try {
    const match = problemUrl.match(/problems\/([^/]+)/);
    if (!match) {
      throw new Error('Invalid LeetCode URL. Could not extract problem slug.');
    }
    const slug = match[1];
    console.log(`[LeetCode Parser] Fetching GraphQL content for slug: ${slug}`);

    // Intercept maximum-value-of-an-alternating-sequence mock slug
    if (slug === 'maximum-value-of-an-alternating-sequence' || slug === '3993' || slug.includes('alternating-sequence')) {
      return `Title: 3993. Maximum Value of an Alternating Sequence

Problem Description:
You are given three integers n, s, and m. A sequence seq of length n is considered valid if:
* Starting condition: seq[0] = s.
* Alternating condition: The sequence follows a "zig-zag" pattern, either seq[0] > seq[1] < seq[2] > seq[3] < ... or seq[0] < seq[1] > seq[2] < seq[3] > ...
* Adjacent constraint: For every adjacent pair, the absolute difference |seq[i] - seq[i - 1]| <= m.

The goal is to return the maximum possible element that can appear in any such valid sequence.

Constraints:
1 <= n, s <= 10^9
1 <= m <= 10^5

Example 1:
Input: n = 4, s = 3, m = 5
Output: 12
Explanation: A valid sequence is [3, 8, 7, 12], and the maximum element is 12.

Example 2:
Input: n = 2, s = 4, m = 3
Output: 7
Explanation: A valid sequence is [4, 7], and the maximum element is 7.

=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    long long maximumValue(int n, int s, int m) {
        
    }
};

Python:
class Solution:
    def maximumValue(self, n: int, s: int, m: int) -> int:

Java:
class Solution {
    public long maximumValue(int n, int s, int m) {
        
    }
}

Go:
func maximumValue(n int, s int, m int) int64 {
    
}

Rust:
impl Solution {
    pub fn maximum_value(n: i32, s: i32, m: i32) -> i64 {
        
    }
}
`;
    }

    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        query: `
          query questionData($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
              content
              title
              codeSnippets {
                lang
                langSlug
                code
              }
            }
          }
        `,
        variables: { titleSlug: slug }
      })
    });

    if (!response.ok) {
      throw new Error(`LeetCode API returned status ${response.status}`);
    }

    const data = await response.json();
    const question = data?.data?.question;
    if (!question || !question.content) {
      throw new Error('Failed to retrieve question content from LeetCode GraphQL API.');
    }

    // Clean HTML content to clean markdown-like text
    const title = question.title || slug;
    const cleanContent = question.content
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (m, code) => `\n\`\`\`\n${code.replace(/<[^>]*>/g, '')}\n\`\`\`\n`) // Keep code blocks
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (m, code) => `\`${code.replace(/<[^>]*>/g, '')}\``)
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<li[^>]*>/gi, '* ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<div[^>]*>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '') // Strip all other HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // Extract starter templates
    const codeSnippets = question.codeSnippets || [];
    const cppSnippet = codeSnippets.find(s => s.langSlug === 'cpp')?.code || '';
    const pythonSnippet = codeSnippets.find(s => s.langSlug === 'python3' || s.langSlug === 'python')?.code || '';
    const javaSnippet = codeSnippets.find(s => s.langSlug === 'java')?.code || '';
    const golangSnippet = codeSnippets.find(s => s.langSlug === 'golang')?.code || '';
    const rustSnippet = codeSnippets.find(s => s.langSlug === 'rust')?.code || '';

    let snippetsText = '\n\n=== EXPORTED STARTER TEMPLATES ===\n';
    if (cppSnippet) snippetsText += `C++:\n${cppSnippet}\n\n`;
    if (pythonSnippet) snippetsText += `Python:\n${pythonSnippet}\n\n`;
    if (javaSnippet) snippetsText += `Java:\n${javaSnippet}\n\n`;
    if (golangSnippet) snippetsText += `Go:\n${golangSnippet}\n\n`;
    if (rustSnippet) snippetsText += `Rust:\n${rustSnippet}\n\n`;

    return `Title: ${title}\n\nProblem Description:\n${cleanContent}${snippetsText}`;
  } catch (error) {
    console.error('[LeetCode Parser] Error fetching problem:', error);
    throw error;
  }
}

// Log websocket connection statuses
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  
  socket.on('run_custom_test', async (data) => {
    const { jobId, inputData, code, language } = data;
    console.log(`[Socket] Custom test requested for Job ${jobId}, Language ${language}`);
    
    // Broadcast compiling status to terminal
    socket.emit(`job-progress:${jobId}`, {
      roundsHistory: [{
        node: 'sandbox',
        round: 0,
        code: code,
        customOutput: '[SYSTEM] Compiling custom test case in Sandbox...'
      }]
    });

    try {
      let result;
      let isFailed = false;
      const { executeCpp } = await import('./executor/cppExecutor.js');
      const execution = await executeCpp(code, [{ input: inputData, expectedOutput: '' }], language);
      const first = execution.results?.[0] || {};
      
      if (!execution.success && !execution.compileSuccess) {
        result = `[COMPILATION ERROR]\n${execution.compileError}`;
        isFailed = true;
      } else if (first.status === 'COMPILE_ERROR') {
        result = `[COMPILATION ERROR]\n${first.error}`;
        isFailed = true;
      } else if (first.status === 'RTE') {
        result = `[RUNTIME ERROR]\n${first.error}`;
        isFailed = true;
      } else if (first.status === 'TLE') {
        result = `[TIMEOUT ERROR]\nExecution timed out.`;
        isFailed = true;
      } else {
        result = `[SUCCESS]\nExecution Time: ${first.timeMs}ms\nOutput:\n${first.actualOutput}`;
      }

      if (isFailed) {
        socket.emit(`job-progress:${jobId}`, {
          roundsHistory: [
            {
              node: 'sandbox',
              round: 0,
              code: code,
              customOutput: result
            },
            {
              node: 'sandbox',
              round: 0,
              code: code,
              customOutput: '⚠️ Custom Test Failed -> Re-triggering Agent Debate'
            }
          ]
        });
      }

      socket.emit(`custom_test_result:${jobId}`, { result, isFailed });

    } catch (err) {
      console.error('[Socket] Error running custom test:', err);
      socket.emit(`custom_test_result:${jobId}`, { result: `[ERROR] Execution failed: ${err.message}`, isFailed: true });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ----------------------------------------------------
// BULLMQ WORKER EVENT LISTENERS -> WEBSOCKET BROADCAST
// ----------------------------------------------------

// 1. Listen for background progress updates (e.g. at the end of each round)
debateWorker.on('progress', (job, progress) => {
  console.log(`[Socket] Broadcasting progress update for Job ${job.id}`);
  io.emit(`job-progress:${job.id}`, progress);
});

// 2. Listen for job completions
debateWorker.on('completed', (job, result) => {
  console.log(`[Socket] Broadcasting completion for Job ${job.id}`);
  io.emit(`job-completed:${job.id}`, result);
});

// 3. Listen for job failures
debateWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job ? job.id : 'unknown'} failed:`, err);
  if (job) {
    io.emit(`job-failed:${job.id}`, { error: err.message });
  }
});

// ----------------------------------------------------
// EXPRESS HTTP API ROUTES
// ----------------------------------------------------

/**
 * POST /api/debate
 * Accepts problemDescription and maxRounds.
 * Pushes job to BullMQ queue and immediately returns the jobId.
 */
app.post('/api/debate', async (req, res) => {
  try {
    const { problemDescription, problemUrl, maxRounds = 4, jobId, language = 'cpp', coderPrompt, criticPrompt, refinerPrompt } = req.body;
    const maxRoundsClamped = Math.min(Number(maxRounds) || 4, 4);

    let finalProblemDescription = problemDescription || '';
    let urlToFetch = '';
    let extractedTitle = '';
    let inferRequirements = false;

    // Helper to strip markdown formatting and sanitize special characters
    function stripMarkdown(text) {
      if (!text) return '';
      return text
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // Strip invalid control characters
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1') // [text](url) -> text
        .replace(/^#+\s+/gm, '') // headers
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim();
    }

    // Helper to extract LeetCode URL from a string
    function extractLeetCodeUrl(text) {
      if (!text) return null;
      const urlRegex = /(https?:\/\/(?:www\.)?leetcode\.com\/problems\/[a-zA-Z0-9-]+)/i;
      const match = text.match(urlRegex);
      return match ? match[1] : null;
    }

    // Helper to extract Markdown LeetCode link
    function extractMarkdownLink(text) {
      if (!text) return null;
      const mdRegex = /\[([^\]]+)\]\((https?:\/\/(?:www\.)?leetcode\.com\/problems\/[a-zA-Z0-9-]+)\)/i;
      const match = text.match(mdRegex);
      if (match) {
        return { title: match[1], url: match[2] };
      }
      return null;
    }

    // 1. Scan problemUrl and problemDescription for markdown links or plain URLs
    const urlFromInputUrl = extractLeetCodeUrl(problemUrl);
    const mdFromInputUrl = extractMarkdownLink(problemUrl);

    const urlFromDesc = extractLeetCodeUrl(problemDescription);
    const mdFromDesc = extractMarkdownLink(problemDescription);

    if (mdFromInputUrl) {
      urlToFetch = mdFromInputUrl.url;
      extractedTitle = mdFromInputUrl.title;
    } else if (mdFromDesc) {
      urlToFetch = mdFromDesc.url;
      extractedTitle = mdFromDesc.title;
    } else if (urlFromInputUrl) {
      urlToFetch = urlFromInputUrl;
    } else if (urlFromDesc) {
      urlToFetch = urlFromDesc;
    }

    // 2. Determine final problem description and inference requirements
    let hasValidFetch = false;
    if (urlToFetch) {
      try {
        console.log(`[API] Attempting to fetch LeetCode problem from extracted URL: ${urlToFetch}`);
        const fetchedDescription = await fetchLeetCodeProblem(urlToFetch);
        hasValidFetch = true;
        
        let combined = fetchedDescription;
        if (extractedTitle) {
          combined = `Title: ${stripMarkdown(extractedTitle)}\n\n${combined}`;
        }
        
        // Clean problem description inputs
        const cleanDesc = stripMarkdown(problemDescription);
        const cleanUrlInput = stripMarkdown(problemUrl);

        // Include any additional contextual inputs provided by the user
        let extraContext = '';
        if (cleanDesc && !cleanDesc.includes(urlToFetch)) {
          extraContext += `\n\nAdditional Description Context:\n${cleanDesc}`;
        }
        if (cleanUrlInput && !cleanUrlInput.includes(urlToFetch)) {
          extraContext += `\n\nAdditional Input Context:\n${cleanUrlInput}`;
        }
        finalProblemDescription = combined + extraContext;
      } catch (err) {
        console.warn('[API] Extracted LeetCode URL fetching failed, falling back to text inputs:', err.message);
      }
    }

    if (!hasValidFetch) {
      // If we couldn't fetch from LeetCode GraphQL, we strip markdown and use raw input text directly
      const cleanDesc = stripMarkdown(problemDescription);
      const cleanUrlInput = stripMarkdown(problemUrl);
      
      let combinedText = '';
      if (cleanUrlInput) {
        combinedText += cleanUrlInput;
      }
      if (cleanDesc) {
        combinedText += (combinedText ? '\n\n' : '') + cleanDesc;
      }
      
      finalProblemDescription = combinedText;
      inferRequirements = true;
    }

    // 3. Ensure we have at least some input description text
    if (!finalProblemDescription || finalProblemDescription.trim() === '') {
      return res.status(400).json({ error: 'Problem title or description is required.' });
    }

    // Extract sample cases and append them explicitly to the context
    const sampleCases = extractSampleTestCases(finalProblemDescription);
    if (sampleCases.length > 0) {
      finalProblemDescription += `\n\n=== EXTRACTED SAMPLE TEST CASES ===\n`;
      sampleCases.forEach((tc, idx) => {
        finalProblemDescription += `Sample ${idx + 1}:\nInput: ${tc.input}\nExpected Output: ${tc.expectedOutput}\n\n`;
      });
    }

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required for real-time tracking.' });
    }

    // Add debate job to queue with a custom client-generated jobId
    const job = await debateQueue.add(
      'debateJob',
      { problemDescription: finalProblemDescription, maxRounds: maxRoundsClamped, language, coderPrompt, criticPrompt, refinerPrompt, inferRequirements },
      { jobId } // Instructs BullMQ to use the client-generated ID
    );

    console.log(`[API] Enqueued Job ${job.id} for debate. (inferRequirements: ${inferRequirements})`);
    return res.status(202).json({ jobId: job.id });

  } catch (err) {
    console.error('[API] Error submitting debate:', err);
    return res.status(500).json({ error: 'Internal Server Error.' });
  }
});

/**
 * GET /api/debate/:jobId
 * Fetches the current state, progress, and results of a job.
 * Helps the client recover state if the browser page is refreshed.
 */
app.get('/api/debate/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await debateQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const state = await job.getState();
    const progress = job.progress;
    const result = job.returnvalue;

    return res.json({
      jobId: job.id,
      state,
      progress,
      result
    });

  } catch (err) {
    console.error('[API] Error fetching job status:', err);
    return res.status(500).json({ error: 'Internal Server Error.' });
  }
});

// Start the server on port 5000
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`AlgoDebate AI Backend Server running at:`);
  console.log(`http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
