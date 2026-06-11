import { spawn } from 'node:child_process';

const steps = [
  ['npm', ['run', 'research:manifests']],
  ['npm', ['run', 'research:gap-workflows']],
  ['npm', ['run', 'research:validate']],
  ['npm', ['run', 'research:inspect:socrata:benchmarks']],
  ['npm', ['run', 'research:inspect:arcgis:benchmarks']],
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: true,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

for (const [command, args] of steps) {
  await run(command, args);
}

console.log('Phase 6 research worker v0 completed.');
