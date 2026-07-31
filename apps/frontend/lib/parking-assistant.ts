import { isKnownPriceStatus, matchesTrustFilter, trustLabel } from '@/lib/data-quality';
import type { GeoJSONFeature } from '@/lib/data-loader';

export type AssistantParkingRecommendation = {
  readonly sourceId: string;
  readonly name: string;
  readonly hourlyRate: number;
  readonly trust: ReturnType<typeof trustLabel>;
  readonly sourceName: string;
};

export function recommendAffordableParking(
  features: readonly GeoJSONFeature[],
  limit = 3,
): readonly AssistantParkingRecommendation[] {
  return features
    .flatMap((feature) => {
      const sourceId = feature.properties.source_id;
      const hourlyRate = feature.properties.base_hourly_rate;
      if (
        typeof sourceId !== 'string' ||
        typeof hourlyRate !== 'number' ||
        !Number.isFinite(hourlyRate) ||
        !isKnownPriceStatus(feature.properties.price_status) ||
        !matchesTrustFilter(feature.properties, 'likely')
      ) {
        return [];
      }

      return [{
        sourceId,
        name: typeof feature.properties.name === 'string' ? feature.properties.name : 'Parking',
        hourlyRate,
        trust: trustLabel(feature.properties),
        sourceName: typeof feature.properties.source_name === 'string' ? feature.properties.source_name : 'Unknown source',
      }];
    })
    .sort((left, right) => left.hourlyRate - right.hourlyRate || left.sourceId.localeCompare(right.sourceId))
    .slice(0, limit);
}
