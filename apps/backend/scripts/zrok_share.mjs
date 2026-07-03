import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getZrokCommand, getZrokDisplayCommand } from './zrok_cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(root);

const mode = process.argv[2] === 'private' ? 'private' : 'public';
const target = process.argv[3] || process.env.ZROK_SHARE_TARGET || 'localhost:3000';
const shareToken = process.env.ZROK_SHARE_TOKEN?.trim();
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

After zrok works, run:

  npm run zrok:enable
  npm run dev:public
  npm run share:zrok
`);
}

const versionCheck = spawnSync(zrokCommand, ['version'], {
  encoding: 'utf8',
  shell: true,
});

if (versionCheck.error || versionCheck.status !== 0) {
  printMissingZrokHelp();
  process.exit(1);
}

const targetUrl = /^https?:\/\//i.test(target) ? target : `http://${target}`;
const args = shareToken
  ? ['share', mode, targetUrl, '--share-token', shareToken, '--headless']
  : ['share', mode, '--headless', '--backend-mode', 'proxy', targetUrl];
const urlPattern = /(?:https?:\/\/)?[a-zA-Z0-9-]+\.shares?\.zrok\.io/g;
const privateAccessPattern = /zrok2?\s+access\s+private\s+[a-zA-Z0-9-]+/i;
const shareServerErrorPattern = /shareInternalServerError|unable to create share/i;
let printedShareInfo = false;
let printedShareErrorHelp = false;

function normalizeZrokUrl(rawUrl) {
  return rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? rawUrl
    : `https://${rawUrl}`;
}

function inspectOutputForUrl(output) {
  const matches = output.match(urlPattern);

  if (!matches || printedShareInfo) {
    return;
  }

  printedShareInfo = true;
  console.log(`\nPublic zrok URL: ${normalizeZrokUrl(matches[0])}\n`);
}

function inspectOutputForPrivateAccess(output) {
  const match = output.match(privateAccessPattern);

  if (!match || printedShareInfo) {
    return;
  }

  printedShareInfo = true;
  console.log(`\nPrivate zrok access command: ${match[0]}\n`);
}

function inspectOutputForShareInfo(output) {
  inspectOutputForShareError(output);

  if (mode === 'private') {
    inspectOutputForPrivateAccess(output);
    return;
  }

  inspectOutputForUrl(output);
}

function inspectOutputForShareError(output) {
  if (printedShareErrorHelp || shareToken || !shareServerErrorPattern.test(output)) {
    return;
  }

  printedShareErrorHelp = true;
  console.error(`
zrok could not create a new ${mode} share.
If this account already has a reusable share for ${targetUrl}, set ZROK_SHARE_TOKEN and rerun this command.

Find existing shares:
  ${zrokDisplayCommand} overview

PowerShell example:
  $env:ZROK_SHARE_TOKEN="<existing-share-token>"
  npm run ${mode === 'private' ? 'share:zrok:private' : 'share:zrok'}
`);
}

console.log(`Starting zrok: ${zrokDisplayCommand} ${args.join(' ')}`);

const child = spawn(zrokCommand, args, {
  shell: true,
});

child.stdout?.on('data', (chunk) => {
  const output = chunk.toString();
  process.stdout.write(output);
  inspectOutputForShareInfo(output);
});

child.stderr?.on('data', (chunk) => {
  const output = chunk.toString();
  process.stderr.write(output);
  inspectOutputForShareInfo(output);
});

child.on('error', (error) => {
  console.error(`Failed to start zrok: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(0);
  }

  process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

setTimeout(() => {
  if (!printedShareInfo) {
    const expectedOutput = mode === 'private' ? 'private access command' : 'public URL';
    console.log(`zrok is still running, but no ${expectedOutput} has appeared yet. Check zrok output above.`);
  }
}, 30000);
