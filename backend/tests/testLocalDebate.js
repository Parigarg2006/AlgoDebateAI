import { runLocalDebate } from '../src/orchestrator/localDebate.js';

async function run() {
  // We use the Maximum Subarray Sum problem. 
  // Naive implementations often fail when all elements are negative (returning 0 instead of the maximum single negative number).
  const problem = `
Given an integer N followed by N integers representing an array, find the maximum sum of a contiguous subarray.
Input: N on the first line, followed by N space-separated integers on the second line.
Output: Print a single integer representing the maximum subarray sum.
  `;

  console.log('Starting local debate solver...');
  const result = await runLocalDebate(problem, 3); // Run up to 3 rounds maximum

  console.log('\n==================================================');
  console.log('FINAL RESULTS FROM ALGORITHMIC DEBATE');
  console.log('==================================================');
  console.log(`Completed in ${result.rounds} rounds.`);
  console.log(`Time Complexity: ${result.timeComplexity}`);
  console.log(`Space Complexity: ${result.spaceComplexity}`);
  console.log('\n--------------------------------------------------');
  console.log('POLISHED C++ CODE:');
  console.log('--------------------------------------------------');
  console.log(result.finalCode);
  console.log('--------------------------------------------------');
  console.log('EXPLANATION:');
  console.log('--------------------------------------------------');
  console.log(result.explanation);
  console.log('==================================================');
}

run().catch(console.error);
