import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/assistant/route';
import { recommendAffordableParking } from '@/lib/parking-assistant';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('recommendAffordableParking', () => {
  it('returns only trustworthy facilities with a known numeric hourly rate in price order', () => {
    const recommendations = recommendAffordableParking([
      feature('expensive', 12, 0.9, 'known_priced'),
      feature('review', 1, 0.4, 'known_priced'),
      feature('unknown', 2, 0.9, 'unknown'),
      feature('affordable', 3, 0.8, 'known_priced'),
    ]);

    expect(recommendations.map((recommendation) => recommendation.sourceId)).toEqual(['affordable', 'expensive']);
  });
});

describe('POST /api/assistant', () => {
  it('does not contact the provider when no OpenRouter key is configured', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(new NextRequest('http://localhost/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'miami', message: 'Find affordable parking' }),
    }));

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('OPENROUTER_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces an unusable free-model reply with an honest parking-data fallback', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'User Safety: safe' } }] })));

    const response = await POST(new NextRequest('http://localhost/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'miami', message: 'Find affordable parking near Ocean Drive' }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).reply).toContain('citywide affordable options');
  });
});

function feature(sourceId: string, hourlyRate: number, confidence: number, priceStatus: string) {
  return {
    type: 'Feature' as const,
    properties: {
      source_id: sourceId,
      name: sourceId,
      base_hourly_rate: hourlyRate,
      price_status: priceStatus,
      confidence,
      source_name: 'Test source',
    },
    geometry: { type: 'Point' as const, coordinates: [-80.19, 25.76] },
  };
}
