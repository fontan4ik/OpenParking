/**
 * Source label utilities — kept separate from data-loader.ts so they can be
 * safely imported from client components (the data loader pulls in `fs` and
 * must stay server-only).
 *
 * Drivers should never see the raw provider strings (OSM/coverage baseline
 * fallback, Geofabrik/osm2pgsql, PostGIS/Prisma unavailable, etc.) that
 * leak into the source dropdown and the detail panel. This is the single
 * place to teach the app about a new raw label.
 */

const SOURCE_LABEL_ALIASES: Record<string, string> = {
  'osm/coverage baseline fallback': 'Community coverage',
  'openstreetmap via geofabrik/osm2pgsql': 'Community coverage',
  'postgis/prisma unavailable': 'Live data',
  'parkingusa parking index': 'OpenParking data',
};

const SOURCE_BADGE_ALIASES: Record<string, 'community' | 'official' | 'openparking'> = {
  'osm/coverage baseline fallback': 'community',
  'openstreetmap via geofabrik/osm2pgsql': 'community',
  'postgis/prisma unavailable': 'openparking',
  'parkingusa parking index': 'openparking',
};

export function friendlySourceLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const key = trimmed.toLowerCase();
  return SOURCE_LABEL_ALIASES[key] ?? trimmed;
}

export function friendlySourceBadge(
  raw: string | null | undefined
): 'community' | 'official' | 'openparking' | '' {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  if (SOURCE_BADGE_ALIASES[key]) return SOURCE_BADGE_ALIASES[key];
  if (
    key.includes('community') ||
    key.includes('osm') ||
    key.includes('openstreetmap') ||
    key.includes('geofabrik')
  ) {
    return 'community';
  }
  if (key.includes('parkingusa') || key.includes('openparking')) return 'openparking';
  return 'official';
}
