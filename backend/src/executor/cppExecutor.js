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
 * Compiles the C++ code to an executable.
 * @param {string} sourcePath - Absolute path to the .cpp source file.
 * @param {string} exePath - Absolute path to the output executable.
 * @returns {Promise<{success: boolean, error: string}>}
 */
function compileCpp(sourcePath, exePath) {
  return new Promise((resolve) => {
    // Compile using g++ with -O3 optimization for competitive programming speeds
    const compileCmd = `g++ -O3 "${sourcePath}" -o "${exePath}"`;
    exec(compileCmd, (error, stdout, stderr) => {
      if (error) {
        resolve({
          success: false,
          error: stderr || stdout || error.message
        });
      } else {
        resolve({
          success: true,
          error: ''
        });
      }
    });
  });
}

/**
 * Runs the compiled executable against a single test case input.
 * @param {string} exePath - Absolute path to the executable.
 * @param {string} input - The input string to feed into stdin.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @returns {Promise<{status: string, actualOutput: string, error: string, timeMs: number}>}
 */
function runTestCase(exePath, input, timeoutMs) {
  return new Promise((resolve) => {
    const startTime = process.hrtime();
    const child = spawn(exePath);

    let stdout = '';
    let stderr = '';
    let isTimeout = false;

    // Set timeout to kill the process if it runs too long (infinite loop protection)
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
        status: 'RTE', // Runtime Error
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
          status: 'TLE', // Time Limit Exceeded
          actualOutput: '',
          error: 'Execution timed out.',
          timeMs
        });
      } else if (code !== 0 || signal) {
        resolve({
          status: 'RTE', // Runtime Error (e.g., Segfault, non-zero exit)
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

    // Write inputs to standard input and close it
    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

/**
 * Normalizes output string for fair comparison (strips trailing whitespaces, carriage returns, and newlines).
 * @param {string} str 
 * @returns {string}
 */
function normalizeOutput(str) {
  return str
    .replace(/\r\n/g, '\n') // Normalize Windows line endings
    .split('\n')
    .map(line => line.trimEnd()) // Trim trailing spaces on each line
    .filter((line, index, arr) => {
      // Remove trailing empty lines
      if (line === '' && index === arr.length - 1) return false;
      return true;
    })
    .join('\n')
    .trim(); // Trim overall start and end whitespace
}

/**
 * Main function to compile and run C++ code against multiple test cases.
 * @param {string} code - The C++ source code.
 * @param {Array<{input: string, expectedOutput: string}>} testCases - The list of test cases.
 * @param {number} [timeoutMs=2000] - Hard timeout limit per test case.
 * @returns {Promise<{success: boolean, compileSuccess: boolean, compileError?: string, results?: Array<any>}>}
 */
export async function executeCpp(code, testCases, timeoutMs = 2000) {
  await ensureTempDir();

  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const sourcePath = path.join(TEMP_DIR, `solution_${id}.cpp`);
  const exePath = path.join(TEMP_DIR, `solution_${id}.exe`); // On Windows, g++ adds .exe automatically or matches target

  try {
    // 1. Write the code to source file
    await fs.writeFile(sourcePath, code);

    // 2. Compile code
    const compilation = await compileCpp(sourcePath, exePath);
    if (!compilation.success) {
      return {
        success: false,
        compileSuccess: false,
        compileError: compilation.error
      };
    }

    // 3. Execute against each test case
    const results = [];
    for (const testCase of testCases) {
      const runResult = await runTestCase(exePath, testCase.input, timeoutMs);
      
      let finalStatus = runResult.status;
      if (runResult.status === 'OK') {
        const normalizedActual = normalizeOutput(runResult.actualOutput);
        const normalizedExpected = normalizeOutput(testCase.expectedOutput);
        if (normalizedActual === normalizedExpected) {
          finalStatus = 'PASS';
        } else {
          finalStatus = 'FAIL';
        }
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

    return {
      success: true,
      compileSuccess: true,
      results
    };

  } finally {
    // 4. Cleanup files
    try {
      await fs.unlink(sourcePath);
    } catch (_) {}
    try {
      await fs.unlink(exePath);
    } catch (_) {}
  }
}
