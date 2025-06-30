import { exec } from 'child_process';

const isFix = process.argv.includes('--fix');
const command = `eslint .${isFix ? ' --fix' : ''}`;

exec(command, (error, stdout, stderr) => {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (!stdout && !stderr) {
    console.log('\x1b[32m%s\x1b[0m', '✔ No ESLint warnings or errors');
  } else {
    console.log('\x1b[31m%s\x1b[0m', '❌ ESLint found issues');
  }

  process.exit(error ? 1 : 0);
});
