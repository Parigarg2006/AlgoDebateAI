import { critiqueCode } from '../src/agents/criticAgent.js';

async function run() {
  const problem = `
Write a C++ program that finds the maximum element in an array of N integers.
Input: First line contains N, the next line contains N space-separated integers.
Output: Print the maximum value.
  `;

  // This C++ code has a bug: it initializes maxVal to 0. 
  // If the input contains only negative integers (e.g. -5, -3, -10), it will output 0 instead of -3.
  const buggyCode = `
#include <iostream>
using namespace std;
int main() {
    int n;
    if (!(cin >> n)) return 0;
    int maxVal = 0; // BUG: Should initialize to a very small number or the first element
    for (int i = 0; i < n; ++i) {
        int x;
        cin >> x;
        if (x > maxVal) {
            maxVal = x;
        }
    }
    cout << maxVal << endl;
    return 0;
}
  `;

  // We mock a sandbox report showing that a positive case passed, but a negative case failed
  const sandboxResults = [
    {
      input: '3\n5 8 2\n',
      expectedOutput: '8',
      actualOutput: '8\n',
      status: 'PASS',
      error: ''
    },
    {
      input: '3\n-5 -8 -2\n',
      expectedOutput: '-2',
      actualOutput: '0\n',
      status: 'FAIL',
      error: ''
    }
  ];

  console.log('Sending buggy C++ code and test logs to Critic Agent...');
  const evaluation = await critiqueCode(problem, buggyCode, sandboxResults);

  console.log('\n======================================');
  console.log('CRITIC EVALUATION RESULT:');
  console.log('======================================');
  console.log(`Approved: ${evaluation.approved}`);
  console.log(`Reasoning:\n${evaluation.reasoning}`);
  
  if (evaluation.failingTestCase) {
    console.log('--------------------------------------');
    console.log('Generated Breaking Test Case:');
    console.log('Input fed to stdin:', JSON.stringify(evaluation.failingTestCase.input));
    console.log('Expected output:', JSON.stringify(evaluation.failingTestCase.expectedOutput));
  }
  console.log('======================================');
}

run().catch(console.error);
