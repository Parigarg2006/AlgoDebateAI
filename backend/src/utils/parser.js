/**
 * Helper to extract sample test cases from a problem description.
 * Looks for sections like "Example 1:", "Input:", "Output:" and parses inputs/outputs.
 */
export function extractSampleTestCases(description) {
  if (!description) return [];
  const testCases = [];
  
  // Regex to find Example blocks containing Input and Output
  const exampleRegex = /(?:Example\s*\d+|Example\s*:\s*)[\s\S]*?Input:\s*([\s\S]*?)Output:\s*([\s\S]*?)(?=\n\s*(?:Example|Constraints|Explanation|Note|Output|$))/gi;
  
  let match;
  while ((match = exampleRegex.exec(description)) !== null) {
    let inputRaw = match[1].trim();
    let outputRaw = match[2].trim();
    
    // Clean string by stripping HTML tags and trimming extra lines
    const cleanStr = (str) => {
      // Find the first line or content before explanation/constraints
      let firstPart = str.split(/(?:\n\s*\n|\n\s*(?:Explanation|Note|Constraints|Input|Output))/gi)[0];
      return firstPart
        .replace(/&nbsp;/g, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/[\r\n]+/g, '\n')
        .trim();
    };

    const cleanInput = cleanStr(inputRaw);
    const cleanOutput = cleanStr(outputRaw);

    if (cleanInput && cleanOutput) {
      testCases.push({
        input: cleanInput,
        expectedOutput: cleanOutput
      });
    }
  }
  return testCases;
}
