import { NextRequest, NextResponse } from 'next/server';
import {
  ROUTE_TIMEOUT_MS,
  normalizeValhallaRouteResponse,
  routingError,
  toValhallaRouteRequest,
  validateRouteRequest,
  type RouteError,
} from '@/lib/routing';

const DEFAULT_VALHALLA_URL = 'http://127.0.0.1:8002';

type RouteErrorStatus = 400 | 408 | 422 | 502 | 503 | 504;

function errorStatus(error: RouteError): RouteErrorStatus {
  if (error.code === 'INVALID_COORDINATES') return 400;
  if (error.code === 'UNSUPPORTED_COSTING') return 400;
  if (error.code === 'ROUTE_TOO_LONG') return 400;
  if (error.code === 'NO_ROUTE') return 422;
  if (error.code === 'ROUTE_TIMEOUT') return 504;
  if (error.code === 'ROUTE_SERVICE_UNAVAILABLE') return 503;
  return 502;
}

function routeErrorResponse(error: RouteError) {
  return NextResponse.json({ error }, { status: errorStatus(error) });
}

function valhallaBaseUrl(): string {
  return (process.env.VALHALLA_URL || DEFAULT_VALHALLA_URL).replace(/\/+$/, '');
}

async function parseJsonBody(request: NextRequest): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  const validation = validateRouteRequest(body);
  if (!validation.ok) return routeErrorResponse(validation.error);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

  try {
    const providerResponse = await fetch(`${valhallaBaseUrl()}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toValhallaRouteRequest(validation.request)),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!providerResponse.ok) {
      if (providerResponse.status === 408 || providerResponse.status === 504) {
        return routeErrorResponse(routingError('ROUTE_TIMEOUT', 'Routing service timed out.'));
      }
      if (providerResponse.status >= 500) {
        return routeErrorResponse(routingError('ROUTE_SERVICE_UNAVAILABLE', 'Routing service is unavailable.'));
      }
      return routeErrorResponse(routingError('NO_ROUTE', 'No route was found for the selected points.'));
    }

    const providerJson = (await providerResponse.json()) as unknown;
    const normalized = normalizeValhallaRouteResponse(providerJson);
    if ('code' in normalized) return routeErrorResponse(normalized);

    return NextResponse.json(normalized);
  } catch (error) {
    clearTimeout(timeout);
    if (isAbortError(error)) {
      return routeErrorResponse(routingError('ROUTE_TIMEOUT', 'Routing service timed out.'));
    }
    return routeErrorResponse(routingError('ROUTE_SERVICE_UNAVAILABLE', 'Routing service is unavailable.'));
  }
}
