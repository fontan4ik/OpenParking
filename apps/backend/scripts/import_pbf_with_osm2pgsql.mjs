import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const inputPath = path.resolve(
  root,
  argValue('--input', path.join('data', 'osm', 'san-francisco.osm.pbf'))
);
const schema = argValue('--schema', 'osm_raw');
const dryRun = process.argv.includes('--dry-run');

const databaseUrl = process.env.DATABASE_URL;

function databaseArgsFromUrl(value) {
  if (!value) {
    throw new Error('DATABASE_URL is required for osm2pgsql import.');
  }

  const url = new URL(value);
  return [
    '--database',
    url.pathname.replace(/^\//, ''),
    '--host',
    url.hostname,
    '--port',
    url.port || '5432',
    '--username',
    decodeURIComponent(url.username),
  ];
}

async function main() {
  const args = [
    ...databaseArgsFromUrl(databaseUrl),
    '--create',
    '--slim',
    '--hstore',
    '--multi-geometry',
    '--latlong',
    '--schema',
    schema,
    inputPath,
  ];
  const command = ['osm2pgsql', ...args];

  if (dryRun) {
    console.log(command.join(' '));
    return;
  }

  await access(inputPath);

  const probe = spawnSync('osm2pgsql', ['--version'], {
    encoding: 'utf8',
    shell: true,
  });

  if (probe.status !== 0) {
    console.error(
      [
        'osm2pgsql was not found on PATH.',
        'Install/use the external tool from Referenss/osm2pgsql, then rerun:',
        command.join(' '),
      ].join('\n')
    );
    process.exitCode = 1;
    return;
  }

  const result = spawnSync('osm2pgsql', args, {
    encoding: 'utf8',
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      PGPASSWORD: new URL(databaseUrl).password,
    },
  });

  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
