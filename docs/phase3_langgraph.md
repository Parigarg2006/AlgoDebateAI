# Interview Prep Guide: Phase 3 (The LangGraph Framework)

This guide is designed to help you prepare for system design and AI engineering interviews, focusing specifically on building agent workflows using the **LangGraph** framework.

---

## 1. Core Concepts Explained Simply

### Concept A: What is LangGraph?
* **The Analogy:** Imagine you are writing a flowchart for a customer service hotline. If the customer presses 1, send them to Billing. If they press 2, send them to Tech Support. Tech Support can transfer them back to Billing.
* **In Code:** Standard LLM pipelines are linear (A $\rightarrow$ B $\rightarrow$ C). **LangGraph** is a framework that allows you to build **cycles** (loops) where agents can pass data back and forth dynamically based on logical rules, modeled as a directed graph.

---

### Concept B: State, Annotations, and Reducers
In LangGraph, all nodes share a single global state. When a node completes, it returns updates. LangGraph merges these updates into the state.

How those updates are merged is determined by **Reducers**:
1. **Overwriting (Default):** The new value completely replaces the old value. Used for things like `code` or `criticApproved`.
2. **Appending/Reducing:** We define a custom function to merge values. For example, for `criticismHistory`:
   ```javascript
   criticismHistory: Annotation({
     reducer: (oldState, newUpdate) => oldState.concat(newUpdate),
     default: () => []
   })
   ```
   * **Why this is critical:** Whenever a node returns `{ criticismHistory: [newFeedback] }`, LangGraph automatically appends it to the existing array, preserving the memory of previous debate rounds.

---

### Concept C: Nodes and Edges
* **Nodes:** Any JavaScript function that takes the current state and returns updates. In our app: `coderNode`, `sandboxNode`, `criticNode`, `refinerNode`.
* **Edges:** Tell LangGraph how to navigate.
  * **Normal Edges:** Simple links. For example, after the Coder writes code, it *always* goes to the Sandbox: `workflow.addEdge("coder", "sandbox")`.
  * **Conditional Edges:** Routing functions. After the Critic evaluates, we check if the code is approved. If yes, route to `refiner`; if no, route back to `coder`.

---

## 2. Top Interview Questions & Answers

### Q1: What is the benefit of using LangGraph over a custom-written `while` or `for` loop?
* **Answer:** While a `for` loop works for simple cases, it does not scale. LangGraph provides built-in state management, schema validation (using annotations), support for parallel node execution, and checkpointing. Checkpointing automatically saves the state to a database after every node. If the server crashes mid-execution, LangGraph can resume exactly where it was interrupted, which is essential for heavy, production-grade agent workflows.

---

### Q2: What is a Reducer in LangGraph state, and why is it useful?
* **Answer:** A Reducer is a custom function defined inside an Annotation that determines how a node's return value merges with the global graph state. By default, LangGraph overwrites state keys. A reducer allows us to define custom accumulation logic (such as appending new elements to an array of chat history or aggregating statistical counters), preventing nodes from accidentally wiping out historical context.

---

### Q3: Explain how conditional edges work in LangGraph.
* **Answer:** A conditional edge routes execution to different nodes dynamically based on the current state. It takes three parameters: the starting node, a routing function, and a mapping object. The routing function reads the state (e.g. `state.criticApproved`) and returns a key (e.g. `"coder"` or `"refiner"`). LangGraph maps this key to the target node using the mapping object and transfers execution control.

---

### Q4: What are the `START` and `END` constants in LangGraph?
* **Answer:** `START` and `END` are reserved node identifiers in LangGraph.
  * `START` is the entry point of the graph. We draw an edge from `START` to our first node (e.g., `coder`) to define where execution begins.
  * `END` is the exit point. Drawing an edge to `END` tells the LangGraph compiler that the workflow is finished and the graph should return its final state to the caller.
