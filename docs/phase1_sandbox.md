# Interview Prep Guide: Phase 1 (The C++ Sandbox Executor)

This guide is designed to help you prepare for software engineering interviews using the code we built in Phase 1. It explains all operating system and backend development concepts from absolute scratch.

---

## 1. Core Concepts Explained Simply

### Concept A: What is a "Sandbox" and why do we need it?
* **Real-World Analogy:** Imagine you run a test laboratory. You don't test dangerous chemical reactions directly on your main desk; you test them inside a sealed containment chamber.
* **In Code:** An LLM generates C++ code that is completely untrusted. If we run it directly inside our main backend program:
  1. An infinite loop in the C++ code would consume 100% CPU and freeze our backend.
  2. A C++ crash (like segmentation fault) would crash our entire Node.js server.
* **Our Solution:** We run the C++ code as a **Child Process** (a separate isolated sandbox program). If it crashes or freezes, it only kills that specific child process, keeping our backend alive and healthy.

---

### Concept B: Child Processes (`exec` vs `spawn` in Node.js)
In Node.js, the `child_process` module allows us to run terminal commands. There are two primary methods we used:

#### 1. `exec()` (Used for Compiling)
* **What it does:** Runs a command in a shell, waits for it to finish completely, buffers all the output in memory, and returns it.
* **Why we used it for compilation:** Compiling (`g++`) is a "run-and-done" task. It either succeeds or fails. The output logs (compiler errors) are small, so buffering them is fine.
* **Syntax used:** `exec(compileCmd, (error, stdout, stderr) => { ... })`

#### 2. `spawn()` (Used for Running the Code)
* **What it does:** Starts a process immediately as a stream. It doesn't wait for the process to finish or buffer any output. Instead, it fires events as data arrives.
* **Why we used it for execution:**
  * We need to **interact** with the C++ program (write inputs to its standard input *while* it runs).
  * If the program runs forever, `exec()` would buffer infinitely and run out of memory. With `spawn()`, we can actively monitor the time and kill the process mid-execution.

---

### Concept C: Streams (`stdin`, `stdout`, `stderr`)
Every program in an operating system has three standard communications channels (called Streams):
1. **`stdin` (Standard Input):** The stream of data going **into** the program (like typing on a keyboard).
2. **`stdout` (Standard Output):** The normal output stream going **out** of the program (like printing with `cout` or `console.log`).
3. **`stderr` (Standard Error):** A dedicated stream for error messages (separate from standard output so errors don't get mixed with correct data).

In Node.js, we feed inputs into the C++ binary by writing to its `child.stdin`:
```javascript
child.stdin.write(input);
child.stdin.end(); // Telling the program "we are done sending inputs"
```
And we listen for output:
```javascript
child.stdout.on('data', (data) => { stdout += data; });
```

---

### Concept D: Output Normalization
* **The Problem:** Windows uses `\r\n` (Carriage Return + Line Feed) for line breaks, while Linux uses `\n`. Furthermore, a C++ program might output extra spaces at the end of a line or extra blank lines at the end.
* **The Solution:** We normalized both the C++ output and expected output by:
  1. Converting all `\r\n` to `\n`.
  2. Trimming trailing spaces from every line.
  3. Removing trailing empty lines.
  4. Doing a strict string equality check (`===`).

---

## 2. Top Interview Questions & Answers

### Q1: What is the difference between `exec` and `spawn` in Node.js?
* **Answer:** 
  * `exec` runs a command in a shell and buffers the output. It is best for simple, short-running commands where the output size is known and small (e.g. compiling a file, running a shell command).
  * `spawn` spawns a process without a shell and streams the data (via streams). It is best for long-running processes, real-time data streaming, or when we need to feed inputs dynamically to the process's standard input (`stdin`).

---

### Q2: How do you protect your Node.js application from an infinite loop in a child process?
* **Answer:** We use a **watchdog timer** via `setTimeout`. When we spawn the child process, we start a timer (e.g., 2000ms). If the process terminates successfully, we clear the timer (`clearTimeout`). If the timer fires *before* the process exits, we call `child.kill('SIGKILL')` to terminate the process immediately, mark the status as "Time Limit Exceeded" (TLE), and release system resources.

---

### Q3: What are exit codes, and how do they help you diagnose runtime errors?
* **Answer:** An exit code is an integer returned by a process to the operating system when it finishes.
  * Code `0` means the program ran successfully.
  * Any non-zero code indicates an error.
  * For example, on Windows, exit code `3221225620` (which is hex `0xC0000094`) corresponds to a **Division by Zero** exception. On Linux, a segmentation fault usually returns `139`. We monitor `code !== 0` to label runs as "Runtime Error" (RTE) and return the exit code to help diagnose what went wrong.

---

### Q4: Why is it important to wrap child process callbacks in a Promise?
* **Answer:** Node.js child process operations are asynchronous and event-driven. Wrapping them in a Promise allows us to use modern `async/await` syntax. This makes our code much easier to read, sequence, and manage (e.g., compiling first, then executing test cases one by one sequentially) rather than falling into "callback hell".

---

### Q5: How do you handle file clean-up in case of failures?
* **Answer:** We write the code inside a `try...finally` block. The `finally` block is guaranteed to execute whether the compilation and execution succeeded, failed, or threw an exception. In the `finally` block, we delete the temporary C++ source file and the generated executable file to prevent disk-space leaks.
