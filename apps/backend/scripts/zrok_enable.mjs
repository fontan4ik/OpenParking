import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getZrokCommand, getZrokDisplayCommand } from './zrok_cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(root);

const zrokCommand = getZrokCommand();
const zrokDisplayCommand = getZrokDisplayCommand(zrokCommand);

function printMissingZrokHelp() {
  console.error(`
zrok CLI is not available in this terminal.

ParkingUSA looked for zrok in this order:

  ZROK_PATH
  C:\\zrok\\zrok2.exe
  C:\\zrok\\zrok.exe
  zrok from PATH

Set ZROK_PATH in .env.local if your working zrok binary lives elsewhere.
Then verify:

  ${zrokDisplayCommand} version

Windows options:
  1. Download the zrok CLI from https://docs.zrok.io/docs/getting-started/
  2. Or reuse an existing binary, for example: ZROK_PATH=C:\\zrok\\zrok2.exe

After zrok works, set ZROK_ENABLE_TOKEN and run:

  npm run zrok:enable
`);
}

function getSavedZrokToken() {
  const environmentPath = path.join(os.homedir(), '.zrok2', 'environment.json');

  if (!existsSync(environmentPath)) {
    return '';
  }

  try {
    const environment = JSON.parse(readFileSync(environmentPath, 'utf8'));
    return typeof environment.zrok_token === 'string' ? environment.zrok_token : '';
  } catch {
    return '';
  }
}

const token = process.env.ZROK_ENABLE_TOKEN || getSavedZrokToken();

if (!token) {
  console.error('Set ZROK_ENABLE_TOKEN in your shell or .env.local, or enable zrok once so ~/.zrok2/environment.json exists. Do not commit tokens.');
  process.exit(1);
}

const versionCheck = spawnSync(zrokCommand, ['version'], {
  encoding: 'utf8',
  shell: true,
});

if (versionCheck.error || versionCheck.status !== 0) {
  printMissingZrokHelp();
  process.exit(1);
}

const result = spawnSync(zrokCommand, ['enable', token], {
  encoding: 'utf8',
  shell: true,
});

const output = `${result.stdout || ''}${result.stderr || ''}`;

if (output) {
  process.stdout.write(output);
}

if (result.status !== 0 && output.includes('already have an enabled environment')) {
  console.log('zrok environment is already enabled; continuing.');
  process.exit(0);
}

process.exit(result.status ?? 1);
