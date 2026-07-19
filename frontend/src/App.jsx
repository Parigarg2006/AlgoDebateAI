import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  Terminal as TerminalIcon,
  Workflow,
  Code2,
  Cpu,
  ShieldCheck,
  Sparkles,
  Play,
  Atom,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Copy,
  Download,
  Volume2,
  VolumeX,
  Settings,
  History
} from 'lucide-react';
import './App.css';

// Initialize WebSocket connection to backend on port 5000
const socket = io('http://localhost:5000', {
  autoConnect: true
});

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  // Input State
  const [problemDescription, setProblemDescription] = useState('');
  const [problemUrl, setProblemUrl] = useState('');
  const [maxRounds, setMaxRounds] = useState(4);
  const [language, setLanguage] = useState('cpp'); // cpp, python, java
  const [isCopied, setIsCopied] = useState(false);
  
  // Custom Test Case States
  const [customInput, setCustomInput] = useState('');
  const [isCustomRunning, setIsCustomRunning] = useState(false);
  const [isCustomTestOpen, setIsCustomTestOpen] = useState(false);

  // Settings Modal & Prompt Customizer States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [coderPrompt, setCoderPrompt] = useState(
    `You are an expert competitive programmer and algorithms specialist.\nYour task is to write high-quality, optimal, and compilable C++ code.\nGuidelines:\n1. Use standard C++ headers and include proper namespaces (e.g. #include <iostream>, using namespace std;).\n2. Read all test inputs from standard input (cin) and write outputs to standard output (cout).\n3. Do not include verbose print statements or prompts (e.g., "Enter number:"). Only print the final answer.\n4. Ensure the time complexity is optimal for large input constraints.\n5. Pay attention to edge cases: empty arrays, negative numbers, very large numbers (use long long if needed).`
  );
  const [criticPrompt, setCriticPrompt] = useState(
    `You are a harsh, meticulous competitive programming judge and code reviewer.\nYour only job is to find bugs, edge case vulnerabilities, or performance/complexity bottlenecks in the provided C++ code.\nReview guidelines:\n1. Check for compilation errors (if sandbox results indicate compiler failures).\n2. Check for logic errors: Are there any off-by-one errors? Is there potential for integer overflow?\n3. Check for edge cases: How does the code handle empty arrays, N=0, N=1, negative numbers, extremely large numbers?\n4. Check for time complexity: Is the code optimal? If the problem has N <= 10^5 and the code runs in O(N^2) using nested loops, reject it (approved = false) and explain that it will TLE (Time Limit Exceeded).\n5. If you find a flaw, you must provide a concrete, failing test case in "failingTestCase" that proves the flaw.\n6. If the code is correct, optimal, and passes all edge cases, set approved = true. Be extremely thorough; do not approve lazy or sub-optimal solutions.`
  );
  const [refinerPrompt, setRefinerPrompt] = useState(
    `You are a senior technical lead and software architect.\nYour job is to polish, clean, and write clear comments for the approved C++ algorithm.\nMake sure the returned C++ code uses clean, standard formatting with correct newlines and indentation.\nProvide the final code, explanation, time complexity, and space complexity in a strict JSON format.`
  );

  // Job State
  const [jobId, setJobId] = useState(null);
  const [jobState, setJobState] = useState('idle'); // idle, active, completed, failed
  const [error, setError] = useState(null);
  
  // Debate Progress State
  const [activeNode, setActiveNode] = useState(null); // coder, sandbox, critic, refiner
  const [currentRound, setCurrentRound] = useState(1);
  const [roundsHistory, setRoundsHistory] = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  
  // Live tracking states to display code before critic-done
  const [liveCode, setLiveCode] = useState('// Coder is drafting a solution...');
  const [coderDraft, setCoderDraft] = useState('');
  
  // Dynamic Diff & Vault states
  const [isDiffView, setIsDiffView] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [vaultRecords, setVaultRecords] = useState([]);

  // Telemetry States
  const [tokensPerSecond, setTokensPerSecond] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0); // in ms
  const [isMuted, setIsMuted] = useState(false);

  const startTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const terminalEndRef = useRef(null);
  const debateEndRef = useRef(null);
  const containerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const prevLogsLengthRef = useRef(0);

  // Holographic Glow Cursor Tracker
  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    containerRef.current.style.setProperty('--mouse-x', `${x}px`);
    containerRef.current.style.setProperty('--mouse-y', `${y}px`);
  };

  // Sound Engine (Web Audio API synthetically generated clicks and chimes)
  const playTick = useCallback(() => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.015, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (e) {
      console.warn(e);
    }
  }, [isMuted]);

  const playSuccessChime = useCallback(() => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;
      const playTone = (freq, time, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
      };
      playTone(523.25, now, 0.3); // C5
      playTone(659.25, now + 0.1, 0.3); // E5
      playTone(783.99, now + 0.2, 0.4); // G5
      playTone(1046.50, now + 0.3, 0.5); // C6
    } catch (e) {
      console.warn(e);
    }
  }, [isMuted]);

  // Confidence Meter Calculations
  const confidenceMetrics = useMemo(() => {
    if (jobState === 'idle') return { pct: 0, color: 'var(--text-muted)', label: '0%' };
    if (jobState === 'failed') return { pct: 10, color: 'var(--accent-red)', label: '10%' };
    if (jobState === 'completed') return { pct: 98, color: 'var(--accent-green)', label: '98%' };
    
    // active states
    if (activeNode === 'coder') return { pct: 35, color: 'var(--accent-red)', label: '35%' };
    if (activeNode === 'sandbox') return { pct: 55, color: '#fb923c', label: '55%' }; // Orange/Yellow
    if (activeNode === 'critic') return { pct: 70, color: '#fbbf24', label: '70%' }; // Yellow
    if (activeNode === 'refiner') return { pct: 90, color: 'var(--accent-green)', label: '90%' };
    
    return { pct: 20, color: 'var(--text-secondary)', label: '20%' };
  }, [jobState, activeNode]);

  const { pct: confidencePct, color: confidenceColor, label: confidenceLabel } = confidenceMetrics;

  // 3. Generate Terminal Logs Dynamically from Progress State
  const terminalLogs = useMemo(() => {
    if (jobState === 'idle') {
      return ['[SYSTEM] Terminal ready. Awaiting debate execution...'];
    }

    const logs = [
      '[SYSTEM] WebSocket stream established successfully.',
      `[SYSTEM] Enqueued Job ID: ${jobId || 'active_job'}`,
      '[SYSTEM] Initializing LangGraph debate graph...'
    ];

    roundsHistory.forEach((step) => {
      const rd = step.round;
      if (rd === 0) {
        if (step.customOutput) {
          logs.push(step.customOutput);
        }
        return;
      }
      if (step.node === 'coder') {
        logs.push(`[ROUND ${rd}] [CODER] Coder Agent triggered. Drafting ${language.toUpperCase()} solution...`);
      } else if (step.node === 'sandbox') {
        logs.push(`[ROUND ${rd}] [SANDBOX] C++ Sandbox triggered.`);
        logs.push(`[ROUND ${rd}] [SANDBOX] g++ compiling source code with -O3 optimization...`);
      } else if (step.node === 'critic') {
        logs.push(`[ROUND ${rd}] [CRITIC] Critic Agent triggered. Reviewing code logic...`);
      } else if (step.node === 'critic-done') {
        logs.push(`[ROUND ${rd}] [CRITIC] Critic evaluation complete.`);
        if (step.criticApproved) {
          logs.push(`[ROUND ${rd}] [CRITIC] VERDICT: APPROVED. Code satisfies correctness & complexity.`);
        } else {
          logs.push(`[ROUND ${rd}] [CRITIC] VERDICT: REJECTED. Found logical or efficiency bugs.`);
          if (step.sandboxResults && step.sandboxResults.length > 0) {
            const compileErr = step.sandboxResults.find(t => t.status === 'COMPILE_ERROR');
            if (compileErr) {
              logs.push(`[ROUND ${rd}] [SANDBOX] Compilation failed: ${compileErr.error.substring(0, 80)}...`);
            } else {
              const failedCases = step.sandboxResults.filter(t => t.status !== 'PASSED');
              logs.push(`[ROUND ${rd}] [SANDBOX] Executed test cases. Failed: ${failedCases.length}/${step.sandboxResults.length}`);
            }
          }
          logs.push(`[ROUND ${rd}] [CRITIC] Feedback dispatched to Coder for refactoring.`);
        }
      } else if (step.node === 'refiner') {
        logs.push(`[ROUND ${rd}] [REFINER] Refiner Agent triggered. Formatting and documenting final code...`);
      }
    });

    if (jobState === 'completed') {
      logs.push('[SYSTEM] LangGraph execution finished.');
      logs.push(`[SYSTEM] SUCCESS: Polished ${language.toUpperCase()} solution generated.`);
    } else if (jobState === 'failed') {
      logs.push('[SYSTEM] LangGraph execution aborted.');
      logs.push(`[ERROR] Job failed: ${error}`);
    }

    return logs;
  }, [roundsHistory, jobState, jobId, error, language]);

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

  // Play synthetic ticks on new terminal logs typing
  useEffect(() => {
    if (terminalLogs.length > prevLogsLengthRef.current) {
      if (jobState === 'active') {
        playTick();
      }
      prevLogsLengthRef.current = terminalLogs.length;
    }
  }, [terminalLogs, jobState, playTick]);

  // Play success chime on approved refiner completion
  useEffect(() => {
    if (jobState === 'completed') {
      playSuccessChime();
    }
  }, [jobState, playSuccessChime]);

  // 2. Latency and Tokens/s dynamic tracking
  useEffect(() => {
    if (jobState === 'active') {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      
      timerIntervalRef.current = setInterval(() => {
        const delta = Date.now() - startTimeRef.current;
        setElapsedTime(delta);
        
        // Randomly fluctuate tokens/s during execution
        setTokensPerSecond((40 + Math.random() * 15).toFixed(1));
      }, 100);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (jobState === 'idle') {
        setElapsedTime(0);
        setTokensPerSecond(0);
      } else {
        // Stop updating but keep elapsed and reset tokens/s to 0
        setTokensPerSecond(0);
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [jobState]);

  const latencyString = useMemo(() => {
    return (elapsedTime / 1000).toFixed(1) + 's';
  }, [elapsedTime]);

  // 4. Auto-scroll scrollable boxes
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  useEffect(() => {
    if (debateEndRef.current) {
      debateEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [roundsHistory]);

  // Session Vault Log Helpers
  const saveSessionToVault = useCallback((description, rounds, lang, history, result, id, draft) => {
    try {
      const records = JSON.parse(localStorage.getItem('algodebate_history') || '[]');
      if (records.some(r => r.jobId === id)) return;
      
      const newRecord = {
        timestamp: Date.now(),
        jobId: id,
        problemDescription: description,
        maxRounds: rounds,
        language: lang,
        roundsHistory: history,
        finalResult: result,
        coderDraft: draft
      };
      
      const updated = [newRecord, ...records];
      localStorage.setItem('algodebate_history', JSON.stringify(updated));
      setVaultRecords(updated);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Hydrate initial list of records from LocalStorage
  useEffect(() => {
    try {
      const records = JSON.parse(localStorage.getItem('algodebate_history') || '[]');
      setVaultRecords(records);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Automatically save session to vault upon successful solver execution completion
  useEffect(() => {
    if (jobState === 'completed' && finalResult && jobId) {
      saveSessionToVault(problemDescription, maxRounds, language, roundsHistory, finalResult, jobId, coderDraft);
    }
  }, [jobState, finalResult, jobId, problemDescription, maxRounds, language, roundsHistory, coderDraft, saveSessionToVault]);

  // Custom line-by-line Diff Aligner function
  const computeLineDiff = useCallback((oldText, newText) => {
    const oldLines = oldText ? oldText.split('\n') : [];
    const newLines = newText ? newText.split('\n') : [];
    
    const leftLines = [];
    const rightLines = [];
    
    let oldIdx = 0;
    let newIdx = 0;
    
    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      const oldLine = oldLines[oldIdx];
      const newLine = newLines[newIdx];
      
      if (oldIdx < oldLines.length && newIdx < newLines.length && oldLine === newLine) {
        leftLines.push({ type: 'unchanged', text: oldLine });
        rightLines.push({ type: 'unchanged', text: newLine });
        oldIdx++;
        newIdx++;
      } else {
        // Search ahead up to 20 lines to align
        const nextMatchInOld = newIdx < newLines.length ? oldLines.slice(oldIdx, oldIdx + 20).indexOf(newLine) : -1;
        const nextMatchInNew = oldIdx < oldLines.length ? newLines.slice(newIdx, newIdx + 20).indexOf(oldLine) : -1;
        
        if (nextMatchInOld !== -1 && (nextMatchInNew === -1 || nextMatchInOld <= nextMatchInNew)) {
          // Lines were removed in old code before matching newLine
          for (let k = 0; k < nextMatchInOld; k++) {
            leftLines.push({ type: 'removed', text: oldLines[oldIdx + k] });
            rightLines.push({ type: 'empty', text: '' });
          }
          oldIdx += nextMatchInOld;
        } else if (nextMatchInNew !== -1) {
          // Lines were added in new code before matching oldLine
          for (let k = 0; k < nextMatchInNew; k++) {
            leftLines.push({ type: 'empty', text: '' });
            rightLines.push({ type: 'added', text: newLines[newIdx + k] });
          }
          newIdx += nextMatchInNew;
        } else {
          // Mismatch on both, treat as replacement/addition/removal
          if (oldIdx < oldLines.length && newIdx < newLines.length) {
            leftLines.push({ type: 'removed', text: oldLines[oldIdx] });
            rightLines.push({ type: 'added', text: newLines[newIdx] });
            oldIdx++;
            newIdx++;
          } else if (oldIdx < oldLines.length) {
            leftLines.push({ type: 'removed', text: oldLines[oldIdx] });
            rightLines.push({ type: 'empty', text: '' });
            oldIdx++;
          } else if (newIdx < newLines.length) {
            leftLines.push({ type: 'empty', text: '' });
            rightLines.push({ type: 'added', text: newLines[newIdx] });
            newIdx++;
          }
        }
      }
    }
    
    return { leftLines, rightLines };
  }, []);

  // 5. Reset Handler
  const handleReset = () => {
    // Clear active socket listeners if there's a running job
    if (jobId) {
      socket.off(`job-progress:${jobId}`);
      socket.off(`job-completed:${jobId}`);
      socket.off(`job-failed:${jobId}`);
    }

    setProblemDescription('');
    setProblemUrl('');
    setJobId(null);
    setJobState('idle');
    setError(null);
    setActiveNode(null);
    setCurrentRound(1);
    setRoundsHistory([]);
    setFinalResult(null);
    setLiveCode('// Coder is drafting a solution...');
    setLanguage('cpp');
    setIsCopied(false);
    setElapsedTime(0);
    setTokensPerSecond(0);
    setCustomInput('');
    setIsCustomRunning(false);
    setIsCustomTestOpen(false);
    setIsSettingsOpen(false);
    setCoderDraft('');
    setIsDiffView(false);
  };

  // 6. Copy & Download Handlers
  const handleCopyCode = (codeText) => {
    if (!codeText) return;
    navigator.clipboard.writeText(codeText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadCode = (codeText) => {
    if (!codeText) return;
    const extensionMap = {
      cpp: 'cpp',
      python: 'py',
      java: 'java'
    };
    const ext = extensionMap[language] || 'cpp';
    const blob = new Blob([codeText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `solution.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 7. Submit problem to API
  const handleStartDebate = async (e) => {
    e.preventDefault();
    if (!problemDescription.trim() && !problemUrl.trim()) return;

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
        setCoderDraft(prev => prev ? prev : latest.code);
      }

      // Save complete progress history for terminal & timeline
      setRoundsHistory(history);
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
    setCoderDraft('');
    setIsCopied(false);

    try {
      const response = await fetch('http://localhost:5000/api/debate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          problemDescription,
          problemUrl,
          maxRounds,
          jobId: tempJobId, // Send the client-generated ID
          language,
          coderPrompt,
          criticPrompt,
          refinerPrompt
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

  const handleRunCustomTest = () => {
    if (!customInput.trim()) return;

    // Use current jobId or a transient one
    const tempJobId = jobId || 'job_custom_' + Date.now();
    if (!jobId) {
      setJobId(tempJobId);
    }
    
    // Switch state to active to focus elements and trigger audio
    setJobState('active');
    setIsCustomRunning(true);
    setActiveNode('sandbox');

    // Register socket listener for the custom test result
    socket.on(`custom_test_result:${tempJobId}`, (data) => {
      // Append the sandbox node run showing the output
      setRoundsHistory(prev => [
        ...prev,
        {
          node: 'sandbox',
          round: 0,
          customOutput: data.result
        }
      ]);
      setIsCustomRunning(false);
      setActiveNode(null);
      setJobState('completed'); // set to completed so visualizer nodes and chime fire!
      socket.off(`custom_test_result:${tempJobId}`);
    });

    // Emit socket event to backend
    socket.emit('run_custom_test', {
      jobId: tempJobId,
      inputData: customInput,
      code: liveCode,
      language
    });
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

  const handleSelectVaultRecord = useCallback((record) => {
    setProblemDescription(record.problemDescription);
    setMaxRounds(record.maxRounds);
    setLanguage(record.language);
    setRoundsHistory(record.roundsHistory);
    setFinalResult(record.finalResult);
    setJobId(record.jobId);
    setJobState('completed'); // hydrate past state as completed
    setCoderDraft(record.coderDraft || '');
    if (record.finalResult && record.finalResult.finalCode) {
      setLiveCode(record.finalResult.finalCode);
    }
    setIsVaultOpen(false);
  }, []);

  return (
    <div className="app-container" ref={containerRef} onMouseMove={handleMouseMove}>
      {/* 1. Header Row */}
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-title">AlgoDebate AI</span>
          <div className="status-indicator">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            {isConnected ? 'API Connected' : 'Connecting to API...'}
          </div>
          {/* Telemetry Indicator */}
          <div className="telemetry-wrapper">
            <div className="telemetry-item" title="Language processing speed">
              <span className="telemetry-label">Tokens/s:</span>
              <span className="telemetry-value" style={{ color: tokensPerSecond > 0 ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
                {tokensPerSecond}
              </span>
            </div>
            <div className="telemetry-item" title="LangGraph processed steps count">
              <span className="telemetry-label">Graph Depth:</span>
              <span className="telemetry-value">
                {roundsHistory.length}
              </span>
            </div>
            <div className="telemetry-item" title="Active solve run duration">
              <span className="telemetry-label">Latency:</span>
              <span className="telemetry-value" style={{ color: elapsedTime > 0 ? 'var(--accent-orange)' : 'var(--text-muted)' }}>
                {latencyString}
              </span>
            </div>
            <button
              onClick={() => setIsMuted(prev => !prev)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                marginLeft: '4px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              title={isMuted ? "Unmute execution sounds" : "Mute execution sounds"}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} style={{ color: 'var(--accent-blue)' }} />}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            LangGraph Multi-Agent Dashboard
          </div>
          {/* History Vault Button */}
          <button
            onClick={() => setIsVaultOpen(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            title="Session History Vault"
          >
            <History size={16} />
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.transform = 'rotate(30deg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.transform = 'rotate(0deg)';
            }}
            title="Configure Agent Prompts"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* 2. Bento Grid Layout */}
      <main className="main-container">
        
        {/* Left Sidebar Column */}
        <section className="sidebar-column">
          
          {/* Bento Tile 1: Problem Input */}
          <div className="bento-card" style={{ padding: '16px' }}>
            <h2 className="card-header-row">
              <span className="card-title">
                <TerminalIcon size={14} style={{ color: 'var(--accent-blue)' }} />
                Problem Input
              </span>
            </h2>
            <form onSubmit={handleStartDebate}>
              <input
                type="text"
                className="problem-url-input"
                placeholder="Paste LeetCode Link (Optional)"
                value={problemUrl}
                onChange={(e) => setProblemUrl(e.target.value)}
                disabled={jobState === 'active'}
              />
              <textarea
                className="problem-textarea"
                placeholder="Enter your algorithm problem here...&#10;e.g., Find the maximum subarray sum in O(N)."
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                disabled={jobState === 'active'}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px', width: '100%' }}>
                {/* Top Tier: Config Selectors */}
                <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                  <select
                    className="bento-select"
                    value={maxRounds}
                    onChange={(e) => setMaxRounds(Number(e.target.value))}
                    disabled={jobState === 'active'}
                    title="Max Rounds limit"
                    style={{ flex: 1 }}
                  >
                    <option value="2">2 Rounds</option>
                    <option value="3">3 Rounds</option>
                    <option value="4">4 Rounds</option>
                    <option value="5">5 Rounds</option>
                  </select>
                  <select
                    className="bento-select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={jobState === 'active'}
                    title="Target language"
                    style={{ flex: 1 }}
                  >
                    <option value="cpp">C++</option>
                    <option value="python">Python</option>
                    <option value="java">Java</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', width: '100%' }}>
                  <button 
                    onClick={handleStartDebate} 
                    style={{ flex: 1, height: '40px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff', fontWeight: '600', borderRadius: '8px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)' }}
                  >
                    Start Debate
                  </button>
                  <button 
                    onClick={handleReset} 
                    style={{ flex: 1, height: '40px', background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8', fontWeight: '500', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer' }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Custom Test Case Widget Bento Card */}
          <div className="bento-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2 
              className="card-header-row" 
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
              onClick={() => setIsCustomTestOpen(!isCustomTestOpen)}
              title="Expand/Collapse custom test run pane"
            >
              <span className="card-title">
                <Cpu size={14} style={{ color: 'var(--accent-blue)' }} />
                Run Custom Test Cases
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {isCustomTestOpen ? '▲' : '▼'}
              </span>
            </h2>
            
            {isCustomTestOpen && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                <textarea
                  className="problem-textarea"
                  style={{ height: '70px', minHeight: '60px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                  placeholder="Enter custom inputs here... (e.g. 5 \n 1 2 3 4 5)"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  disabled={isCustomRunning}
                />
                <button
                  type="button"
                  className="btn-start-debate-custom"
                  onClick={handleRunCustomTest}
                  disabled={isCustomRunning || !customInput.trim()}
                  style={{ height: '36px' }}
                >
                  {isCustomRunning ? (
                    <>
                      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Running test case...</span>
                    </>
                  ) : (
                    <>
                      <Play size={12} />
                      <span>Run custom test</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Bento Tile 2: LangGraph Visualizer (2x2 Clustered Loop Layout) */}
          <div className="bento-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <h2 className="card-header-row">
              <span className="card-title">
                <Workflow size={14} style={{ color: 'var(--accent-purple)' }} />
                LangGraph Visualizer
              </span>
            </h2>
            
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '8px', textAlign: 'center', fontWeight: 500 }}>
              {jobState === 'completed' ? 'Solve Completed successfully' : (jobState === 'active' ? `Active Execution: Round ${currentRound}` : (jobState === 'failed' ? 'Solve Failed' : 'Awaiting Graph Trigger'))}
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, overflow: 'hidden', width: '100%' }}>
              <div className="visualizer-grid" style={{ transform: 'scale(0.9)', transformOrigin: 'center center', width: '100%' }}>
                {/* Row 1 */}
                <div className={`visualizer-node ${getNodeStatusClass('coder')} ${getNodeStatusClass('coder') === 'status-active' ? 'active-pulse active-coder' : ''}`}>
                  <span className="node-number">{getNodeStatusClass('coder') === 'status-completed' ? '✓' : '1'}</span>
                  <Code2 size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                  <div className="node-info">
                    <span className="node-title">Coder</span>
                  </div>
                </div>
                
                {/* Coder-to-Sandbox Arrow */}
                <div className={`visualizer-connector ${activeNode === 'sandbox' ? 'flow-active' : ''}`}>
                  <ArrowRight size={14} />
                </div>
                
                <div className={`visualizer-node ${getNodeStatusClass('sandbox')} ${getNodeStatusClass('sandbox') === 'status-active' ? 'active-pulse active-sandbox' : ''}`}>
                  <span className="node-number">{getNodeStatusClass('sandbox') === 'status-completed' ? '✓' : '2'}</span>
                  <Cpu size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                  <div className="node-info">
                    <span className="node-title">Sandbox</span>
                  </div>
                </div>

                {/* Row 2 */}
                {/* Critic-to-Coder Rejection Arrow */}
                <div className={`visualizer-connector vertical ${activeNode === 'coder' && currentRound > 1 ? 'flow-active-reverse' : ''}`}>
                  <ArrowUp size={14} style={{ color: 'var(--accent-red)' }} />
                </div>
                
                <div className="visualizer-connector"></div>
                
                {/* Sandbox-to-Critic Arrow */}
                <div className={`visualizer-connector vertical ${activeNode === 'critic' ? 'flow-active' : ''}`}>
                  <ArrowDown size={14} />
                </div>

                {/* Row 3 */}
                <div className={`visualizer-node ${getNodeStatusClass('refiner')} ${getNodeStatusClass('refiner') === 'status-active' ? 'active-pulse active-refiner' : ''}`}>
                  <span className="node-number">{getNodeStatusClass('refiner') === 'status-completed' ? '✓' : '4'}</span>
                  <Sparkles size={14} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
                  <div className="node-info">
                    <span className="node-title">Refiner</span>
                  </div>
                </div>
                
                {/* Critic-to-Refiner Approval Arrow */}
                <div className={`visualizer-connector ${activeNode === 'refiner' ? 'flow-active' : ''}`}>
                  <ArrowLeft size={14} />
                </div>
                
                <div className={`visualizer-node ${getNodeStatusClass('critic')} ${getNodeStatusClass('critic') === 'status-active' ? 'active-pulse active-critic' : ''}`}>
                  <span className="node-number">{getNodeStatusClass('critic') === 'status-completed' ? '✓' : '3'}</span>
                  <ShieldCheck size={14} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
                  <div className="node-info">
                    <span className="node-title">Critic</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Workspace Column */}
        <section className="workspace-column">
          
          {/* Workspace Panels Grid: Code Console & Debate Arena side-by-side */}
          <div className="workspace-panels-grid">
            
            {/* Bento Tile 3: Code Console */}
            <div className="bento-card workspace-panel-card">
              <h2 className="card-header-row">
                <span className="card-title">
                  <Code2 size={14} style={{ color: 'var(--accent-blue)' }} />
                  {jobState === 'active' ? `Active Code Workspace (Round ${currentRound})` : 'Workspace Console'}
                </span>
                {/* Segmented confidence meter gauge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Graph Confidence:</span>
                  <div style={{ width: '80px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ width: `${confidencePct}%`, height: '100%', background: confidenceColor, transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: confidenceColor, fontWeight: 700, minWidth: '32px' }}>{confidenceLabel}</span>
                  
                  {/* Diff View Toggle Switch */}
                  {coderDraft && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Diff View:</span>
                      <button
                        type="button"
                        onClick={() => setIsDiffView(!isDiffView)}
                        style={{
                          position: 'relative',
                          width: '32px',
                          height: '18px',
                          borderRadius: '9px',
                          background: isDiffView ? 'var(--accent-green)' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          padding: 0
                        }}
                        title="Toggle Split-Screen Code Diff"
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: '2px',
                            left: isDiffView ? '16px' : '2px',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: '#ffffff',
                            transition: 'left 0.2s'
                          }}
                        />
                      </button>
                    </div>
                  )}
                </div>
              </h2>
              
              <div className="workspace-content">
                {jobState === 'idle' && (
                  <div className="workspace-empty-view">
                    <Atom size={36} />
                    <p>Awaiting Graph execution to load workspace...</p>
                  </div>
                )}

                {isDiffView && coderDraft && (jobState === 'active' || jobState === 'completed') ? (
                  <div className="diff-view-container fade-in">
                    {/* Left Column: Initial Coder Draft */}
                    <div className="diff-panel">
                      <div className="diff-panel-header">Coder Draft (Initial)</div>
                      <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
                        {(() => {
                          const { leftLines } = computeLineDiff(coderDraft, finalResult?.finalCode || liveCode);
                          return leftLines.map((line, idx) => (
                            <div key={idx} className={`diff-line ${line.type}`}>
                              <span className="diff-line-number">{line.type !== 'empty' ? idx + 1 : ''}</span>
                              <span className="diff-line-text">{line.type === 'removed' ? '- ' : (line.type === 'empty' ? '' : '  ')}{line.text}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                    {/* Right Column: Refined Output */}
                    <div className="diff-panel">
                      <div className="diff-panel-header">Refined Output (Final)</div>
                      <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
                        {(() => {
                          const { rightLines } = computeLineDiff(coderDraft, finalResult?.finalCode || liveCode);
                          return rightLines.map((line, idx) => (
                            <div key={idx} className={`diff-line ${line.type}`}>
                              <span className="diff-line-number">{line.type !== 'empty' ? idx + 1 : ''}</span>
                              <span className="diff-line-text">{line.type === 'added' ? '+ ' : (line.type === 'empty' ? '' : '  ')}{line.text}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {jobState === 'active' && (
                      <div className="active-code-box fade-in">
                        <div className="code-actions-bar">
                          <div className="panel-header-badge">Coder Draft</div>
                          <button type="button" className="action-btn" onClick={() => handleCopyCode(liveCode)} title="Copy live code draft">
                            {isCopied ? <CheckCircle2 size={12} style={{ color: 'var(--accent-green)' }} /> : <Copy size={12} />}
                            <span>{isCopied ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                        <pre>
                          <code>{liveCode}</code>
                        </pre>
                      </div>
                    )}

                    {jobState === 'completed' && finalResult && (
                      <div className="polished-solution-layout fade-in">
                        <div className="code-actions-bar">
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                            Polished Solution ({language === 'cpp' ? 'C++' : language.toUpperCase()})
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" className="action-btn" onClick={() => handleCopyCode(finalResult.finalCode)} title="Copy final polished code">
                              {isCopied ? <CheckCircle2 size={12} style={{ color: 'var(--accent-green)' }} /> : <Copy size={12} />}
                              <span>{isCopied ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button type="button" className="action-btn" onClick={() => handleDownloadCode(finalResult.finalCode)} title="Download code file">
                              <Download size={12} />
                              <span>Download</span>
                            </button>
                          </div>
                        </div>
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
                        <div className="strategy-box">
                          <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>Strategy & Explanation:</strong>
                          {finalResult.explanation}
                        </div>
                      </div>
                    )}

                    {jobState === 'failed' && (
                      <div className="workspace-empty-view fade-in">
                        <AlertTriangle size={36} style={{ color: 'var(--accent-red)' }} />
                        <h3 style={{ color: 'var(--accent-red)', fontSize: '0.9rem', fontWeight: 600 }}>Execution Failed</h3>
                        <p style={{ fontSize: '0.8rem', maxWidth: '300px', marginTop: '4px' }}>{error}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Bento Tile 4: Debate Arena Timeline */}
            <div className="bento-card workspace-panel-card" style={{ position: 'relative' }}>
              {/* Live Token Rain Layer (only active when debate is running) */}
              {jobState === 'active' && (
                <div className="token-rain-container">
                  <div className="token-column" style={{ left: '8%', animationDelay: '0s', animationDuration: '4.5s' }}>01011001</div>
                  <div className="token-column" style={{ left: '22%', animationDelay: '0.4s', animationDuration: '6s' }}>10101011</div>
                  <div className="token-column" style={{ left: '40%', animationDelay: '0.8s', animationDuration: '5s' }}>int main()</div>
                  <div className="token-column" style={{ left: '60%', animationDelay: '0.2s', animationDuration: '5.5s' }}>11001010</div>
                  <div className="token-column" style={{ left: '78%', animationDelay: '0.6s', animationDuration: '4s' }}>std::vector</div>
                  <div className="token-column" style={{ left: '92%', animationDelay: '1s', animationDuration: '6.5s' }}>10110010</div>
                </div>
              )}
              <h2 className="card-header-row" style={{ position: 'relative', zIndex: 1 }}>
                <span className="card-title">
                  <Workflow size={14} style={{ color: 'var(--accent-purple)' }} />
                  Debate Arena
                </span>
              </h2>
              
              <div className="workspace-content" style={{ position: 'relative', zIndex: 1 }}>
                {jobState === 'idle' ? (
                  <div className="workspace-empty-view">
                    <Workflow size={36} />
                    <p>Debate timeline will stream here...</p>
                  </div>
                ) : (
                  <div className="debate-arena-list fade-in">
                    {roundsHistory.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        Streaming nodes progress...
                      </div>
                    ) : (
                      <>
                        {roundsHistory.map((step, idx) => {
                          const isCriticDone = step.node === 'critic-done';
                          const isCoder = step.node === 'coder';
                          const isSandbox = step.node === 'sandbox';
                          const isCritic = step.node === 'critic';
                          const isRefiner = step.node === 'refiner';

                          let title = '';
                          let avatarBg = '';
                          let avatarIcon = null;
                          let cardContent = null;

                          if (isCoder) {
                            title = `Coder Agent (Round ${step.round})`;
                            avatarBg = 'rgba(56, 189, 248, 0.08)';
                            avatarIcon = <Code2 size={12} style={{ color: 'var(--accent-blue)' }} />;
                            cardContent = <p className="timeline-text">Drafting initial {language === 'cpp' ? 'C++' : language.toUpperCase()} solution...</p>;
                          } else if (isSandbox) {
                            title = `C++ Sandbox (Round ${step.round})`;
                            avatarBg = 'rgba(56, 189, 248, 0.08)';
                            avatarIcon = <Cpu size={12} style={{ color: 'var(--accent-blue)' }} />;
                            cardContent = (
                              <div>
                                <p className="timeline-text">Compiling and running test cases...</p>
                                {step.code && (
                                  <details className="code-details">
                                    <summary>View Source Code</summary>
                                    <pre className="inline-code-box"><code>{step.code}</code></pre>
                                  </details>
                                )}
                              </div>
                            );
                          } else if (isCritic) {
                            title = `Critic Agent (Round ${step.round})`;
                            avatarBg = 'rgba(192, 132, 252, 0.08)';
                            avatarIcon = <ShieldCheck size={12} style={{ color: 'var(--accent-purple)' }} />;
                            cardContent = <p className="timeline-text">Reviewing correctness and red-teaming logic...</p>;
                          } else if (isCriticDone) {
                            title = `Critic Review (Round ${step.round})`;
                            avatarBg = step.criticApproved ? 'rgba(52, 211, 153, 0.08)' : 'rgba(248, 113, 113, 0.08)';
                            avatarIcon = step.criticApproved ? 
                              <CheckCircle2 size={12} style={{ color: 'var(--accent-green)' }} /> : 
                              <AlertTriangle size={12} style={{ color: 'var(--accent-red)' }} />;
                            
                            const compileErr = step.sandboxResults?.find(t => t.status === 'COMPILE_ERROR');

                            cardContent = (
                              <div className="critic-done-card">
                                <div className="verdict-header" style={{ color: step.criticApproved ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                  Verdict: {step.criticApproved ? 'APPROVED' : 'REJECTED'}
                                </div>
                                <p className="criticism-text">{step.criticReasoning}</p>
                                
                                {compileErr && (
                                  <div className="compiler-error-box">
                                    <strong>Compiler Output:</strong>
                                    <pre>{compileErr.error}</pre>
                                  </div>
                                )}

                                {step.sandboxResults && !compileErr && (
                                  <div className="test-results-box">
                                    <strong>Sandbox Test Run (Click case to view):</strong>
                                    <div className="test-cases-grid">
                                      {step.sandboxResults.map((tc, tcIdx) => {
                                        const maxTime = 300; // ms reference limit
                                        const fillWidth = Math.min((tc.timeMs / maxTime) * 100, 100);

                                        return (
                                          <div 
                                            key={tcIdx} 
                                            className={`test-case-item ${tc.status === 'PASSED' ? 'passed' : 'failed'}`}
                                            title={`Input: "${tc.input}"\nExpected: "${tc.expectedOutput}"\nActual: "${tc.actualOutput}"`}
                                            onClick={() => alert(`Test Case ${tcIdx + 1}\nStatus: ${tc.status}\nTime: ${tc.timeMs}ms\nInput: ${tc.input}\nExpected Output: ${tc.expectedOutput}\nActual Output: ${tc.actualOutput}`)}
                                            style={{ position: 'relative', overflow: 'hidden' }}
                                          >
                                            <div 
                                              className="test-case-fill" 
                                              style={{ 
                                                position: 'absolute', 
                                                left: 0, 
                                                top: 0, 
                                                bottom: 0, 
                                                width: `${fillWidth}%`, 
                                                backgroundColor: tc.status === 'PASSED' ? 'rgba(52, 211, 153, 0.08)' : 'rgba(248, 113, 113, 0.08)',
                                                zIndex: 0,
                                                transition: 'width 0.5s ease-out'
                                              }} 
                                            />
                                            <span style={{ zIndex: 1, position: 'relative' }}>Case {tcIdx + 1}: {tc.status}</span>
                                            <span style={{ zIndex: 1, position: 'relative', fontWeight: 600 }}>{tc.timeMs}ms</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          } else if (isRefiner) {
                            title = `Refiner Agent (Round ${step.round})`;
                            avatarBg = 'rgba(192, 132, 252, 0.08)';
                            avatarIcon = <Sparkles size={12} style={{ color: 'var(--accent-purple)' }} />;
                            cardContent = <p className="timeline-text">Polishing final code layout and adding complexity breakdown...</p>;
                          }

                          return (
                            <div key={idx} className="timeline-card-wrapper">
                              <div className="timeline-avatar" style={{ backgroundColor: avatarBg }}>
                                {avatarIcon}
                              </div>
                              <div className="timeline-card">
                                <div className="timeline-card-header">
                                  <span className="timeline-card-title">{title}</span>
                                </div>
                                <div className="timeline-card-body">
                                  {cardContent}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={debateEndRef} />
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Bento Tile 5: VS Code style Terminal Widget */}
          <div className="terminal-widget">
            <div className="terminal-header">
              <div className="terminal-header-title">
                <TerminalIcon size={12} />
                <span>Agent Execution Terminal</span>
              </div>
              <div className="terminal-header-dots">
                <span className="terminal-dot red"></span>
                <span className="terminal-dot yellow"></span>
                <span className="terminal-dot green"></span>
              </div>
            </div>
            <div className="terminal-body">
              {terminalLogs.map((log, index) => {
                let logClass = 'info';
                if (log.startsWith('[ERROR]')) logClass = 'error';
                else if (log.startsWith('[SYSTEM]')) logClass = 'system';
                else if (log.includes('VERDICT: APPROVED') || log.includes('SUCCESS:')) logClass = 'success';

                return (
                  <div key={index} className={`terminal-log-line ${logClass}`}>
                    {log}
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          </div>

        </section>
      </main>

      {/* Settings Modal Overlay */}
      {isSettingsOpen && (
        <div className="settings-modal-overlay fade-in" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Agent System Instructions</h3>
              <button className="modal-close-btn" onClick={() => setIsSettingsOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="prompt-field-group">
                <label className="prompt-label">Coder Agent System Instructions</label>
                <textarea
                  className="prompt-textarea"
                  value={coderPrompt}
                  onChange={(e) => setCoderPrompt(e.target.value)}
                />
              </div>
              <div className="prompt-field-group">
                <label className="prompt-label">Critic Agent System Instructions</label>
                <textarea
                  className="prompt-textarea"
                  value={criticPrompt}
                  onChange={(e) => setCriticPrompt(e.target.value)}
                />
              </div>
              <div className="prompt-field-group">
                <label className="prompt-label">Refiner Agent System Instructions</label>
                <textarea
                  className="prompt-textarea"
                  value={refinerPrompt}
                  onChange={(e) => setRefinerPrompt(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-start-debate-custom" onClick={() => setIsSettingsOpen(false)} style={{ width: '120px', height: '36px' }}>
                Save Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Vault Log History Side Drawer */}
      {isVaultOpen && (
        <div className="vault-drawer-overlay" onClick={() => setIsVaultOpen(false)}>
          <div className="vault-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="vault-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={16} style={{ color: 'var(--accent-blue)' }} />
                Session History Vault
              </span>
              <button className="modal-close-btn" onClick={() => setIsVaultOpen(false)}>×</button>
            </div>
            
            <div className="vault-body">
              {vaultRecords.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '40px 0' }}>
                  No completed sessions saved yet.
                </div>
              ) : (
                vaultRecords.map((record) => (
                  <div
                    key={record.jobId}
                    className="vault-item"
                    onClick={() => handleSelectVaultRecord(record)}
                    title="Click to restore this session to workspace"
                  >
                    <span className="vault-item-title">{record.problemDescription}</span>
                    <div className="vault-item-meta">
                      <span>{record.language.toUpperCase()} • {record.maxRounds} Rounds</span>
                      <span>{new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
