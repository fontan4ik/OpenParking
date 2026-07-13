import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  parkingusaPrisma?: PrismaClient;
};

export const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.parkingusaPrisma ??
  new PrismaClient({
    // Database failures are handled by tryDatabase. Letting Prisma print every
    // failed query makes the file-fallback mode look broken, especially when
    // several map API requests start in parallel.
    log: [],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.parkingusaPrisma = prisma;
}

let databaseRetryAfter = 0;
let databaseProbe: Promise<boolean> | null = null;
const DATABASE_PROBE_TIMEOUT_MS = 1_500;

async function probeDatabaseWithTimeout() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('database probe timed out')), DATABASE_PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function isDatabaseAvailable(): Promise<boolean> {
  if (!hasDatabaseUrl || Date.now() < databaseRetryAfter) return false;
  if (databaseProbe) return databaseProbe;

  databaseProbe = (async () => {
    try {
      await probeDatabaseWithTimeout();
      databaseRetryAfter = 0;
      return true;
    } catch (error) {
      databaseRetryAfter = Date.now() + 30_000;
      console.warn(
        '[ParkingUSA] Database unavailable; using GeoJSON fallback for 30 seconds.',
        error instanceof Error ? error.message : error,
      );
      return false;
    } finally {
      databaseProbe = null;
    }
  })();

  return databaseProbe;
}

export async function tryDatabase<T>(operation: () => Promise<T>): Promise<T | null> {
  if (!(await isDatabaseAvailable())) return null;

  try {
    const result = await operation();
    databaseRetryAfter = 0;
    return result;
  } catch (error) {
    const shouldWarn = Date.now() >= databaseRetryAfter;
    databaseRetryAfter = Date.now() + 30_000;
    if (shouldWarn) {
      console.warn(
        '[ParkingUSA] Database query failed; using GeoJSON fallback for 30 seconds.',
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}
