/* ═══════════════════════════════════════════════════════════════
   ParkingUSA — Bilingual (EN/RU) keyword matching for facility search
   ═══════════════════════════════════════════════════════════════ */

/**
 * Bilingual alias map: each canonical `facility_type` value maps to
 * English and Russian search keywords.  The canonical value itself is
 * always included, so plain-English queries work unchanged.
 */
const FACILITY_TYPE_ALIASES: Record<string, string[]> = {
  garage: ['garage', 'гараж'],
  'multi-storey': ['multi-storey', 'multi story', 'многоэтажный'],
  underground: ['underground', 'подземный'],
  surface: ['surface', 'наземный'],
  surface_lot: ['surface lot', 'surface_lot', 'площадка'],
  lot: ['lot'],
  valet: ['valet', 'валет'],
  street_meter: ['street meter', 'street_meter', 'паркомат', 'meter'],
  offstreet_meter: ['offstreet meter', 'offstreet_meter'],
  airport: ['airport', 'аэропорт'],
  event: ['event'],
  monthly: ['monthly'],
  private: ['private', 'частный'],
  parking: ['parking', 'парковка'],
  parking_entrance: ['parking entrance', 'parking_entrance', 'вход'],
  parking_area: ['parking area', 'parking_area'],
  street_side: ['street side', 'street_side'],
  unknown: ['unknown'],
};

/**
 * Return the bilingual search keywords for a given facility_type.
 * Every canonical type from the union gets its alias set; unrecognised
 * types still appear as themselves so substring matching can find them.
 */
function aliasesFor(facilityType: string): string[] {
  return FACILITY_TYPE_ALIASES[facilityType] ?? [facilityType];
}

/**
 * Build the full search-haystack string for a parking facility feature.
 *
 * Includes the existing name/operator/source_id/street/neighborhood fields
 * **plus** bilingual keyword aliases derived from the feature's
 * `facility_type`.  Case and whitespace are normalised so callers can
 * use `.includes()` for substring matching.
 *
 * Adding new searchable fields later: just append to the list below.
 */
export function buildFacilitySearchHaystack(
  properties: Record<string, unknown>,
): string {
  const name = String(properties.name ?? '');
  const operator = String(properties.operator ?? '');
  const sourceId = String(properties.source_id ?? '');
  const street = String(properties.street ?? '');
  const neighborhood = String(properties.neighborhood ?? '');
  const facilityType = String(properties.facility_type ?? '');

  const typeAliases = aliasesFor(facilityType);

  return [name, operator, sourceId, street, neighborhood, ...typeAliases]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
