# AlgoDebate AI: Multi-Agent Logic Solver

AlgoDebate AI is an advanced, full-stack agentic coding assistant that writes, compiles, tests, and refines C++ algorithm solutions. It uses a **multi-agent debate system** powered by **Google Gemini** and orchestrated via **LangGraph**, complete with a local **C++ Sandbox compiler** and a real-time **WebSockets-based Glassmorphic UI Dashboard**.

Rather than running simple linear pipelines, the system implements a **self-correcting cycle**: the Coder drafts code, the Sandbox compiles and executes it, the Critic reviews runtime reports to locate logical or efficiency bugs, and the Refiner documents the final optimized code.

---

## 🏗️ System Architecture & Workflow

The orchestrator is built on top of `@langchain/langgraph` using a stateful directed graph. The workflow moves dynamically through nodes and conditional edges:

```
                  ┌──────────────────────┐
                  │        START         │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
            ┌────►│  1. Coder Node       │
            │     └──────────┬───────────┘
            │                │
            │                ▼
            │     ┌──────────────────────┐
            │     │  2. Sandbox Executor │
            │     └──────────┬───────────┘
            │                │
            │                ▼
            │     ┌──────────────────────┐
            │     │  3. Critic Node      │
            │     └──────────┬───────────┘
            │                │
            │                ▼ (Conditional Edge)
            │      Is Approved / Max Rounds?
            │       /                    \
            │     No                     Yes
            │     /                        \
            └────┘                          ▼
                                  ┌──────────────────┐
                                  │ 4. Refiner Node  │
                                  └────────┬─────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │       END        │
                                  └──────────────────┘
```

### The Node Roles:
1. **Coder Node (`coderAgent.js`):** Generates C++ drafts and inputs custom boundary test cases. If a history of criticism exists from previous rounds, it applies targeted refactoring.
2. **Sandbox Executor (`cppExecutor.js`):** Writes the code to a temporary file, compiles it using `g++`, and feeds inputs to standard input (`stdin`). It traps compiler errors, Runtime Exceptions (RTE), and runs a watchdog timer to kill infinite loops (Time Limit Exceeded - TLE).
3. **Critic Node (`criticAgent.js`):** Audits sandbox reports, verifies solution logic, and identifies time/space inefficiencies. If buggy, it generates a breaking test case to feed back to the Coder.
4. **Refiner Node (`refinerAgent.js`):** Formats the approved draft with proper line breaks, inserts documentation comments, and writes time/space complexity analysis.

---

## 🛠️ Technology Stack

* **Frontend:** React (Vite), Socket.io-client, CSS Custom variables (Vanilla CSS).
* **Backend:** Node.js (Express, Socket.io, BullMQ, Redis, `@google/genai` SDK, `@langchain/langgraph`).
* **Environment:** Native `g++` compiler on host machine (supporting `-O3` compilation optimization).
* **AI Model:** `gemini-flash-lite-latest` (fast, structured JSON response outputs).

---

## ✨ Key Engineering Highlights

### 1. WebSocket Race-Condition Resolution
During local execution, background jobs finish in milliseconds. If the client queries the backend first, the job starts and progress events are broadcast *before* the React client resolves its fetch response and registers the socket listener.
* **The Fix:** Implemented **Client-Side ID Generation**. The frontend pre-generates a unique `jobId`, registers WebSocket listeners synchronously on the client, and *then* submits the HTTP POST request. This guarantees zero lost events.

### 2. Strict Structured Outputs
Agents utilize Gemini's `responseMimeType: 'application/json'` along with exact schemas, ensuring all reasoning, test cases, and compiled parameters are parsed successfully into JavaScript objects without brittle regex matching.

### 3. Glassmorphic Pipeline Status Engine
The visualizer acts as an active CI/CD pipeline. Nodes dynamically update states (`pending`, `active`, `completed`, `failed`) and maintain their completed green state with checkmarks (`✓`) once the solve finishes.

---

## 🚀 Local Development Setup

### Prerequisites
Make sure you have the following installed on your machine:
* **Node.js** (v18+)
* **Docker** (to run the Redis server)
* **G++ Compiler** (on Windows: MinGW/MSYS2; on Linux/macOS: `build-essential` / `gcc`)
  * Run `g++ --version` in your terminal to verify it's added to your `PATH`.

---

### Step-by-Step Setup

#### 1. Clone & Navigate
```bash
git clone <your-repo-url>
cd AlgoDebateAI
```

#### 2. Start Redis Container
Start a Docker container running Redis on port `6379` (needed by BullMQ):
```bash
docker run --name algodebate-redis -p 6379:6379 -d redis
```

#### 3. Setup Backend Environment
Navigate to the `backend` folder, install packages, and configure variables:
```bash
cd backend
npm install
```
Create a `.env` file inside the `backend/` folder:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
PORT=5000
```

#### 4. Setup Frontend Client
Navigate to the `frontend` folder and install dependencies:
```bash
cd ../frontend
npm install
```

#### 5. Run the Application
Start both the backend server and the frontend client:

* **In Backend Directory:**
  ```bash
  npm run start # (or: node src/index.js)
  ```
  *(Starts the Express server, Socket server, and BullMQ Background Worker).*

* **In Frontend Directory:**
  ```bash
  npm run dev
  ```
  *(Starts the Vite dev server on http://localhost:5173).*

Open your browser to **[http://localhost:5173](http://localhost:5173)** to start using the app!

---

## 📂 Folder Structure

```
AlgoDebateAI/
│
├── backend/
│   ├── src/
│   │   ├── agents/            # Coder, Critic, and Refiner agents
│   │   ├── executor/          # C++ sandbox compiler & watchdog
│   │   ├── orchestrator/      # LangGraph state machine & BullMQ worker
│   │   └── index.js           # Server entry point (Express & Sockets)
│   │
│   ├── tests/                 # Execution verification suites
│   ├── .env                   # Environmental configuration (Ignored)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Main dashboard component
│   │   ├── App.css            # Component-specific styles
│   │   ├── index.css          # Design system & keyframes
│   │   └── main.jsx           # Vite React loader
│   │
│   └── package.json
│
├── docs/                      # Interview preparation guides
│   ├── phase1_sandbox.md      # Sandbox execution details
│   ├── phase2_agents.md       # Agent prompting & structured schemas
│   ├── phase3_langgraph.md    # LangGraph state design & reducers
│   ├── phase4_frontend.md     # WebSockets, CORS, and full-stack architecture
│   └── websockets_race_condition.md # Diagnostic guide on race conditions
│
├── .gitignore                 # Secure git exclusions
└── README.md
```

---

## 📚 Interview Preparation & Revision
For deep dives into the technical design decisions, trade-offs, and typical system design interview questions relating to this architecture, check out the markdown guides inside the `docs/` folder!
