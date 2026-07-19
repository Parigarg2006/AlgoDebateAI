import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { debateQueue, debateWorker } from './orchestrator/queue.js';

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

    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        query: `
          query questionContent($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
              content
              title
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

    return `Title: ${title}\n\nProblem Description:\n${cleanContent}`;
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
      const { executeCpp } = await import('./executor/cppExecutor.js');
      const execution = await executeCpp(code, [{ input: inputData, expectedOutput: '' }], language);
      const first = execution.results?.[0] || {};
      
      if (!execution.success && !execution.compileSuccess) {
        result = `[COMPILATION ERROR]\n${execution.compileError}`;
      } else if (first.status === 'COMPILE_ERROR') {
        result = `[COMPILATION ERROR]\n${first.error}`;
      } else if (first.status === 'RTE') {
        result = `[RUNTIME ERROR]\n${first.error}`;
      } else if (first.status === 'TLE') {
        result = `[TIMEOUT ERROR]\nExecution timed out.`;
      } else {
        result = `[SUCCESS]\nExecution Time: ${first.timeMs}ms\nOutput:\n${first.actualOutput}`;
      }

      socket.emit(`custom_test_result:${jobId}`, { result });

    } catch (err) {
      console.error('[Socket] Error running custom test:', err);
      socket.emit(`custom_test_result:${jobId}`, { result: `[ERROR] Execution failed: ${err.message}` });
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

    let finalProblemDescription = problemDescription;

    if (problemUrl && problemUrl.trim() !== '') {
      try {
        const fetchedDescription = await fetchLeetCodeProblem(problemUrl);
        if (problemDescription && problemDescription.trim() !== '') {
          finalProblemDescription = `${fetchedDescription}\n\nAdditional Input/Context:\n${problemDescription}`;
        } else {
          finalProblemDescription = fetchedDescription;
        }
      } catch (err) {
        console.warn('[API] LeetCode URL fetching failed, checking fallback:', err.message);
        if (!problemDescription || problemDescription.trim() === '') {
          return res.status(400).json({ error: `Failed to fetch LeetCode problem: ${err.message}` });
        }
      }
    }

    if (!finalProblemDescription || finalProblemDescription.trim() === '') {
      return res.status(400).json({ error: 'Problem description is required.' });
    }

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required for real-time tracking.' });
    }

    // Add debate job to queue with a custom client-generated jobId
    const job = await debateQueue.add(
      'debateJob',
      { problemDescription: finalProblemDescription, maxRounds, language, coderPrompt, criticPrompt, refinerPrompt },
      { jobId } // Instructs BullMQ to use the client-generated ID
    );

    console.log(`[API] Enqueued Job ${job.id} for debate.`);
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
