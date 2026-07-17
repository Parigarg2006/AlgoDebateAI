# Interview Prep Guide: Phase 2 (LLM API Integration & Prompts)

This guide is designed to help you prepare for system design and AI engineering interviews using the agent architectures we built in Phase 2.

---

## 1. Core Concepts Explained Simply

### Concept A: Why do we separate the Coder and the Critic?
* **The Problem (Confirmation Bias):** If a single agent writes code and is then asked: *"Is this correct?"*, it will almost always say *"Yes, it looks perfect."* This is because the same logical assumptions it used to write the bug will be used to review it.
* **The Solution:** We create a separate agent called the **Critic** with a completely different mindset. Its prompt instructs it: *"You are a harsh judge. Your only job is to find flaws."* By separating these roles, we bypass the model's confirmation bias.

---

### Concept B: What are Structured Outputs (JSON Schemas)?
* **Traditional Way:** The LLM returns free-form text. The developer writes code to parse it (e.g. using Regex to extract code between ` ```cpp ` and ` ``` `). If the LLM output changes by even one space, the parser breaks.
* **Our Way (Structured Outputs):** We define a **JSON Schema** (declaring keys, data types, and descriptions) and pass it to the Gemini API. The API's engine forces the LLM to output a valid JSON string that strictly conforms to our schema. 
* **Key Benefit:** Your backend code can immediately run `JSON.parse(response.text)` without worrying about syntax errors, markdown issues, or format inconsistencies.

---

### Concept C: What is LLM "Temperature"?
* **What it is:** Temperature is a parameter that controls the randomness of the model's output (ranging from `0.0` to `2.0`).
* **Low Temperature (e.g. `0.1`):** The model becomes highly deterministic. It selects the most probable, logical words. This is **critical for coding and math**, where correctness and structure are required.
* **High Temperature (e.g. `0.8` or `1.0`):** The model becomes creative, diverse, and random. This is great for brainstorming, writing stories, or generating creative ideas.

---

### Concept D: Context History & Self-Correction Loops
To fix a bug, the Coder Agent needs to know *what* went wrong. In our `generateDraft` function, we pass a `criticismHistory` array:
```javascript
// We build a transcript of previous rounds so the Coder learns from its mistakes
for (const history of criticismHistory) {
  prompt += `Round ${history.round} Code: ${history.code}\n`;
  prompt += `Errors/Bugs: ${history.criticism}\n`;
}
```
This is the heart of **Agentic Self-Correction**. Instead of a single call, we provide memory to let the model iterate.

---

## 2. Top Interview Questions & Answers

### Q1: What is "Confirmation Bias" in LLMs, and how does a Multi-Agent architecture solve it?
* **Answer:** Confirmation bias occurs when a model reviews its own generated content and fails to see its mistakes because it uses the same reasoning pathways. A Multi-Agent architecture solves this by separating concerns. We prompt one agent (the Coder) to write the code, and a separate agent (the Critic) with a distinct persona (a harsh evaluator) to actively break it. This division of labor leads to significantly higher success rates on logic tasks.

---

### Q2: Why did you use JSON Schemas (Structured Outputs) instead of parsing markdown?
* **Answer:** Standard text parsing (like using regular expressions to strip backticks) is brittle because LLMs are non-deterministic and their formatting can change. By passing a JSON Schema (`responseSchema`) to the Gemini API, the model is forced at the token-generation level to conform to the schema. This guarantees that the response is always structured, syntactically valid JSON, preventing runtime parsing crashes on our backend.

---

### Q3: Why is a low temperature setting (e.g., `0.1`) important for coder/critic agents?
* **Answer:** Coding and logic evaluation require precision, determinism, and structured output. A high temperature introduces randomness, which can cause the model to make silly syntax errors, hallucinate invalid API parameters, or violate the required JSON schema. Setting `temperature` to `0.1` ensures the model focuses on the most logical and optimal tokens.

---

### Q4: How does the Coder agent know what to correct in the second round of a debate?
* **Answer:** We feed the previous round's code draft, the sandbox execution logs (stdout/stderr/exit codes), and the Critic's specific feedback back into the Coder's prompt context. This history mimics a conversation where the Coder learns what broke (e.g., *"Your code returned 0 instead of -2 for negative values"*) and generates a patch targeting that specific issue.
