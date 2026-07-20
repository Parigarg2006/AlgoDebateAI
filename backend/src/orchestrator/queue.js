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
    console.log(`\n[Worker] Picked up job ${job.id} from queue.`);
    const roundsHistory = [];
    
    try {
      const { problemDescription, maxRounds, language, coderPrompt, criticPrompt, refinerPrompt, inferRequirements } = job.data;

      // Invoke the LangGraph workflow, passing the initial state and our progress callback
      const finalState = await debateGraph.invoke({
        problemDescription,
        maxRounds,
        language,
        coderPrompt,
        criticPrompt,
        refinerPrompt,
        inferRequirements,
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
    } catch (err) {
      console.error(`[Worker] Job ${job.id} execution failed:`, err);
      
      // Save failure status and details in job progress for real-time frontend reporting
      await job.updateProgress({
        status: 'FAILED',
        error: err.message || String(err),
        roundsHistory
      });
      
      throw err; // Let BullMQ mark the job as failed
    }
  },
  { connection }
);

// Graceful worker shutdown listeners
debateWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job ? job.id : 'unknown'} failed with error:`, err);
});
