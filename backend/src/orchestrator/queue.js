import { Queue, Worker } from 'bullmq';
import { debateGraph } from './debateGraph.js';

// Connection options to Docker Redis running on port 6379
const connection = {
  host: 'localhost',
  port: 6379
};

/**
 * 1. Initialize the BullMQ Job Queue.
 * This object is used by our API server to push new debate jobs.
 */
export const debateQueue = new Queue('debateQueue', { connection });

/**
 * 2. Initialize the BullMQ Worker.
 * This background worker listens for new jobs in 'debateQueue',
 * processes them, updates the job progress in Redis, and stores the final result.
 */
export const debateWorker = new Worker(
  'debateQueue',
  async (job) => {
    const { problemDescription, maxRounds, language, coderPrompt, criticPrompt, refinerPrompt } = job.data;
    console.log(`\n[Worker] Picked up job ${job.id} from queue.`);

    // Keep an array of round-by-round logs to report progress
    const roundsHistory = [];

    // Invoke the LangGraph workflow, passing the initial state and our progress callback
    const finalState = await debateGraph.invoke({
      problemDescription,
      maxRounds,
      language,
      coderPrompt,
      criticPrompt,
      refinerPrompt,
      onProgress: async (roundProgress) => {
        roundsHistory.push(roundProgress);

        // Update the job progress in Redis so our frontend can read it in real time
        await job.updateProgress({
          status: 'IN_PROGRESS',
          currentRound: roundProgress.round,
          roundsHistory
        });

        console.log(`[Worker] Job ${job.id} -> Round ${roundProgress.round} processed and progress saved.`);
      }
    });

    const finalResult = finalState.finalResult;

    console.log(`[Worker] Job ${job.id} completed successfully.`);
    
    // Return values are stored in Redis under the job state automatically
    return {
      status: 'COMPLETED',
      finalResult
    };
  },
  { connection }
);

// Graceful worker shutdown listeners
debateWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job ? job.id : 'unknown'} failed with error:`, err);
});
