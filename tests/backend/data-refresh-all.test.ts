import { describe, expect, it } from 'vitest';
import {
  DATA_REFRESH_STEPS,
  RefreshStepError,
  decideDockerStartup,
  runRefreshWorkflow,
  type RefreshStep,
} from '../../apps/backend/scripts/run_data_refresh_all';
import { currentSnapshotTimestamp } from '../../apps/backend/scripts/refresh_snapshot.mjs';

describe('data refresh all workflow', () => {
  it('orders source refreshes before DB imports and verification', () => {
    // Given
    const stepIds = DATA_REFRESH_STEPS.map((step) => step.id);

    // When
    const sourceRefresh = stepIds.indexOf('refresh-miami-fixtures');
    const databaseStartup = stepIds.indexOf('start-postgis');
    const databaseImport = stepIds.indexOf('import-arcgis');
    const verification = stepIds.indexOf('verify-research');

    // Then
    expect(sourceRefresh).toBeGreaterThan(-1);
    expect(sourceRefresh).toBeLessThan(databaseStartup);
    expect(databaseImport).toBeGreaterThan(sourceRefresh);
    expect(verification).toBeGreaterThan(databaseImport);
  });

  it('launches Docker Desktop on Windows when the daemon is stopped', () => {
    // Given
    const environment = { platform: 'win32', daemonReady: false, desktopExists: true } as const;

    // When
    const action = decideDockerStartup(environment);

    // Then
    expect(action).toEqual({ kind: 'launch_desktop' });
  });

  it('uses the live fetch time as the source snapshot timestamp', () => {
    // Given
    const fetchedAt = new Date('2026-07-15T08:45:00.000Z');

    // When
    const timestamp = currentSnapshotTimestamp(fetchedAt);

    // Then
    expect(timestamp).toBe('2026-07-15T08:45:00.000Z');
  });

  it('forces replacement of the cached Florida PBF', () => {
    // Given
    const pbfStep = DATA_REFRESH_STEPS.find((step) => step.id === 'refresh-florida-pbf');

    // When
    const args = pbfStep?.args ?? [];

    // Then
    expect(args).toContain('--force');
  });

  it('does not regenerate the Prisma client while the dev server may hold its Windows DLL', () => {
    // Given
    const stepIds = DATA_REFRESH_STEPS.map((step) => step.id);

    // When
    const prismaGeneration = stepIds.includes('generate-prisma');

    // Then
    expect(prismaGeneration).toBe(false);
  });

  it('stops at the first failed step', async () => {
    // Given
    const steps: readonly RefreshStep[] = [
      { id: 'first', label: 'First', command: 'one', args: [] },
      { id: 'second', label: 'Second', command: 'two', args: [] },
      { id: 'third', label: 'Third', command: 'three', args: [] },
    ];
    const executed: string[] = [];

    // When
    const run = () =>
      runRefreshWorkflow(
        steps,
        (step) => {
          executed.push(step.id);
          return step.id === 'second' ? 7 : 0;
        },
        () => undefined
      );

    // Then
    await expect(run()).rejects.toThrowError(RefreshStepError);
    expect(executed).toEqual(['first', 'second']);
  });
});
