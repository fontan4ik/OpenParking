import { transpose, type TagsStringArray } from './osm-tag-updater/transpose';
import {
  consolidateSides,
  deduplicateTags,
  morePreciseValueWins,
} from './osm-tag-updater/utils';

export interface StreetParkingNormalization {
  inputTags: TagsStringArray;
  ignoredTags: TagsStringArray;
  normalizedTags: TagsStringArray;
  manualTags: TagsStringArray;
  confidence: number;
}

export function tagsObjectToStringArray(tags: Record<string, unknown> = {}): TagsStringArray {
  return Object.entries(tags)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`);
}

export function normalizeStreetParkingTags(tags: Record<string, unknown>): StreetParkingNormalization {
  const inputTags = tagsObjectToStringArray(tags);
  const result = transpose(inputTags);

  const generatedTags = Object.values(result.newTagObjects).flatMap((item) => item.newTags);
  const manualTags = Object.values(result.newTagsManualCandidates).flatMap((item) => item.newTags);
  const normalizedTags = morePreciseValueWins(
    consolidateSides(deduplicateTags(generatedTags)).sort((a, b) => a.localeCompare(b))
  );

  const candidateCount = generatedTags.length + manualTags.length;
  const confidence = candidateCount === 0 ? 0 : generatedTags.length / candidateCount;

  return {
    inputTags,
    ignoredTags: result.ignoredTags,
    normalizedTags,
    manualTags,
    confidence,
  };
}
