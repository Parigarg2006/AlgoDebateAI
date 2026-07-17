import { debateQueue, debateWorker } from '../src/orchestrator/queue.js';

async function run() {
  const problem = `
Write a C++ program that reads an integer N, followed by N integers.
It should output the maximum value in the array.
If N is less than or equal to 0, output 0.
  `;

  console.log('1. Pushing coding job to BullMQ...');
  
  // Add job to the queue
  const job = await debateQueue.add('debateJob', {
    problemDescription: problem,
    maxRounds: 2
  });

  console.log(`Job added! ID: ${job.id}`);
  console.log('2. Polling progress from Redis in real-time...');

  // Set up polling interval to check the job status in Redis
  const interval = setInterval(async () => {
    const freshJob = await debateQueue.getJob(job.id);
    if (!freshJob) return;

    const state = await freshJob.getState();
    const progress = freshJob.progress;

    console.log(`\n[Poll] Job State: ${state}`);
    if (progress) {
      console.log(`[Poll] Current Round: ${progress.currentRound}`);
      
      // Print the last critic response to prove we are reading state updates
      const lastRound = progress.roundsHistory[progress.roundsHistory.length - 1];
      if (lastRound) {
        console.log(`[Poll] Last Round Critic Approved: ${lastRound.criticApproved}`);
      }
    }

    if (state === 'completed') {
      clearInterval(interval);
      
      // Fetch the returnvalue which was stored in Redis
      const result = freshJob.returnvalue;
      console.log('\n======================================');
      console.log('JOB COMPLETED! FINAL POLISHED C++ CODE:');
      console.log('======================================');
      console.log(result.finalResult.finalCode);
      console.log('======================================');
      
      // Close connections so the script exits cleanly
      await debateQueue.close();
      await debateWorker.close();
      process.exit(0);
    } else if (state === 'failed') {
      clearInterval(interval);
      console.error('Job failed!');
      await debateQueue.close();
      await debateWorker.close();
      process.exit(1);
    }
  }, 1500);
}

run().catch(console.error);
