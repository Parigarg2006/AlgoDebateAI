import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { generateDraft, synthesizeTestCases } from '../agents/coderAgent.js';
import { executeCpp } from '../executor/cppExecutor.js';
import { critiqueCode } from '../agents/criticAgent.js';
import { refineCode } from '../agents/refinerAgent.js';
import { extractSampleTestCases } from '../utils/parser.js';

/**
 * 1. Define the LangGraph State Schema.
 * Annotation.Root defines the memory fields of the graph.
 */
export const DebateState = Annotation.Root({
  problemDescription: Annotation(),
  maxRounds: Annotation({ default: () => 4 }),
  currentRound: Annotation({
    reducer: (x, y) => y,
    default: () => 1
  }),
  code: Annotation({ reducer: (x, y) => y }),
  testCases: Annotation({ reducer: (x, y) => y }),
  sandboxResults: Annotation({ reducer: (x, y) => y }),
  criticApproved: Annotation({ reducer: (x, y) => y }),
  criticReasoning: Annotation({ reducer: (x, y) => y }),
  
  // Custom reducer to append round evaluations to the history
  criticismHistory: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  
  finalResult: Annotation({ reducer: (x, y) => y }),
  onProgress: Annotation({ reducer: (x, y) => y }), // Callback to report progress to BullMQ / Socket.io
  coderPrompt: Annotation({ reducer: (x, y) => y }),
  criticPrompt: Annotation({ reducer: (x, y) => y }),
  refinerPrompt: Annotation({ reducer: (x, y) => y }),
  language: Annotation({ reducer: (x, y) => y, default: () => 'cpp' })
});

/**
 * 2. Define Node: Coder Agent
 */
async function coderNode(state) {
  const lang = state.language || 'cpp';
  console.log(`\n[Node: Coder] Round ${state.currentRound} drafting (${lang.toUpperCase()})...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'coder', round: state.currentRound });
  }

  const draft = await generateDraft(state.problemDescription, state.criticismHistory, state.coderPrompt, lang);
  
  if (draft.reasoning) {
    console.log(`[Node: Coder] Chain-of-Thought Reasoning:\n${draft.reasoning}\n`);
  }

  let testCases = draft.testCases || [];
  
  // Extract sample test cases from problemDescription
  const sampleCases = extractSampleTestCases(state.problemDescription);
  if (sampleCases.length > 0) {
    console.log(`[Node: Coder] Extracted ${sampleCases.length} sample test cases from description.`);
  }

  // Inject strict LeetCode edge case benchmarks for alternating sequence problems
  const isAlternating = /alternating\s+sequence/i.test(state.problemDescription) || /seq\[0\]\s*=\s*s/i.test(state.problemDescription);
  const alternatingBenchmarks = isAlternating ? [
    { input: "3 7 7", expectedOutput: "14" },
    { input: "4 3 5", expectedOutput: "12" },
    { input: "1 5 10", expectedOutput: "5" },
    { input: "3\n7\n7", expectedOutput: "14" },
    { input: "4\n3\n5", expectedOutput: "12" },
    { input: "1\n5\n10", expectedOutput: "5" }
  ] : [];

  if (state.currentRound === 1) {
    console.log('[Node: Coder] Synthesizing 5 adversarial edge-cases dynamically...');
    const synthesized = await synthesizeTestCases(state.problemDescription, lang);
    if (synthesized && synthesized.length > 0) {
      testCases = [...alternatingBenchmarks, ...sampleCases, ...synthesized];
    } else {
      testCases = [...alternatingBenchmarks, ...sampleCases, ...testCases];
    }
  } else {
    testCases = [...alternatingBenchmarks, ...sampleCases, ...testCases];
  }

  // Deduplicate test cases by input to keep it clean
  const seenInputs = new Set();
  const dedupedCases = [];
  for (const tc of testCases) {
    if (tc && tc.input && !seenInputs.has(tc.input)) {
      seenInputs.add(tc.input);
      dedupedCases.push(tc);
    }
  }

  return {
    code: draft.code,
    testCases: dedupedCases
  };
}

/**
 * 3. Define Node: Sandbox Executor
 */
async function sandboxNode(state) {
  const lang = state.language || 'cpp';
  console.log(`[Node: Sandbox] Compiling and running tests in ${lang.toUpperCase()}...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'sandbox', round: state.currentRound, code: state.code });
  }

  const execution = await executeCpp(state.code, state.testCases, lang);
  
  let results = [];
  if (execution.success) {
    results = execution.results;
    results.forEach((t, i) => {
      console.log(`  - Test Case ${i + 1}: ${t.status} (${t.timeMs}ms)`);
    });
  } else {
    console.log(`  - Compilation FAILED!`);
    results = [
      {
        input: '',
        expectedOutput: '',
        actualOutput: '',
        status: 'COMPILE_ERROR',
        error: execution.compileError
      }
    ];
  }
  
  return { sandboxResults: results };
}

/**
 * 4. Define Node: Critic Agent
 */
async function criticNode(state) {
  const lang = state.language || 'cpp';
  console.log(`[Node: Critic] Reviewing solution logic in ${lang.toUpperCase()}...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'critic', round: state.currentRound, code: state.code });
  }

  const critique = await critiqueCode(state.problemDescription, state.code, state.sandboxResults, state.criticPrompt, lang);
  
  let approved = critique.approved;
  let reasoning = critique.reasoning;

  // Enforce Self-Correction Loop: If sandbox execution failed, force approved to false
  const sandboxFailed = state.sandboxResults && state.sandboxResults.some(r => r.status !== 'PASS');
  if (sandboxFailed) {
    approved = false;
    reasoning = `[SANDBOX FAILURE] The code did not pass all sandbox test cases.\n` + reasoning;
  }

  console.log(`[Node: Critic] Approved: ${approved}`);
  console.log(`[Node: Critic] Reasoning: ${reasoning.substring(0, 150)}...`);

  // Fire intermediate round progress callback with final critic evaluation data
  if (state.onProgress) {
    await state.onProgress({
      node: 'critic-done',
      round: state.currentRound,
      code: state.code,
      sandboxResults: state.sandboxResults,
      criticApproved: approved,
      criticReasoning: reasoning
    });
  }

  // Prepare updates to merge into state
  const updates = {
    criticApproved: approved,
    criticReasoning: reasoning
  };

  if (!approved) {
    let feedback = reasoning;
    const nextTestCases = [...state.testCases];

    // If the Critic supplied a breaking case, append it so the coder must solve it next round
    if (critique.failingTestCase) {
      feedback += `\n\nFailing Test Case:\nInput: "${critique.failingTestCase.input}"\nExpected Output: "${critique.failingTestCase.expectedOutput}"`;
      nextTestCases.push({
        input: critique.failingTestCase.input,
        expectedOutput: critique.failingTestCase.expectedOutput
      });
    }

    // Capture compile/runtime errors directly from Sandbox results to parse into the next prompt
    const errors = state.sandboxResults.filter(r => r.status !== 'PASS');
    if (errors.length > 0) {
      feedback += `\n\n[Generic Sandbox Error Stream]`;
      errors.forEach((err, idx) => {
        feedback += `\n- Test Case ${idx + 1} Status: ${err.status}`;
        if (err.input) feedback += `\n  Input: ${err.input}`;
        if (err.error) feedback += `\n  Stderr / Fault Stream:\n  ${err.error}`;
      });
    }

    // Pass as an array because the reducer will concatenate it to criticismHistory
    updates.criticismHistory = [{
      round: state.currentRound,
      code: state.code,
      criticism: feedback
    }];
    updates.testCases = nextTestCases;
    updates.currentRound = state.currentRound + 1;
  }

  return updates;
}

/**
 * 5. Define Node: Refiner Agent
 */
async function refinerNode(state) {
  const lang = state.language || 'cpp';
  console.log(`\n[Node: Refiner] Polishing final ${lang.toUpperCase()} solution...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'refiner', round: state.currentRound });
  }

  const refined = await refineCode(state.problemDescription, state.code, state.criticismHistory, state.refinerPrompt, lang);
  return { finalResult: refined };
}

/**
 * 6. Define Conditional Edge (Routing Logic)
 */
function routeAfterCritic(state) {
  const limit = Math.min(state.maxRounds || 4, 4);
  if (state.criticApproved || state.currentRound > limit) {
    return "refiner";
  }
  return "coder";
}

// 7. Assemble the StateGraph workflow
const workflow = new StateGraph(DebateState)
  .addNode("coder", coderNode)
  .addNode("sandbox", sandboxNode)
  .addNode("critic", criticNode)
  .addNode("refiner", refinerNode);

// Define standard transitions
workflow.addEdge(START, "coder");
workflow.addEdge("coder", "sandbox");
workflow.addEdge("sandbox", "critic");

// Define conditional decision transitions
workflow.addConditionalEdges("critic", routeAfterCritic, {
  coder: "coder",
  refiner: "refiner"
});

workflow.addEdge("refiner", END);

// Compile the completed graph
export const debateGraph = workflow.compile();
