import { refineCode } from '../src/agents/refinerAgent.js';

async function run() {
  const problem = `
Write a C++ program that reads N, followed by N integers, and outputs the sum.
  `;

  const approvedDraft = `
#include <iostream>
using namespace std;
int main() {
    int n;
    if (!(cin >> n)) return 0;
    if (n <= 0) { cout << 0 << endl; return 0; }
    long long s = 0;
    for(int i=0; i<n; ++i) {
        long long val;
        cin >> val;
        s += val;
    }
    cout << s << endl;
    return 0;
}
  `;

  console.log('Sending approved draft to Refiner Agent...');
  const polished = await refineCode(problem, approvedDraft);

  console.log('\n======================================');
  console.log('POLISHED FINAL CODE:');
  console.log('======================================');
  console.log(polished.finalCode);
  console.log('======================================');

  console.log('\n======================================');
  console.log('EXPLANATION:');
  console.log('======================================');
  console.log(polished.explanation);
  console.log('======================================');

  console.log(`\nTime Complexity: ${polished.timeComplexity}`);
  console.log(`Space Complexity: ${polished.spaceComplexity}`);
}

run().catch(console.error);
