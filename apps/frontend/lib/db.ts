import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  parkingusaPrisma?: PrismaClient;
};

export const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.parkingusaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.parkingusaPrisma = prisma;
}

let databaseRetryAfter = 0;

export async function tryDatabase<T>(operation: () => Promise<T>): Promise<T | null> {
  if (!hasDatabaseUrl) return null;
  if (Date.now() < databaseRetryAfter) return null;

  try {
    const result = await operation();
    databaseRetryAfter = 0;
    return result;
  } catch (error) {
    databaseRetryAfter = Date.now() + 30_000;
    console.warn('[ParkingUSA] Database unavailable, using GeoJSON fallback.', error);
    return null;
  }
}
