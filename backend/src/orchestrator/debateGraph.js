import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { generateDraft } from '../agents/coderAgent.js';
import { executeCpp } from '../executor/cppExecutor.js';
import { critiqueCode } from '../agents/criticAgent.js';
import { refineCode } from '../agents/refinerAgent.js';

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
  onProgress: Annotation({ reducer: (x, y) => y }) // Callback to report progress to BullMQ / Socket.io
});

/**
 * 2. Define Node: Coder Agent
 */
async function coderNode(state) {
  console.log(`\n[Node: Coder] Round ${state.currentRound} drafting...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'coder', round: state.currentRound });
  }

  const draft = await generateDraft(state.problemDescription, state.criticismHistory);
  return {
    code: draft.code,
    testCases: draft.testCases
  };
}

/**
 * 3. Define Node: Sandbox Executor
 */
async function sandboxNode(state) {
  console.log(`[Node: Sandbox] Compiling and running tests in C++...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'sandbox', round: state.currentRound, code: state.code });
  }

  const execution = await executeCpp(state.code, state.testCases);
  
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
  console.log(`[Node: Critic] Reviewing solution logic...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'critic', round: state.currentRound, code: state.code });
  }

  const critique = await critiqueCode(state.problemDescription, state.code, state.sandboxResults);
  console.log(`[Node: Critic] Approved: ${critique.approved}`);
  console.log(`[Node: Critic] Reasoning: ${critique.reasoning.substring(0, 150)}...`);

  // Fire intermediate round progress callback with final critic evaluation data
  if (state.onProgress) {
    await state.onProgress({
      node: 'critic-done',
      round: state.currentRound,
      code: state.code,
      sandboxResults: state.sandboxResults,
      criticApproved: critique.approved,
      criticReasoning: critique.reasoning
    });
  }

  // Prepare updates to merge into state
  const updates = {
    criticApproved: critique.approved,
    criticReasoning: critique.reasoning
  };

  if (!critique.approved) {
    let feedback = critique.reasoning;
    const nextTestCases = [...state.testCases];

    // If the Critic supplied a breaking case, append it so the coder must solve it next round
    if (critique.failingTestCase) {
      feedback += `\n\nFailing Test Case:\nInput: "${critique.failingTestCase.input}"\nExpected Output: "${critique.failingTestCase.expectedOutput}"`;
      nextTestCases.push({
        input: critique.failingTestCase.input,
        expectedOutput: critique.failingTestCase.expectedOutput
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
  console.log(`\n[Node: Refiner] Polishing final C++ solution...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'refiner', round: state.currentRound });
  }

  const refined = await refineCode(state.problemDescription, state.code, state.criticismHistory);
  return { finalResult: refined };
}

/**
 * 6. Define Conditional Edge (Routing Logic)
 */
function routeAfterCritic(state) {
  if (state.criticApproved || state.currentRound > state.maxRounds) {
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
