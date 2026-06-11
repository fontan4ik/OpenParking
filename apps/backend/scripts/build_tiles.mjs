import { spawnSync } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const inputPath = path.resolve(
  root,
  argValue('--input', path.join('data', 'sf_parking_zones_osm.geojson'))
);
const outputPath = path.resolve(
  root,
  argValue('--output', path.join('data', 'tiles', 'parkingusa_sf.mbtiles'))
);
const dryRun = process.argv.includes('--dry-run');

const args = [
  '-zg',
  '-o',
  outputPath,
  '--force',
  '--drop-densest-as-needed',
  '--extend-zooms-if-still-dropping',
  '--name',
  'ParkingUSA SF parking zones',
  inputPath,
];

async function main() {
  await access(inputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const command = ['tippecanoe', ...args];
  if (dryRun) {
    console.log(command.join(' '));
    return;
  }

  const probe = spawnSync('tippecanoe', ['--version'], {
    encoding: 'utf8',
    shell: true,
  });

  if (probe.status !== 0) {
    console.error(
      [
        'tippecanoe was not found on PATH.',
        'Install/use the external tool from Referenss/tippecanoe, then rerun:',
        command.join(' '),
      ].join('\n')
    );
    process.exitCode = 1;
    return;
  }

  const result = spawnSync('tippecanoe', args, {
    encoding: 'utf8',
    shell: true,
    stdio: 'inherit',
  });

  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
