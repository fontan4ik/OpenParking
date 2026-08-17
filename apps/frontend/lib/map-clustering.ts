export const FACILITY_CLUSTER_SOURCE_OPTIONS = {
  cluster: true,
  // Keep mixed parking/curb density legible through neighborhood zooms.
  clusterMaxZoom: 16,
  clusterRadius: 64,
} as const;

export function getFacilityClusterId(
  properties: Record<string, unknown> | null | undefined,
): number | null {
  if (properties?.cluster !== true || typeof properties.cluster_id !== 'number') {
    return null;
  }

  return properties.cluster_id;
}
