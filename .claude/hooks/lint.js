const { ESLint } = require('eslint');

/**
 * @param {string} filePath
 */
async function lintWithEslint(filePath) {
  const eslint = new ESLint({ fix: true });

  if (await eslint.isPathIgnored(filePath)) {
    return '';
  }

  const results = await eslint.lintFiles([filePath]);
  await ESLint.outputFixes(results);

  const formatter = await eslint.loadFormatter('stylish');
  return await formatter.format(results);
}

let data = '';
process.stdin.on('data', (chunk) => (data += chunk));
process.stdin.on('end', async () => {
  const input = JSON.parse(data);
  const filePath = input.tool_input.file_path;

  const output = await lintWithEslint(filePath);

  if (output) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: output },
      }),
    );
  }
});
