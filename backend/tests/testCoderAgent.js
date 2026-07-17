import { generateDraft } from '../src/agents/coderAgent.js';

async function run() {
  const problem = `
Write a C++ program that reads an integer N, followed by N integers.
It should output the sum of all the elements.
If N is less than or equal to 0, output 0.
  `;

  console.log('Asking Coder Agent to draft a solution...');
  console.log('Problem:', problem.trim());

  const draft = await generateDraft(problem);

  console.log('\n======================================');
  console.log('GENERATED CODE:');
  console.log('======================================');
  console.log(draft.code);
  console.log('======================================');

  console.log('\n======================================');
  console.log('GENERATED TEST CASES:');
  console.log('======================================');
  console.log(JSON.stringify(draft.testCases, null, 2));
  console.log('======================================');
}

run().catch(console.error);
