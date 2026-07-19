import { spawn, exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');

/**
 * Ensures the temporary directory exists.
 */
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Normalizes output string for fair comparison.
 */
function normalizeOutput(str) {
  return str
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter((line, index, arr) => {
      if (line === '' && index === arr.length - 1) return false;
      return true;
    })
    .join('\n')
    .trim();
}

/**
 * Runs a process with stdin input redirection and timeout protection.
 */
function runProcess(cmd, args, input, timeoutMs) {
  return new Promise((resolve) => {
    const startTime = process.hrtime();
    const child = args ? spawn(cmd, args) : spawn(cmd);

    let stdout = '';
    let stderr = '';
    let isTimeout = false;

    const timeout = setTimeout(() => {
      isTimeout = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      const diff = process.hrtime(startTime);
      const timeMs = Math.round(diff[0] * 1000 + diff[1] / 1000000);
      resolve({
        status: 'RTE',
        actualOutput: '',
        error: err.message,
        timeMs
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      const diff = process.hrtime(startTime);
      const timeMs = Math.round(diff[0] * 1000 + diff[1] / 1000000);

      if (isTimeout) {
        resolve({
          status: 'TLE',
          actualOutput: '',
          error: 'Execution timed out.',
          timeMs
        });
      } else if (code !== 0 || signal) {
        resolve({
          status: 'RTE',
          actualOutput: stdout,
          error: stderr || `Process exited with code ${code} or signal ${signal}`,
          timeMs
        });
      } else {
        resolve({
          status: 'OK',
          actualOutput: stdout,
          error: stderr,
          timeMs
        });
      }
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

/**
 * Main function to compile and run code against multiple test cases.
 * Supports C++, Python, and Java.
 * 
 * @param {string} code - Source code.
 * @param {Array<{input: string, expectedOutput: string}>} testCases - List of test cases.
 * @param {string} [language='cpp'] - Target language ('cpp', 'python', 'java').
 * @param {number} [timeoutMs=2000] - Hard timeout limit per test case.
 * @returns {Promise<{success: boolean, compileSuccess: boolean, compileError?: string, results?: Array<any>}>}
 */
export async function executeCpp(code, testCases, language = 'cpp', timeoutMs = 2000) {
  if (typeof language === 'number') {
    timeoutMs = language;
    language = 'cpp';
  }
  
  await ensureTempDir();
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (language === 'cpp') {
    const sourcePath = path.join(TEMP_DIR, `solution_${id}.cpp`);
    const exePath = path.join(TEMP_DIR, `solution_${id}.exe`);

    try {
      await fs.writeFile(sourcePath, code);
      const compilation = await new Promise((resolve) => {
        exec(`g++ -O3 "${sourcePath}" -o "${exePath}"`, (error, stdout, stderr) => {
          if (error) resolve({ success: false, error: stderr || stdout || error.message });
          else resolve({ success: true });
        });
      });

      if (!compilation.success) {
        return {
          success: false,
          compileSuccess: false,
          compileError: compilation.error
        };
      }

      const results = [];
      for (const testCase of testCases) {
        const runResult = await runProcess(exePath, null, testCase.input, timeoutMs);
        let finalStatus = runResult.status;
        if (runResult.status === 'OK') {
          finalStatus = normalizeOutput(runResult.actualOutput) === normalizeOutput(testCase.expectedOutput) ? 'PASS' : 'FAIL';
        }
        results.push({
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: runResult.actualOutput,
          status: finalStatus,
          timeMs: runResult.timeMs,
          error: runResult.error
        });
      }
      return { success: true, compileSuccess: true, results };
    } finally {
      try { await fs.unlink(sourcePath); } catch (_) {}
      try { await fs.unlink(exePath); } catch (_) {}
    }
  }

  if (language === 'python') {
    const sourcePath = path.join(TEMP_DIR, `solution_${id}.py`);
    try {
      await fs.writeFile(sourcePath, code);
      const results = [];
      for (const testCase of testCases) {
        const cmd = process.platform === 'win32' ? 'python' : 'python3';
        const runResult = await runProcess(cmd, [sourcePath], testCase.input, timeoutMs);
        let finalStatus = runResult.status;
        if (runResult.status === 'OK') {
          finalStatus = normalizeOutput(runResult.actualOutput) === normalizeOutput(testCase.expectedOutput) ? 'PASS' : 'FAIL';
        }
        results.push({
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: runResult.actualOutput,
          status: finalStatus,
          timeMs: runResult.timeMs,
          error: runResult.error
        });
      }
      return { success: true, compileSuccess: true, results };
    } finally {
      try { await fs.unlink(sourcePath); } catch (_) {}
    }
  }

  if (language === 'java') {
    const match = code.match(/public\s+class\s+(\w+)/) || code.match(/class\s+(\w+)/);
    const className = match ? match[1] : 'Main';
    
    const javaDir = path.join(TEMP_DIR, `java_${id}`);
    await fs.mkdir(javaDir, { recursive: true });
    
    const sourcePath = path.join(javaDir, `${className}.java`);
    try {
      await fs.writeFile(sourcePath, code);
      const compilation = await new Promise((resolve) => {
        exec(`javac "${sourcePath}"`, (error, stdout, stderr) => {
          if (error) resolve({ success: false, error: stderr || stdout || error.message });
          else resolve({ success: true });
        });
      });

      if (!compilation.success) {
        return {
          success: false,
          compileSuccess: false,
          compileError: compilation.error
        };
      }

      const results = [];
      for (const testCase of testCases) {
        const runResult = await runProcess('java', ['-cp', javaDir, className], testCase.input, timeoutMs);
        let finalStatus = runResult.status;
        if (runResult.status === 'OK') {
          finalStatus = normalizeOutput(runResult.actualOutput) === normalizeOutput(testCase.expectedOutput) ? 'PASS' : 'FAIL';
        }
        results.push({
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: runResult.actualOutput,
          status: finalStatus,
          timeMs: runResult.timeMs,
          error: runResult.error
        });
      }
      return { success: true, compileSuccess: true, results };
    } finally {
      try {
        await fs.rm(javaDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  return { success: false, compileSuccess: false, compileError: 'Unsupported language: ' + language };
}
