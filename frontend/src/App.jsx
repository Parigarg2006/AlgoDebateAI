import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

// Initialize WebSocket connection to backend on port 5000
const socket = io('http://localhost:5000', {
  autoConnect: true
});

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  // Input State
  const [problemDescription, setProblemDescription] = useState('');
  const [maxRounds, setMaxRounds] = useState(4);
  
  // Job State
  const [jobId, setJobId] = useState(null);
  const [jobState, setJobState] = useState('idle'); // idle, active, completed, failed
  const [error, setError] = useState(null);
  
  // Debate Progress State
  const [activeNode, setActiveNode] = useState(null); // coder, sandbox, critic, refiner
  const [currentRound, setCurrentRound] = useState(1);
  const [roundsHistory, setRoundsHistory] = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  
  // Live tracking states to display code & feedback before critic-done
  const [liveCode, setLiveCode] = useState('// Coder is drafting a solution...');
  const [liveFeedback, setLiveFeedback] = useState('Awaiting Coder drafting...');
  
  // UI Tabs State (for completed results)
  const [activeTab, setActiveTab] = useState('polished'); // polished, timeline

  // 1. Connection Monitoring
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // 3. Submit problem to API
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!problemDescription.trim()) return;

    // Generate unique jobId client-side
    const tempJobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    // Register WebSocket listeners SYNCHRONOUSLY before enqueuing
    socket.on(`job-progress:${tempJobId}`, (progress) => {
      const history = progress.roundsHistory || [];
      if (history.length === 0) return;
      
      const latest = history[history.length - 1];
      
      // Update visualizer state
      if (latest.node && latest.node !== 'critic-done') {
        setActiveNode(latest.node);
        setCurrentRound(latest.round);
      } else if (latest.node === 'critic-done') {
        setActiveNode(null);
        setCurrentRound(latest.round);
      }
      
      // Update live code display
      if (latest.code) {
        setLiveCode(latest.code);
      }
      
      // Update live feedback status/text
      if (latest.node === 'coder') {
        setLiveFeedback('Coder Agent is drafting a C++ solution...');
      } else if (latest.node === 'sandbox') {
        setLiveFeedback('Sandbox is compiling code and running test cases...');
      } else if (latest.node === 'critic') {
        setLiveFeedback('Critic Agent is evaluating solution correctness and time/space complexity...');
      } else if (latest.node === 'critic-done') {
        setLiveFeedback(latest.criticReasoning || '');
      }

      // Filter and set completed rounds for timeline
      const completedRounds = history.filter(r => r.node === 'critic-done');
      setRoundsHistory(completedRounds);
    });

    socket.on(`job-completed:${tempJobId}`, (result) => {
      setJobState('completed');
      setActiveNode(null);
      setFinalResult(result.finalResult);
      
      // Clean up
      socket.off(`job-progress:${tempJobId}`);
      socket.off(`job-completed:${tempJobId}`);
      socket.off(`job-failed:${tempJobId}`);
    });

    socket.on(`job-failed:${tempJobId}`, (data) => {
      setJobState('failed');
      setActiveNode(null);
      setError(data.error);
      
      // Clean up
      socket.off(`job-progress:${tempJobId}`);
      socket.off(`job-completed:${tempJobId}`);
      socket.off(`job-failed:${tempJobId}`);
    });

    // Reset UI State and register the jobId
    setJobId(tempJobId);
    setJobState('active');
    setError(null);
    setActiveNode(null);
    setCurrentRound(1);
    setRoundsHistory([]);
    setFinalResult(null);
    setLiveCode('// Coder is drafting a solution...');
    setLiveFeedback('Awaiting Coder drafting...');

    try {
      const response = await fetch('http://localhost:5000/api/debate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          problemDescription,
          maxRounds,
          jobId: tempJobId // Send the client-generated ID
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit job to server.');
      }

    } catch (err) {
      setJobState('failed');
      setJobId(null); // Clear the ID on failure
      setError(err.message);
      
      // Clean up on failure
      socket.off(`job-progress:${tempJobId}`);
      socket.off(`job-completed:${tempJobId}`);
      socket.off(`job-failed:${tempJobId}`);
    }
  };



  const isNodeBefore = (nodeA, nodeB) => {
    const order = ['coder', 'sandbox', 'critic', 'refiner'];
    const idxA = order.indexOf(nodeA);
    const idxB = order.indexOf(nodeB);
    if (idxB === -1) return false;
    return idxA < idxB;
  };

  const getNodeStatusClass = (nodeName) => {
    if (jobState === 'completed') {
      return 'status-completed';
    }
    if (jobState === 'failed') {
      return activeNode === nodeName ? 'status-failed' : (isNodeBefore(nodeName, activeNode) ? 'status-completed' : 'status-pending');
    }
    if (jobState === 'active') {
      if (activeNode === nodeName) {
        return 'status-active';
      }
      if (isNodeBefore(nodeName, activeNode)) {
        return 'status-completed';
      }
      return 'status-pending';
    }
    return 'status-pending'; // idle
  };

  return (
    <div className="app-container">
      {/* 1. Header Row */}
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-title">AlgoDebate AI</span>
          <div className="status-indicator">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            {isConnected ? 'API Connected' : 'Connecting to API...'}
          </div>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          LangGraph Multi-Agent Logic Solver (C++)
        </div>
      </header>

      {/* 2. Main Content Grid */}
      <main className="main-container">
        
        {/* Left Side: Controls & Visualizer */}
        <section className="left-panel">
          
          {/* Submission Card */}
          <div className="glass-panel border-glow-blue fade-in">
            <h2 className="form-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              Problem Input
            </h2>
            <form onSubmit={handleSubmit}>
              <textarea
                className="problem-textarea"
                placeholder="Enter your algorithm coding problem here...&#10;e.g., Given N followed by N integers, find the maximum subarray sum."
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                disabled={jobState === 'active'}
              />
              <div className="form-row">
                <div>
                  <label style={{ marginRight: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Max Rounds:</label>
                  <select
                    className="max-rounds-select"
                    value={maxRounds}
                    onChange={(e) => setMaxRounds(Number(e.target.value))}
                    disabled={jobState === 'active'}
                  >
                    <option value="2">2 Rounds</option>
                    <option value="3">3 Rounds</option>
                    <option value="4">4 Rounds</option>
                    <option value="5">5 Rounds</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="btn-start"
                  disabled={jobState === 'active' || !problemDescription.trim()}
                >
                  {jobState === 'active' ? 'Solving...' : 'Start Debate'}
                </button>
              </div>
            </form>
          </div>

          {/* LangGraph Active Node Tracker */}
          <div className="glass-panel border-glow-purple fade-in" style={{ flex: 1 }}>
            <h2 className="form-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              LangGraph Visualizer
            </h2>
            
            <div className="graph-container">
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
                {jobState === 'completed' ? 'Solve Completed successfully' : (jobState === 'active' ? `Active Execution: Round ${currentRound}` : (jobState === 'failed' ? 'Solve Failed' : 'Awaiting Graph Trigger'))}
              </div>
              
              <div className="graph-nodes-wrapper">
                {/* Node 1: Coder */}
                <div className={`graph-node ${getNodeStatusClass('coder')} ${getNodeStatusClass('coder') === 'status-active' ? 'active-pulse active-coder' : ''}`}>
                  <span className="node-number">{getNodeStatusClass('coder') === 'status-completed' ? '✓' : '1'}</span>
                  <div className="node-info">
                    <span className="node-title">Coder Agent</span>
                    <span className="node-desc">Drafts algorithm solution</span>
                  </div>
                </div>

                <div className="graph-arrow">▼</div>

                {/* Node 2: Sandbox */}
                <div className={`graph-node ${getNodeStatusClass('sandbox')} ${getNodeStatusClass('sandbox') === 'status-active' ? 'active-pulse active-sandbox' : ''}`}>
                  <span className="node-number">{getNodeStatusClass('sandbox') === 'status-completed' ? '✓' : '2'}</span>
                  <div className="node-info">
                    <span className="node-title">C++ Sandbox</span>
                    <span className="node-desc">Compiles & runs test cases</span>
                  </div>
                </div>

                <div className="graph-arrow">▼</div>

                {/* Node 3: Critic */}
                <div className={`graph-node ${getNodeStatusClass('critic')} ${getNodeStatusClass('critic') === 'status-active' ? 'active-pulse active-critic' : ''}`}>
                  <span className="node-number">{getNodeStatusClass('critic') === 'status-completed' ? '✓' : '3'}</span>
                  <div className="node-info">
                    <span className="node-title">Critic Agent</span>
                    <span className="node-desc">Red-teams logic & complexity</span>
                  </div>
                </div>

                <div className="graph-arrow">▼</div>

                {/* Node 4: Refiner */}
                <div className={`graph-node ${getNodeStatusClass('refiner')} ${getNodeStatusClass('refiner') === 'status-active' ? 'active-pulse active-refiner' : ''}`}>
                  <span className="node-number">{getNodeStatusClass('refiner') === 'status-completed' ? '✓' : '4'}</span>
                  <div className="node-info">
                    <span className="node-title">Refiner Agent</span>
                    <span className="node-desc">Polishes & documents output</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Side: Agent Output Console */}
        <section className="right-panel">
          
          {/* A. Idle Empty State */}
          {jobState === 'idle' && (
            <div className="glass-panel empty-state fade-in" style={{ flex: 1 }}>
              <div className="empty-icon">⚛</div>
              <h2>Start an Agentic Solve</h2>
              <p style={{ maxWidth: '400px' }}>
                Enter a logical problem on the left and start the debate. You will watch our Coder, Sandbox, and Critic argue and refine in real-time.
              </p>
            </div>
          )}

          {/* B. Active Execution Panel */}
          {jobState === 'active' && (
            <div className="glass-panel fade-in split-container" style={{ flex: 1 }}>
              <div className="split-header-row">
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Active Agent Workspace</h2>
                <div style={{ background: 'rgba(255, 42, 109, 0.1)', color: 'var(--accent-red)', padding: '4px 10px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                  Live Round: {currentRound}
                </div>
              </div>
              
              <div className="split-panels">
                <div className="panel-half">
                  <div className="panel-header-badge">Coder Draft</div>
                  <pre className="code-editor-box">
                    <code>{liveCode}</code>
                  </pre>
                </div>
                
                <div className="panel-half">
                  <div className="panel-header-badge">Critic Review</div>
                  <div className="critic-textbox">
                    {liveFeedback}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* C. Completed Solution Panel */}
          {jobState === 'completed' && finalResult && (
            <div className="glass-panel fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              
              {/* Tab Selectors */}
              <div className="tabs-row">
                <button
                  className={`tab-btn ${activeTab === 'polished' ? 'active' : ''}`}
                  onClick={() => setActiveTab('polished')}
                >
                  Polished Solution
                </button>
                <button
                  className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                  onClick={() => setActiveTab('timeline')}
                >
                  Debate Timeline ({roundsHistory.length} Rounds)
                </button>
              </div>

              {/* Tab 1: Polished Solution */}
              {activeTab === 'polished' && (
                <div className="tab-content fade-in">
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Final Refined Code (C++)</h3>
                  <pre className="final-code-block">
                    <code>{finalResult.finalCode}</code>
                  </pre>
                  
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-label">Time Complexity</div>
                      <div className="stat-value">{finalResult.timeComplexity}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Space Complexity</div>
                      <div className="stat-value">{finalResult.spaceComplexity}</div>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '1.1rem', marginTop: '20px', marginBottom: '8px' }}>Strategy & Architecture</h3>
                  <div style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>
                    {finalResult.explanation}
                  </div>
                </div>
              )}

              {/* Tab 2: Timeline Logs */}
              {activeTab === 'timeline' && (
                <div className="tab-content fade-in">
                  <div className="timeline-logs">
                    {roundsHistory.map((r, i) => (
                      <div className="timeline-item" key={i}>
                        <div className="timeline-round">Round {r.round} Review</div>
                        <div className="timeline-body">
                          <p style={{ fontWeight: 600, color: r.criticApproved ? 'var(--accent-green)' : 'var(--accent-red)', marginBottom: '8px' }}>
                            {r.criticApproved ? 'Approved by Critic' : 'Rejected by Critic'}
                          </p>
                          <p style={{ color: 'var(--text-main)', marginBottom: '12px' }}>{r.criticReasoning}</p>
                          <details style={{ background: 'var(--bg-darker)', padding: '10px', borderRadius: '4px', cursor: 'pointer' }}>
                            <summary style={{ fontSize: '0.85rem', color: 'var(--accent-blue)' }}>View Code Draft</summary>
                            <pre style={{ marginTop: '8px', overflow: 'auto', maxHeight: '200px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                              <code>{r.code}</code>
                            </pre>
                          </details>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* D. Failure Panel */}
          {jobState === 'failed' && (
            <div className="glass-panel empty-state border-glow-red fade-in" style={{ flex: 1 }}>
              <div style={{ fontSize: '3rem', color: 'var(--accent-red)' }}>⚠️</div>
              <h2 style={{ color: 'var(--accent-red)' }}>Execution Failed</h2>
              <p style={{ maxWidth: '500px', color: 'var(--text-muted)' }}>{error}</p>
              <button className="btn-start" onClick={() => setJobState('idle')} style={{ marginTop: '12px' }}>
                Reset Workspace
              </button>
            </div>
          )}

        </section>
      </main>
    </div>
  );
}

export default App;
