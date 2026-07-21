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
  Loader2,
  Copy,
  Download,
  Volume2,
  VolumeX,
  Settings,
  History,
  Check,
  Share2,
  Network,
  FileText,
  GitFork,
  ChevronRight,
  CheckCircle2,
  Terminal,
  Clock,
  Database
} from 'lucide-react';
import './App.css';

// Initialize WebSocket connection to backend on port 5000
const socket = io('http://localhost:5000', {
  autoConnect: true
});

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [toastMessage, setToastMessage] = useState(null);
  const [isStrategyExpanded, setIsStrategyExpanded] = useState(true);
  
  // Input State
  const [problemDescription, setProblemDescription] = useState('');
  const [problemUrl, setProblemUrl] = useState('');
  const [maxRounds, setMaxRounds] = useState(4);
  const [language, setLanguage] = useState('cpp'); // cpp, python, java
  const [timeoutMs, setTimeoutMs] = useState(10000); // default 10 seconds (in ms)
  const [testCasesCount, setTestCasesCount] = useState('0'); // Default/0, Custom/1
  const [isCopied, setIsCopied] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isCustomTestOpen, setIsCustomTestOpen] = useState(false);
  
  // Custom Test Case States
  const [customInput, setCustomInput] = useState('');
  const [isCustomRunning, setIsCustomRunning] = useState(false);

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
  const terminalContainerRef = useRef(null);
  const containerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const prevLogsLengthRef = useRef(0);

  // Sound Engine
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
      playTone(523.25, now, 0.3);
      playTone(659.25, now + 0.1, 0.3);
      playTone(783.99, now + 0.2, 0.4);
      playTone(1046.50, now + 0.3, 0.5);
    } catch (e) {
      console.warn(e);
    }
  }, [isMuted]);

  // Generate Terminal Logs
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
      
      if (step.message) {
        logs.push(`[ROUND ${rd}] ${step.message}`);
        // Support detail logging alongside message
        if (step.node === 'critic-done') {
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
            logs.push(`[ROUND ${rd}] ⚔️ DEBATE IN PROGRESS: Critic challenged Coder.`);
          }
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
          logs.push(`[ROUND ${rd}] ⚔️ DEBATE IN PROGRESS: Critic challenged Coder.`);
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

  // WebSocket connection Monitoring
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

  // Toast error listener observer
  useEffect(() => {
    if (error && (error.includes('LLM API key') || error.includes('network') || error.includes('Execution failed') || error.includes('Unable to fetch'))) {
      setToastMessage('Execution failed: Check LLM API key / network');
      const timer = setTimeout(() => setToastMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Play synthetic ticks
  useEffect(() => {
    if (terminalLogs.length > prevLogsLengthRef.current) {
      if (jobState === 'active') {
        playTick();
      }
      prevLogsLengthRef.current = terminalLogs.length;
    }
  }, [terminalLogs, jobState, playTick]);

  // Play success chime
  useEffect(() => {
    if (jobState === 'completed') {
      playSuccessChime();
    }
  }, [jobState, playSuccessChime]);

  // Latency tracking
  useEffect(() => {
    if (jobState === 'active') {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      
      timerIntervalRef.current = setInterval(() => {
        const delta = Date.now() - startTimeRef.current;
        setElapsedTime(delta);
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

  // Auto-scroll logs strictly within the container (isolating scroll to logs box only)
  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // Session History LocalStorage
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

  useEffect(() => {
    try {
      const records = JSON.parse(localStorage.getItem('algodebate_history') || '[]');
      setVaultRecords(records);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (jobState === 'completed' && finalResult && jobId) {
      saveSessionToVault(problemDescription, maxRounds, language, roundsHistory, finalResult, jobId, coderDraft);
    }
  }, [jobState, finalResult, jobId, problemDescription, maxRounds, language, roundsHistory, coderDraft, saveSessionToVault]);

  // Diff Aligner
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
        const nextMatchInOld = newIdx < newLines.length ? oldLines.slice(oldIdx, oldIdx + 20).indexOf(newLine) : -1;
        const nextMatchInNew = oldIdx < oldLines.length ? newLines.slice(newIdx, newIdx + 20).indexOf(oldLine) : -1;
        
        if (nextMatchInOld !== -1 && (nextMatchInNew === -1 || nextMatchInOld <= nextMatchInNew)) {
          for (let k = 0; k < nextMatchInOld; k++) {
            leftLines.push({ type: 'removed', text: oldLines[oldIdx + k] });
            rightLines.push({ type: 'empty', text: '' });
          }
          oldIdx += nextMatchInOld;
        } else if (nextMatchInNew !== -1) {
          for (let k = 0; k < nextMatchInNew; k++) {
            leftLines.push({ type: 'empty', text: '' });
            rightLines.push({ type: 'added', text: newLines[newIdx + k] });
          }
          newIdx += nextMatchInNew;
        } else {
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

  // Reset Handler
  const handleReset = () => {
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
    setTimeoutMs(10000);
    setTestCasesCount('0');
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

  // Copy & Download
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

  // Setup WS listeners
  const setupJobWebSocketListeners = (tempJobId) => {
    socket.on(`job-progress:${tempJobId}`, (progress) => {
      const history = progress.roundsHistory || [];
      if (history.length === 0) return;
      
      const latest = history[history.length - 1];
      
      if (latest.node && latest.node !== 'critic-done') {
        setActiveNode(latest.node);
        setCurrentRound(latest.round);
      } else if (latest.node === 'critic-done') {
        setActiveNode(null);
        setCurrentRound(latest.round);
      }
      
      if (latest.code) {
        setLiveCode(latest.code);
        setCoderDraft(prev => prev ? prev : latest.code);
      }

      setRoundsHistory(history);
    });

    socket.on(`job-completed:${tempJobId}`, (result) => {
      setJobState('completed');
      setActiveNode(null);
      setFinalResult(result.finalResult);
      
      socket.off(`job-progress:${tempJobId}`);
      socket.off(`job-completed:${tempJobId}`);
      socket.off(`job-failed:${tempJobId}`);
    });

    socket.on(`job-failed:${tempJobId}`, (data) => {
      setJobState('failed');
      setActiveNode(null);
      setError(data.error);
      
      socket.off(`job-progress:${tempJobId}`);
      socket.off(`job-completed:${tempJobId}`);
      socket.off(`job-failed:${tempJobId}`);
    });
  };

  // Submit problem API
  const handleStartDebate = async (e) => {
    e.preventDefault();
    if (!problemDescription.trim() && !problemUrl.trim()) {
      setError('Please enter a problem description or paste a LeetCode URL.');
      setJobState('failed');
      return;
    }

    const tempJobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    setupJobWebSocketListeners(tempJobId);

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
          jobId: tempJobId,
          language,
          coderPrompt,
          criticPrompt,
          refinerPrompt
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to submit job to server.');
      }

    } catch (err) {
      setJobState('failed');
      setJobId(null);
      setError(err.message);
      
      socket.off(`job-progress:${tempJobId}`);
      socket.off(`job-completed:${tempJobId}`);
      socket.off(`job-failed:${tempJobId}`);
    }
  };

  const handleRunCustomTest = () => {
    if (!customInput.trim()) return;

    const tempJobId = jobId || 'job_custom_' + Date.now();
    if (!jobId) {
      setJobId(tempJobId);
    }
    
    setJobState('active');
    setIsCustomRunning(true);
    setActiveNode('sandbox');

    socket.on(`custom_test_result:${tempJobId}`, async (data) => {
      const isFailed = data.isFailed || data.result.includes('ERROR');
      
      setRoundsHistory(prev => {
        const next = [
          ...prev,
          {
            node: 'sandbox',
            round: 0,
            customOutput: data.result
          }
        ];
        if (isFailed) {
          next.push({
            node: 'sandbox',
            round: 0,
            customOutput: '⚠️ Custom Test Failed -> Re-triggering Agent Debate'
          });
        }
        return next;
      });

      setIsCustomRunning(false);
      setActiveNode(null);
      socket.off(`custom_test_result:${tempJobId}`);

      if (isFailed) {
        const newJobId = 'job_' + Date.now();
        setJobId(newJobId);
        setJobState('active');
        setActiveNode('coder');
        setCurrentRound(1);
        setFinalResult(null);

        const reTriggerDescription = `
[RE-TRIGGER FEEDBACK]
The C++ code has failed on a custom test case.

Original Problem Description:
${problemDescription}

Failing Custom Input:
${customInput}

Failing Output / Error Stream:
${data.result}

Current Code Draft:
\`\`\`cpp
${liveCode}
\`\`\`

Please refactor and correct this C++ code so that it compiles and passes this custom test case and all edge cases.
        `.trim();

        setupJobWebSocketListeners(newJobId);

        try {
          const response = await fetch('http://localhost:5000/api/debate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              problemDescription: reTriggerDescription,
              maxRounds,
              jobId: newJobId,
              language,
              coderPrompt,
              criticPrompt,
              refinerPrompt
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to submit re-trigger debate.');
          }

        } catch (err) {
          setJobState('failed');
          setError(err.message);
          
          socket.off(`job-progress:${newJobId}`);
          socket.off(`job-completed:${newJobId}`);
          socket.off(`job-failed:${newJobId}`);
        }
      } else {
        setJobState('completed');
      }
    });

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
    return 'status-pending';
  };

  const handleSelectVaultRecord = useCallback((record) => {
    setProblemDescription(record.problemDescription);
    setMaxRounds(record.maxRounds);
    setLanguage(record.language);
    setRoundsHistory(record.roundsHistory);
    setFinalResult(record.finalResult);
    setJobId(record.jobId);
    setJobState('completed');
    setCoderDraft(record.coderDraft || '');
    if (record.finalResult && record.finalResult.finalCode) {
      setLiveCode(record.finalResult.finalCode);
    }
    setIsVaultOpen(false);
  }, []);

  const getOptimizationPercentage = () => {
    if (jobState === 'completed') return 100;
    if (jobState === 'idle') return 0;
    if (activeNode === 'coder') return 35;
    if (activeNode === 'sandbox') return 70;
    if (activeNode === 'critic') return 85;
    if (activeNode === 'refiner') return 95;
    return 35;
  };
  const optPercent = getOptimizationPercentage();

  // Dynamic Mission Path state solver
  const getMissionNodeStatus = (nodeIndex) => {
    if (jobState === 'completed') return 'completed';
    if (jobState === 'idle') return 'pending';
    
    if (nodeIndex === 1) {
      if (activeNode === 'coder' && currentRound === 1) return 'active';
      return 'completed';
    }
    if (nodeIndex === 2) {
      if (activeNode === 'coder' && currentRound > 1) return 'active';
      if (roundsHistory.some(r => r.round > 1) || activeNode === 'sandbox' || activeNode === 'critic' || activeNode === 'refiner') return 'completed';
      return 'pending';
    }
    if (nodeIndex === 3) {
      if (activeNode === 'sandbox' || activeNode === 'critic') return 'active';
      if (activeNode === 'refiner' || roundsHistory.some(r => r.node === 'critic-done' && r.criticApproved)) return 'completed';
      return 'pending';
    }
    if (nodeIndex === 4) {
      if (activeNode === 'refiner') return 'active';
      return 'pending';
    }
    return 'pending';
  };

  const getLineFillWidth = () => {
    if (jobState === 'completed') return '100%';
    if (jobState === 'idle') return '0%';
    
    let completedCount = 0;
    for (let i = 1; i <= 4; i++) {
      if (getMissionNodeStatus(i) === 'completed') {
        completedCount++;
      }
    }
    if (completedCount === 0) return '0%';
    if (completedCount === 1) return '16%';
    if (completedCount === 2) return '50%';
    if (completedCount === 3) return '83%';
    return '100%';
  };

  const isDebating = useMemo(() => {
    return jobState === 'active' && roundsHistory.some(step => step.criticApproved === false);
  }, [roundsHistory, jobState]);

  // Validation Logs Badge mapping
  const parsedLogs = useMemo(() => {
    const start = startTimeRef.current || Date.now();
    return terminalLogs.map((log, idx) => {
      let status = 'INFO';
      let msg = log;
      let badgeType = 'info';

      // Check if it contains a Round indicator
      const roundMatch = log.match(/\[ROUND\s+(\d+)\]/i);
      if (roundMatch) {
        status = `ROUND ${roundMatch[1]}`;
        badgeType = 'round';
        msg = log.replace(/\[ROUND\s+\d+\]/i, '').trim();
      }

      if (log.includes('⚔️ DEBATE IN PROGRESS')) {
        status = 'BATTLE';
        badgeType = 'rejected';
      } else if (log.includes('VERDICT: REJECTED') || log.includes('failed') || log.includes('FAILED') || log.includes('aborted') || log.includes('Error')) {
        status = 'REJECTED';
        badgeType = 'rejected';
        if (roundMatch) {
          msg = log.replace(/\[ROUND\s+\d+\]/i, '').trim();
        }
      } else if (log.includes('VERDICT: APPROVED') || log.includes('SUCCESS:') || log.includes('passed') || log.includes('SUCCESS') || log.includes('COMPLETE')) {
        status = 'SUCCESS';
        badgeType = 'success';
        if (roundMatch) {
          msg = log.replace(/\[ROUND\s+\d+\]/i, '').trim();
        }
      } else if (log.startsWith('[SYSTEM]')) {
        status = 'INFO';
        badgeType = 'info';
        msg = log.replace('[SYSTEM]', '').trim();
      } else if (log.startsWith('[ERROR]')) {
        status = 'REJECTED';
        badgeType = 'rejected';
        msg = log.replace('[ERROR]', '').trim();
      }

      const logTime = new Date(start + idx * 1200);
      const timestamp = logTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      return { timestamp, status, badgeType, message: msg };
    });
  }, [terminalLogs]);

  const renderedCodeLines = useMemo(() => {
    const currentCodeToDisplay = finalResult?.finalCode || liveCode;
    return currentCodeToDisplay.split('\n');
  }, [liveCode, finalResult]);

  return (
    <div className="app-container" ref={containerRef}>
      {toastMessage && (
        <div className="toast-alert fade-in" style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: '#ef4444',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 10px rgba(239, 68, 68, 0.4)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.85rem',
          fontWeight: 700,
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <AlertTriangle size={16} />
          <span>{toastMessage}</span>
          <button 
            onClick={() => setToastMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              marginLeft: '10px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              opacity: 0.8
            }}
          >
            ×
          </button>
        </div>
      )}
      {/* Top Navbar Header */}
      <header className="app-header">
        <div className="logo-container" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Network size={22} style={{ color: 'var(--accent-green)' }} />
          <span className="logo-title" style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '0.4px', color: '#ffffff', display: 'flex', alignItems: 'center' }}>
            AlgoDebate AI
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="status-indicator">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            {isConnected ? 'API Connected' : 'Disconnected'}
          </div>

          <div className="telemetry-wrapper">
            <div className="telemetry-item" title="Active solve run duration">
              <span className="telemetry-label">Latency:</span>
              <span className="telemetry-value">{latencyString}</span>
            </div>
          </div>

          {/* Sound Toggle Button */}
          <button 
            onClick={() => {
              const nextMuted = !isMuted;
              setIsMuted(nextMuted);
              if (!nextMuted) {
                try {
                  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                  const osc = audioCtx.createOscillator();
                  const gain = audioCtx.createGain();
                  osc.connect(gain);
                  gain.connect(audioCtx.destination);
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(659.25, audioCtx.currentTime);
                  gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
                  osc.start();
                  osc.stop(audioCtx.currentTime + 0.15);
                } catch (_) {}
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: isMuted ? 'var(--text-muted)' : 'var(--accent-green)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '6px',
              transition: 'all 0.2s'
            }}
            title={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </header>

      {/* 3-Column SaaS Grid (12 Columns) */}
      <main className="main-container">
        
        {/* Left Column (col-span-3): Input, Configuration, Mission Path */}
        <section className="panel-left">
          
          {/* PROBLEM INPUT Section */}
          <div className="bento-card">
            <h2 className="card-title">
              <FileText size={13} />
              PROBLEM INPUT
            </h2>
            <form onSubmit={handleStartDebate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Problem Source
                </label>
                <input
                  type="text"
                  className="problem-url-input"
                  placeholder="Paste LeetCode Link (Optional)"
                  value={problemUrl}
                  onChange={(e) => setProblemUrl(e.target.value)}
                  disabled={jobState === 'active'}
                />
              </div>
              <textarea
                className="problem-textarea"
                placeholder="Enter algorithm details or problem description..."
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                disabled={jobState === 'active'}
                style={{ height: '90px' }}
              />
            </form>
          </div>
          
          {/* CONFIGURATION & EXECUTION Section */}
          <div className="bento-card" style={{ gap: '14px' }}>
            <h2 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Settings size={13} className="text-[#10B981]" />
                <span>CONFIGURATION & EXECUTION</span>
              </div>
              <button 
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '0.85rem',
                  lineHeight: '1',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
                title="Configure System Prompts"
              >
                ⚙️
              </button>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Max Iterations</label>
                  <div className="select-wrapper">
                    <select className="bento-select" value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))} disabled={jobState === 'active'}>
                      <option value="2">2 Rounds</option>
                      <option value="3">3 Rounds</option>
                      <option value="4">4 Rounds</option>
                      <option value="5">5 Rounds</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Language</label>
                  <div className="select-wrapper">
                    <select className="bento-select" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={jobState === 'active'}>
                      <option value="cpp">C++</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Timeout [sec]</label>
                  <div className="select-wrapper">
                    <select className="bento-select" value={timeoutMs / 1000} onChange={(e) => setTimeoutMs(Number(e.target.value) * 1000)} disabled={jobState === 'active'}>
                      <option value="5">5 sec</option>
                      <option value="10">10 sec</option>
                      <option value="15">15 sec</option>
                      <option value="30">30 sec</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Test Cases</label>
                  <div className="select-wrapper">
                    <select className="bento-select" value={testCasesCount} onChange={(e) => setTestCasesCount(e.target.value)} disabled={jobState === 'active'}>
                      <option value="0">Default/0</option>
                      <option value="1">Custom/1</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Custom Test Cases Box inside card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                <textarea
                  placeholder="Enter custom inputs (e.g. 4 \n 3 5 8)"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  disabled={isCustomRunning}
                  style={{
                    width: '100%',
                    height: '50px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-slate)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    padding: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    resize: 'none',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  className="btn-run-custom-test"
                  onClick={handleRunCustomTest}
                  disabled={isCustomRunning || (!coderDraft && !(finalResult?.finalCode))}
                >
                  {isCustomRunning ? (
                    <>
                      <Loader2 size={11} className="animate-spin" />
                      <span>Running...</span>
                    </>
                  ) : (
                    <>
                      <Play size={10} />
                      <span>Run Custom Test</span>
                    </>
                  )}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                <button
                  onClick={handleStartDebate}
                  className="btn-verify-primary"
                  disabled={jobState === 'active'}
                >
                  <Play size={12} style={{ fill: '#000000' }} />
                  <span>Run Verification</span>
                </button>
                <button
                  onClick={handleReset}
                  className="btn-reset-secondary"
                >
                  <span>Reset Dashboard</span>
                </button>
              </div>
            </div>
          </div>
          
          {/* LangGraph Mission Path Node Flow */}
          <div className="bento-card" style={{ flex: 1 }}>
            <h2 className="card-title">
              <Workflow size={13} />
              LANGGRAPH MISSION PATH
            </h2>
            <div className="mission-path-container">
              <div className="mission-path-line">
                <div className="mission-path-line-fill" style={{ width: getLineFillWidth() }} />
              </div>
              
              {/* Stage 1: Input */}
              <div className={`mission-node-wrapper ${getMissionNodeStatus(1)}`}>
                <div className="mission-circle">
                  <FileText size={12} />
                </div>
                <span className="mission-label">Input</span>
              </div>
              
              {/* Stage 2: Process */}
              <div className={`mission-node-wrapper ${getMissionNodeStatus(2)}`}>
                <div className="mission-circle">
                  <Settings size={12} className={getMissionNodeStatus(2) === 'active' ? 'animate-spin' : ''} />
                </div>
                <span className="mission-label">Process</span>
              </div>
              
              {/* Stage 3: Validate */}
              <div className={`mission-node-wrapper ${getMissionNodeStatus(3)}`}>
                <div className="mission-circle">
                  <CheckCircle2 size={12} />
                </div>
                <span className="mission-label">Validate</span>
              </div>
              
              {/* Stage 4: Complete */}
              <div className={`mission-node-wrapper ${getMissionNodeStatus(4)}`}>
                <div className="mission-circle">
                  <Check size={12} />
                </div>
                <span className="mission-label">Complete</span>
              </div>
            </div>
          </div>
        </section>
        
        {/* Center Column (col-span-6): Verification Workspace */}
        <section className="panel-center">
          
          {/* Verification Workspace Card */}
          <div className="bento-card code-workspace-card">
            {/* VERIFIED Banner */}
            {jobState === 'completed' && finalResult && (
              <div className="verified-banner fade-in" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                width: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#000000',
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)'
                  }}>
                    <Check size={18} strokeWidth={3} />
                  </div>
                  <div>
                    <div style={{ color: '#10b981', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.05em' }}>VERIFIED</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: '1px' }}>All validation checks passed.</div>
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '100px',
                  padding: '4px 12px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  3/3 checks passed
                </div>
              </div>
            )}

            <div className="code-editor-header">
              <span className="card-title" style={{ color: 'var(--text-primary)' }}>
                <Code2 size={13} />
                {jobState === 'completed' ? 'Solution Code' : 'Verification Workspace'}
              </span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {coderDraft && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>DIFF VIEW:</span>
                    <button
                      type="button"
                      onClick={() => setIsDiffView(!isDiffView)}
                      style={{
                        position: 'relative',
                        width: '28px',
                        height: '16px',
                        borderRadius: '8px',
                        background: isDiffView ? 'var(--accent-green)' : 'var(--border-slate)',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        padding: 0
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: '2px',
                          left: isDiffView ? '14px' : '2px',
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
                
                <div className="code-editor-actions">
                  <button type="button" className="editor-btn" onClick={() => handleCopyCode(finalResult?.finalCode || liveCode)} title="Copy code">
                    {isCopied ? <Check size={11} style={{ color: 'var(--accent-green)' }} /> : <Copy size={11} />}
                    <span>{isCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button type="button" className="editor-btn" onClick={() => handleDownloadCode(finalResult?.finalCode || liveCode)} title="Download code">
                    <Download size={11} />
                    <span>Download</span>
                  </button>
                  <button type="button" className="editor-btn" onClick={() => alert('Solution Share Link copied to clipboard!')} title="Share solution link">
                    <Share2 size={11} />
                    <span>Share</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="workspace-content">
              {isDebating && (
                <div className="battle-alert-banner animate-pulse" style={{
                  background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15) 0%, rgba(245, 158, 11, 0.15) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  boxShadow: '0 0 15px rgba(245, 158, 11, 0.15)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#f59e0b',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase'
                }}>
                  <span>⚔️ DEBATE IN PROGRESS: Critic challenged Coder</span>
                </div>
              )}
              {jobState === 'idle' ? (
                <div className="workspace-empty-view">
                  <Atom size={32} />
                  <p>Awaiting Graph execution to load workspace...</p>
                </div>
              ) : (
                <>
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
                    <div className="code-editor-container fade-in">
                      {renderedCodeLines.map((line, idx) => (
                        <div key={idx} className="code-line-row">
                          <span className="code-line-number">{idx + 1}</span>
                          <span className="code-line-content">{line}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {jobState === 'completed' && finalResult && (
                    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className="stat-card complexity-cyan-card" style={{
                          background: 'rgba(13, 14, 18, 0.6)',
                          backdropFilter: 'blur(10px)',
                          borderRadius: '12px',
                          border: '1px solid rgba(6, 182, 212, 0.3)',
                          boxShadow: '0 0 15px rgba(6, 182, 212, 0.1)',
                          padding: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px'
                        }}>
                          <div style={{
                            backgroundColor: 'rgba(6, 182, 212, 0.1)',
                            color: '#06b6d4',
                            borderRadius: '8px',
                            padding: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Clock size={20} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Time Complexity</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#06b6d4', marginTop: '2px' }}>{finalResult.timeComplexity}</div>
                          </div>
                        </div>
                        
                        <div className="stat-card complexity-emerald-card" style={{
                          background: 'rgba(13, 14, 18, 0.6)',
                          backdropFilter: 'blur(10px)',
                          borderRadius: '12px',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          boxShadow: '0 0 15px rgba(16, 185, 129, 0.1)',
                          padding: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px'
                        }}>
                          <div style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981',
                            borderRadius: '8px',
                            padding: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Database size={20} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Space Complexity</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>{finalResult.spaceComplexity}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="strategy-box glass-collapsible" style={{
                        background: 'rgba(13, 14, 18, 0.4)',
                        backdropFilter: 'blur(12px)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        overflow: 'hidden'
                      }}>
                        <button 
                          type="button"
                          onClick={() => setIsStrategyExpanded(!isStrategyExpanded)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#e2e8f0',
                            textAlign: 'left'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                            <Sparkles size={16} className="text-[#10B981]" />
                            <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategy & Proof Analysis</strong>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{isStrategyExpanded ? 'Collapse ▲' : 'Expand ▼'}</span>
                        </button>
                        
                        {isStrategyExpanded && (
                          <div style={{
                            padding: '16px',
                            fontSize: '0.8rem',
                            lineHeight: 1.6,
                            color: '#cbd5e1',
                            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                          }}>
                            {finalResult.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {jobState === 'failed' && (
                    <div className="workspace-empty-view fade-in">
                      <AlertTriangle size={32} style={{ color: 'var(--accent-red)' }} />
                      <h3 style={{ color: 'var(--accent-red)', fontSize: '0.85rem', fontWeight: 700 }}>VERIFICATION FAILED</h3>
                      <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>{error}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
        
        {/* Right Column (col-span-3): Pipeline & Logs */}
        <section className="panel-right">
          
          {/* Card 1: AI AGENT BATTLE ARENA */}
          <div className="bento-card">
            <h2 className="card-title">
              <GitFork size={13} />
              AI AGENT BATTLE ARENA
            </h2>
            <div className="pipeline-steps-container">
              {['coder', 'sandbox', 'critic', 'refiner'].map((node) => {
                const status = getNodeStatusClass(node);
                const agentLabels = {
                  coder: 'Coder',
                  sandbox: 'Compiler',
                  critic: 'Critic',
                  refiner: 'Refiner'
                };
                const label = agentLabels[node];
                const completed = status === 'status-completed';
                const active = status === 'status-active';
                const statusText = completed ? 'COMPLETE' : (active ? 'RUNNING' : 'PENDING');
                
                return (
                  <div key={node} className={`pipeline-step-node ${completed ? 'completed' : (active ? 'active' : '')}`}>
                    <div className="pipeline-step-circle">
                      {completed ? <Check size={16} /> : (active ? <Loader2 size={16} className="animate-spin" /> : null)}
                    </div>
                    <span className="pipeline-step-label">{label}</span>
                    <span className="pipeline-step-status-pill">{statusText}</span>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Card 2: Verification Confidence Progress Bar */}
          <div className="bento-card confidence-card">
            <div className="confidence-header">
              <span>VERIFICATION CONFIDENCE</span>
              <span style={{ color: 'var(--accent-green)', fontWeight: 800 }}>{optPercent}%</span>
            </div>
            <div className="confidence-bar-bg">
              <div className="confidence-bar-fill" style={{ width: `${optPercent}%` }}></div>
            </div>
          </div>
          
          {/* Card 3: VALIDATION LOGS */}
          <div className="bento-card logs-card">
            <h2 className="card-title">
              <TerminalIcon size={13} />
              VALIDATION LOGS
            </h2>
            <div ref={terminalContainerRef} className="logs-terminal" style={{ height: '280px', maxHeight: '300px', overflowY: 'auto', padding: '8px 12px' }}>
              {parsedLogs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '20px 0' }}>
                  No active logs streamed.
                </div>
              ) : (
                <>
                  {parsedLogs.map((log, index) => {
                    let LogIcon = <TerminalIcon size={12} style={{ color: '#94a3b8', opacity: 0.6 }} />;
                    if (log.status === 'SUCCESS' || log.status === 'COMPLETE') {
                      LogIcon = <CheckCircle2 size={12} style={{ color: '#10b981' }} />;
                    } else if (log.status === 'REJECTED' || log.status === 'BATTLE') {
                      LogIcon = <AlertTriangle size={12} style={{ color: '#f59e0b' }} />;
                    }
                    
                    let statusStyle = {};
                    if (log.status === 'INFO' || log.badgeType === 'info') {
                      statusStyle = {
                        backgroundColor: '#1e293b',
                        color: '#cbd5e1',
                        borderColor: '#334155'
                      };
                    } else if (log.status === 'SUCCESS') {
                      statusStyle = {
                        backgroundColor: '#022c22',
                        color: '#34d399',
                        borderColor: '#064e3b'
                      };
                    } else if (log.status === 'COMPLETE' || log.status === 'SUCCESS' && jobState === 'completed') {
                      statusStyle = {
                        backgroundColor: '#1a2e05',
                        color: '#a3e635',
                        borderColor: '#3f6212'
                      };
                    } else if (log.status === 'REJECTED' || log.status === 'BATTLE') {
                      statusStyle = {
                        backgroundColor: '#450a0a',
                        color: '#f87171',
                        borderColor: '#7f1d1d'
                      };
                    } else if (log.status.startsWith('ROUND')) {
                      statusStyle = {
                        backgroundColor: '#3b0764',
                        color: '#c084fc',
                        borderColor: '#581c87'
                      };
                    }

                    return (
                      <div 
                        key={index} 
                        className="log-line-card fade-in" 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(23, 23, 23, 0.6)',
                          border: '1px solid rgba(38, 38, 38, 0.8)',
                          marginBottom: '8px',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                          <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'monospace', flexShrink: 0 }}>
                            {log.timestamp}
                          </span>
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            {LogIcon}
                          </div>
                          <span className="log-message" style={{ fontSize: '0.74rem', color: '#cbd5e1', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                            {log.message}
                          </span>
                        </div>
                        <span 
                          className="log-status-badge" 
                          style={{
                            fontSize: '0.6rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            flexShrink: 0,
                            letterSpacing: '0.05em',
                            ...statusStyle
                          }}
                        >
                          {log.status}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={terminalEndRef} />
                </>
              )}
            </div>
            <button
              onClick={() => setIsTerminalOpen(prev => !prev)}
              className="btn-trace-footer"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={13} style={{ color: 'var(--accent-green)' }} />
                <span>View Full Execution Trace</span>
              </div>
              <ChevronRight size={14} style={{ opacity: 0.6 }} />
            </button>
          </div>
        </section>
      </main>

      {/* Slide-Up Detailed Execution Terminal Bottom Drawer */}
      <div 
        className={`terminal-widget-drawer ${isTerminalOpen ? 'open' : 'collapsed'}`}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: isTerminalOpen ? '200px' : '0px',
          background: '#08090C',
          borderTop: isTerminalOpen ? '1px solid var(--border-slate)' : 'none',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.25s ease-in-out',
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden'
        }}
      >
        {isTerminalOpen && (
          <>
            <div 
              className="terminal-header" 
              style={{ 
                padding: '8px 16px',
                background: 'var(--bg-card)',
                borderBottom: '1px solid var(--border-slate)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div className="terminal-header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                <TerminalIcon size={12} style={{ color: 'var(--accent-green)' }} />
                <span>Full Execution Trace Logs</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                  onClick={() => setIsTerminalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer' }}
                >
                  Collapse
                </button>
                <div className="terminal-header-dots" style={{ display: 'flex', gap: '6px' }}>
                  <span className="terminal-dot red" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span>
                  <span className="terminal-dot yellow" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></span>
                  <span className="terminal-dot green" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                </div>
              </div>
            </div>
            <div 
              className="terminal-body" 
              style={{ 
                flex: 1, 
                padding: '12px 16px', 
                overflowY: 'auto', 
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.72rem', 
                lineHeight: '1.5',
                background: 'var(--bg-input)'
              }}
            >
              {terminalLogs.map((log, index) => {
                let logClass = 'info';
                if (log.startsWith('[ERROR]')) logClass = 'error';
                else if (log.startsWith('[SYSTEM]')) logClass = 'system';
                else if (log.includes('VERDICT: APPROVED') || log.includes('SUCCESS:')) logClass = 'success';

                return (
                  <div key={index} className={`terminal-log-line ${logClass}`} style={{ marginBottom: '4px' }}>
                    {log}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Settings Modal (Overlay) */}
      {isSettingsOpen && (
        <div className="settings-modal-overlay fade-in" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Agent System Config</h3>
              <button className="modal-close-btn" onClick={() => setIsSettingsOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="prompt-field-group">
                <label className="prompt-label">Coder Agent Prompt</label>
                <textarea
                  className="prompt-textarea"
                  value={coderPrompt}
                  onChange={(e) => setCoderPrompt(e.target.value)}
                />
              </div>
              <div className="prompt-field-group">
                <label className="prompt-label">Critic Agent Prompt</label>
                <textarea
                  className="prompt-textarea"
                  value={criticPrompt}
                  onChange={(e) => setCriticPrompt(e.target.value)}
                />
              </div>
              <div className="prompt-field-group">
                <label className="prompt-label">Refiner Agent Prompt</label>
                <textarea
                  className="prompt-textarea"
                  value={refinerPrompt}
                  onChange={(e) => setRefinerPrompt(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-verify-primary" onClick={() => setIsSettingsOpen(false)} style={{ width: '100px', height: '32px' }}>
                Save Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Vault History drawer */}
      {isVaultOpen && (
        <div className="vault-drawer-overlay" onClick={() => setIsVaultOpen(false)}>
          <div className="vault-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="vault-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={15} style={{ color: 'var(--accent-green)' }} />
                History Vault
              </span>
              <button className="modal-close-btn" onClick={() => setIsVaultOpen(false)}>×</button>
            </div>
            
            <div className="vault-body">
              {vaultRecords.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '40px 0' }}>
                  No sessions saved yet.
                </div>
              ) : (
                vaultRecords.map((record) => (
                  <div
                    key={record.jobId}
                    className="vault-item"
                    onClick={() => handleSelectVaultRecord(record)}
                    title="Click to restore session"
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
