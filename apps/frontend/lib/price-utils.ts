const UNKNOWN_PRICE_SENTINELS = new Set([
  '',
  'unknown',
  'n/a',
  'na',
  'not available',
  'not applicable',
  'none',
  'null',
]);

function normalizedPriceText(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isKnownPriceValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'string') {
    return false;
  }

  return !UNKNOWN_PRICE_SENTINELS.has(normalizedPriceText(value));
}

function hasKnownHourlyRate(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && Number.isFinite(Number(trimmed));
  }

  return false;
}

export function hasKnownPrice(properties: Record<string, unknown> | null | undefined) {
  if (!properties) return false;

  const rawTags = properties.raw_tags && typeof properties.raw_tags === 'object'
    ? (properties.raw_tags as Record<string, unknown>)
    : null;
  const hasExplicitUnknownCharge = Object.prototype.hasOwnProperty.call(properties, 'charge')
    && !isKnownPriceValue(properties.charge);

  return Boolean(
    hasKnownHourlyRate(properties.base_hourly_rate) ||
      isKnownPriceValue(properties.charge) ||
      isKnownPriceValue(rawTags?.charge) ||
      (properties.price_status === 'known' && !hasExplicitUnknownCharge)
  );
}

export function priceTextOrFallback(value: unknown, fallback: string) {
  return isKnownPriceValue(value) ? String(value).trim() : fallback;
}
