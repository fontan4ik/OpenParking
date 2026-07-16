import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type RefreshStep = {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
};

type StepRunner = (step: RefreshStep) => number | Promise<number>;
type Reporter = (message: string) => void;

type DockerEnvironment = {
  readonly platform: string;
  readonly daemonReady: boolean;
  readonly desktopExists: boolean;
};

export function decideDockerStartup(_environment: DockerEnvironment) {
  if (_environment.daemonReady) return { kind: 'ready' } as const;
  if (_environment.platform === 'win32' && _environment.desktopExists) {
    return { kind: 'launch_desktop' } as const;
  }
  return { kind: 'unavailable' } as const;
}

const npmStep = (id: string, label: string, script: string, extraArgs: readonly string[] = []): RefreshStep => ({
  id,
  label,
  command: 'npm',
  args: ['run', script, ...extraArgs],
});

export const DATA_REFRESH_STEPS: readonly RefreshStep[] = [
  npmStep('refresh-miami-fixtures', 'Refresh official Miami Beach fallback fixtures', 'data:refresh:miami'),
  {
    id: 'start-postgis',
    label: 'Start PostGIS and wait for its health check',
    command: 'docker',
    args: ['compose', 'up', '-d', '--wait', 'db'],
  },
  npmStep('migrate-database', 'Apply database migrations', 'db:migrate'),
  npmStep('refresh-florida-pbf', 'Replace the cached Florida Geofabrik PBF', 'fetch:pbf:florida', ['--', '--force']),
  npmStep('refresh-miami-dade-boundary', 'Refresh the Miami-Dade Census boundary', 'fetch:boundary:miami-dade'),
  npmStep('import-arcgis', 'Import official Miami Beach ArcGIS records into PostGIS', 'connector:arcgis:import'),
  npmStep('import-osm-raw', 'Import the Florida PBF into parking-focused osm2pgsql tables', 'import:osm:pbf:florida:parking:docker'),
  npmStep('preview-osm-canonical', 'Validate the Miami-Dade OSM canonical import counts', 'normalize:osm:pbf:miami-dade:boundary:dry-run'),
  npmStep('import-osm-canonical', 'Replace the Miami-Dade canonical OSM baseline', 'normalize:osm:pbf:miami-dade:boundary'),
  npmStep('audit-miami-geometry', 'Refresh references and audit Miami parking geometry', 'audit:parking-geometry:miami:refresh'),
  npmStep('verify-research', 'Validate research manifests', 'research:validate'),
  npmStep('verify-types', 'Type-check the application and backend scripts', 'typecheck'),
  { id: 'verify-tests', label: 'Run the test suite', command: 'npm', args: ['test'] },
  npmStep('verify-build', 'Build the frontend application', 'build'),
] as const;

export class RefreshStepError extends Error {
  readonly name = 'RefreshStepError';

  constructor(
    readonly step: RefreshStep,
    readonly exitCode: number
  ) {
    super(`Refresh step "${step.id}" failed with exit code ${exitCode}`);
  }
}

class DockerUnavailableError extends Error {
  readonly name = 'DockerUnavailableError';

  constructor(message: string) {
    super(message);
  }
}

export async function runRefreshWorkflow(
  steps: readonly RefreshStep[],
  runStep: StepRunner,
  report: Reporter
): Promise<void> {
  for (const [index, step] of steps.entries()) {
    report(`[${index + 1}/${steps.length}] ${step.label}`);
    const exitCode = await runStep(step);
    if (exitCode !== 0) throw new RefreshStepError(step, exitCode);
  }
}

function dockerDaemonReady(): boolean {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

async function ensureDockerDaemon(report: Reporter): Promise<void> {
  const desktopPath = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
  const action = decideDockerStartup({
    platform: process.platform,
    daemonReady: dockerDaemonReady(),
    desktopExists: existsSync(desktopPath),
  });

  switch (action.kind) {
    case 'ready':
      return;
    case 'launch_desktop': {
      report('Docker daemon is stopped; starting Docker Desktop...');
      const desktop = spawn(desktopPath, [], { detached: true, stdio: 'ignore' });
      desktop.unref();
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await setTimeout(2_000);
        if (dockerDaemonReady()) return;
      }
      throw new DockerUnavailableError('Docker Desktop did not become ready within 120 seconds. Start it manually and rerun the command.');
    }
    case 'unavailable':
      throw new DockerUnavailableError('Docker daemon is unavailable. Install or start Docker Desktop, then rerun the command.');
  }
}

async function executeStep(step: RefreshStep): Promise<number> {
  if (step.id === 'start-postgis') await ensureDockerDaemon(console.log);
  const usesWindowsNpm = process.platform === 'win32' && step.command === 'npm';
  const executable = usesWindowsNpm ? process.env.ComSpec ?? 'cmd.exe' : step.command;
  const args = usesWindowsNpm ? ['/d', '/s', '/c', 'npm', ...step.args] : [...step.args];
  const result = spawnSync(executable, args, {
    cwd: path.resolve(fileURLToPath(new URL('../../..', import.meta.url))),
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://parking:parking@localhost:5432/parkingusa?schema=public',
    },
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const runner: StepRunner = dryRun
    ? (step) => {
        console.log(`  ${[step.command, ...step.args].join(' ')}`);
        return 0;
      }
    : executeStep;

  await runRefreshWorkflow(DATA_REFRESH_STEPS, runner, console.log);
  console.log(dryRun ? 'Refresh plan validated.' : 'Parking data refresh completed.');
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    if (error instanceof RefreshStepError) {
      console.error(error.message);
      process.exitCode = error.exitCode;
    } else if (error instanceof DockerUnavailableError) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      throw error;
    }
  });
}
