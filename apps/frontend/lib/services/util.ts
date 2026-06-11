import cron from 'node-cron';
import { isMainThread, Worker } from 'node:worker_threads';
import { SimpleIntervalJob, Task, ToadScheduler } from 'toad-scheduler';
import type { ServiceOptions, ServiceState } from './types';

function selectedClusterTypes() {
  return (process.env.CLUSTER_TYPE ?? '')
    .split(/[, |-]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function scheduleService(worker: () => Promise<void>, options: ServiceOptions) {
  const types = selectedClusterTypes();
  const runAll = types.length === 0 || types.join(',') === 'services';
  const runService = types.includes(options.service.toLowerCase());

  if (!(runAll || runService)) return;

  let running = false;
  const wrapped = async () => {
    if (running) return;
    running = true;
    try {
      await worker();
    } catch (error) {
      console.error(`[ParkingUSA service:${options.service}]`, error);
    } finally {
      running = false;
    }
  };

  if (!options.schedule) {
    if (options.leading) setTimeout(wrapped, 1);
    return;
  }

  const milliseconds = /^(\d+)$/.exec(options.schedule)?.[1];
  if (milliseconds) {
    const scheduler = new ToadScheduler();
    const task = new Task(`${options.service} task`, wrapped);
    scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob(
        { milliseconds: Number.parseInt(milliseconds, 10), runImmediately: options.leading },
        task
      )
    );
    return;
  }

  if (options.leading) setTimeout(wrapped, 1);
  cron.schedule(options.schedule, wrapped);
}

export function startService(filename: string | URL, options?: WorkerOptions): Promise<void> | undefined {
  const useWorkerThreads = false;
  if (useWorkerThreads && process.env.NODE_ENV === 'production' && isMainThread) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(filename, options);
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Service worker stopped with exit code ${code}`));
      });
    });
  }
}

export function buildServiceOptions<T extends object>(
  options: ServiceOptions,
  state: T
): ServiceState<T> {
  return Object.freeze({
    ...options,
    state,
  });
}
