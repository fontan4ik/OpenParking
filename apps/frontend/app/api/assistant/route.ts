import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_CITY_ID, loadFacilities } from '@/lib/data-loader';
import { recommendAffordableParking, type AssistantParkingRecommendation } from '@/lib/parking-assistant';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const FREE_MODEL_ROUTER = 'openrouter/free';
const MAX_MESSAGE_LENGTH = 1_000;

type AssistantRequest = {
  readonly message: string;
  readonly city: string;
};

type OpenRouterResponse = {
  readonly choices?: readonly { readonly message?: { readonly content?: unknown } }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function parseAssistantRequest(request: NextRequest): Promise<AssistantRequest | null> {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.message !== 'string') return null;
    const message = body.message.trim();
    if (!message || message.length > MAX_MESSAGE_LENGTH) return null;
    return { message, city: typeof body.city === 'string' && body.city.trim() ? body.city : DEFAULT_CITY_ID };
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function assistantContext(recommendations: readonly AssistantParkingRecommendation[]): string {
  if (recommendations.length === 0) return 'No trustworthy parking with a known numeric hourly rate is currently available.';
  return recommendations
    .map((recommendation) => `${recommendation.name}: $${recommendation.hourlyRate}/hour, trust ${recommendation.trust}, source ${recommendation.sourceName}`)
    .join('\n');
}

function modelReply(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const firstChoice = choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message) || typeof firstChoice.message.content !== 'string') return null;
  const reply = firstChoice.message.content.trim();
  return reply.length >= 80 && !reply.startsWith('User Safety:') ? reply : null;
}

function fallbackReply(recommendations: readonly AssistantParkingRecommendation[]): string {
  if (recommendations.length === 0) {
    return 'I could not find a trustworthy parking option with a known hourly rate in the current city data. Try a different city or use the map filters.';
  }
  return `These are citywide affordable options, not a proximity search. I found ${recommendations.length} parking option${recommendations.length === 1 ? '' : 's'} with known hourly pricing. Open one to review its location and build a route; confirm availability, entry restrictions, and payment terms before you drive.`;
}

export async function POST(request: NextRequest) {
  const assistantRequest = await parseAssistantRequest(request);
  if (!assistantRequest) {
    return NextResponse.json({ error: 'Provide a parking question up to 1000 characters.' }, { status: 400 });
  }

  const recommendations = recommendAffordableParking((await loadFacilities(assistantRequest.city)).features.slice(0, 200));
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: 'The parking assistant is not configured. Add OPENROUTER_API_KEY to apps/frontend/.env.local.',
      recommendations,
    }, { status: 503 });
  }

  const providerResponse = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'OpenParking',
    },
    body: JSON.stringify({
      model: FREE_MODEL_ROUTER,
      messages: [
        {
          role: 'system',
          content: 'You are OpenParking, a concise parking assistant. Give practical parking and driving guidance, never claim availability, proximity, or a price that is not in the supplied data, and mention uncertainty briefly. The supplied recommendations are citywide affordable options, not proximity-filtered results. If the user asks about a specific place, say that explicitly and invite them to open a candidate to review its location and build a route.',
        },
        {
          role: 'user',
          content: `City: ${assistantRequest.city}\nQuestion: ${assistantRequest.message}\n\nCurrent affordable, likely-or-better parking from the OpenParking data API:\n${assistantContext(recommendations)}`,
        },
      ],
    }),
  });

  if (!providerResponse.ok) {
    return NextResponse.json({ error: 'The free AI provider is temporarily unavailable. Please try again shortly.', recommendations }, { status: 502 });
  }

  const reply = modelReply(await providerResponse.json());
  return NextResponse.json({ reply: reply ?? fallbackReply(recommendations), recommendations });
}
