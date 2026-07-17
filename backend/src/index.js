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

// Log websocket connection statuses
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
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
    const { problemDescription, maxRounds = 4, jobId } = req.body;

    if (!problemDescription || problemDescription.trim() === '') {
      return res.status(400).json({ error: 'Problem description is required.' });
    }

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required for real-time tracking.' });
    }

    // Add debate job to queue with a custom client-generated jobId
    const job = await debateQueue.add(
      'debateJob',
      { problemDescription, maxRounds },
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
