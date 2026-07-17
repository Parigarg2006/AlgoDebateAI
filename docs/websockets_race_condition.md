# System Design Guide: Resolving WebSocket Race Conditions

This guide explains a classic full-stack architecture issue: the **WebSocket Race Condition**. We will analyze why it occurred in our app, how we solved it using **Client-Side ID Generation**, and how to talk about this in system design interviews.

---

## 1. The Problem: The Race Condition

In our initial setup:
1. The user clicked **"Start Debate"**.
2. The React frontend sent an `HTTP POST` request to `/api/debate`.
3. The Express server received the request, queued the job in Redis, and returned a server-generated `jobId` in the JSON response.
4. **The Race:** Because our background worker is running locally, it instantly picked up the job from Redis and began executing the Coder and Sandbox steps. It started emitting `job-progress:${jobId}` websocket events.
5. Meanwhile, the frontend was still waiting for the `HTTP POST` response to resolve. It had not received the `jobId` yet, meaning it **had not registered the socket listeners yet**.
6. By the time the frontend finally received the `jobId` and turned on the listeners, the Coder, Sandbox, and Critic steps had already finished. The client missed all intermediate progress events and only caught the final completion event.

### Chronological Timeline of the Bug:

```
[Frontend]                                 [Backend Server]                [BullMQ Worker]
    │                                             │                               │
    ├─ 1. POST /api/debate ──────────────────────►│                               │
    │                                             ├─ 2. Add job to Redis ────────►│
    │                                             │  (BullMQ starts job #2)       │
    │                                             │                               ├─ 3. Run Coder node
    │                                             │                               ├─ 4. Emit: `job-progress:2`
    │                                             │                               │    (LOST - No listener!)
    │◄─ 5. Response: { jobId: 2 } ────────────────┤                               │
    │                                             │                               │
    ├─ 6. Register: `socket.on(job-progress:2)`   │                               │
    │                                             │                               │
    │                                             │                               ├─ 7. Emit: `job-completed:2`
    │◄─ 8. Broadcast: `job-completed:2` ──────────┴───────────────────────────────┤
```

---

## 2. The Solution: Client-Side ID Generation

To solve this, we inverted the control of ID creation. Instead of waiting for the server to tell the client what ID to listen to, the client **pre-determines the ID**:

1. When the user clicks **"Start Debate"**, the React app immediately generates a unique `jobId` locally (e.g. `job_1784200000000_a3df2`).
2. React immediately registers the WebSocket listeners:
   ```javascript
   socket.on(`job-progress:${clientGeneratedJobId}`, ...)
   ```
3. React then sends the `HTTP POST` request, passing the `jobId` inside the request body.
4. The Express server tells BullMQ to use this custom `jobId` as the job's identifier in Redis:
   ```javascript
   await debateQueue.add('debateJob', { ... }, { jobId: clientGeneratedJobId });
   ```

Because the WebSocket listeners are registered **before** the backend API is even called, the frontend is guaranteed to capture 100% of the progress events.

### Chronological Timeline of the Fix:

```
[Frontend]                                 [Backend Server]                [BullMQ Worker]
    │                                             │                               │
    ├─ 1. Generate tempJobId: "job_99"            │                               │
    ├─ 2. Register: `socket.on(job-progress:99)`  │                               │
    │                                             │                               │
    ├─ 3. POST /api/debate { jobId: "job_99" } ──►│                               │
    │                                             ├─ 4. Add job "job_99" ────────►│
    │                                             │                               ├─ 5. Run Coder node
    │                                             │                               ├─ 6. Emit: `job-progress:99`
    │◄─ 7. Broadcast: `job-progress:99` ──────────┼───────────────────────────────┤ (SUCCESS - Caught!)
    │                                             │                               │
    │◄─ 8. Response: { jobId: "job_99" } ─────────┤                               │
```

---

## 2.1. Handling Nested WebSocket Payloads

A subtle secondary issue arose due to payload mapping:
* **The Error:** The BullMQ worker enqueued a progress payload that wrapped the round-by-round logs inside an array:
  ```json
  {
    "status": "IN_PROGRESS",
    "currentRound": 1,
    "roundsHistory": [
      { "node": "coder", "round": 1 }
    ]
  }
  ```
* **The Bug:** The client-side WebSocket listener initially attempted to read `progress.node` directly. Because `node` was nested inside the items of the `roundsHistory` array, `progress.node` returned `undefined`, causing the React visualizer state to remain in `"Awaiting Graph Trigger"`.
* **The Solution:** We modified the frontend parser to dynamically read the last entry of the `roundsHistory` array to inspect the current state of execution:
  ```javascript
  const history = progress.roundsHistory || [];
  const latest = history[history.length - 1];
  
  if (latest.node !== 'critic-done') {
    setActiveNode(latest.node); // Set active visualizer node (e.g. 'coder', 'sandbox', 'critic')
  }
  ```

This decoupled our visualizer component from specific event triggers, making the UI robust against asynchronous payloads.

---

---

## 3. System Design Interview Takeaways

### Q1: What is a WebSocket race condition, and how do you prevent it?
* **Answer:** A WebSocket race condition occurs when a server begins streaming real-time updates for a resource before the client has finished setting up its event listeners for that resource. To prevent this, the client should establish its event listeners **before** requesting the server to start the work. This is achieved by generating the resource's unique ID on the client side, registering the listener for that ID first, and then sending the creation request with the pre-generated ID to the server.

---

### Q2: What are the trade-offs of Client-Side ID Generation?
* **Answer:**
  * **Pros:** 100% immune to WebSocket race conditions. It also enables **Idempotency**—if the network drops during the creation request, the client can safely retry the exact same request with the same `jobId`, and the server will know not to create a duplicate job.
  * **Cons:** The client has to ensure the generated ID is globally unique. If two clients generate the same ID, it causes a collision. 

---

### Q3: How do you prevent ID collisions in Client-Side ID Generation?
* **Answer:** We can prevent collisions by using:
  1. **UUIDv4 (Universally Unique Identifier):** A standard 128-bit number that guarantees uniqueness across systems without coordination.
  2. **Nanoid:** A compact, URL-friendly unique string generator.
  3. **High-precision Timestamp + Random entropy:** For smaller systems, combining the current millisecond timestamp (`Date.now()`) with a random alphanumeric suffix is sufficient to avoid collisions.
