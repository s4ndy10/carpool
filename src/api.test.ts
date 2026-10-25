import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, errorMessage, request, TOKEN_KEY } from './api';

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('API transport', () => {
  it('handles a successful empty deletion response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    expect(await request('/vehicles/id', { method: 'DELETE' })).toBeUndefined();
  });

  it('surfaces structured server errors with their status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { message: 'Not enough stock.' } }),
            { status: 409 },
          ),
      ),
    );
    await expect(request('/vehicles/id/purchase')).rejects.toMatchObject({
      message: 'Not enough stock.',
      status: 409,
    });
  });

  it('does not clear a newer session when an old request returns 401', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'old-token');
    let resolveResponse: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      ),
    );
    const pending = request('/vehicles');
    sessionStorage.setItem(TOKEN_KEY, 'new-token');
    resolveResponse(
      new Response(JSON.stringify({ error: { message: 'Expired.' } }), {
        status: 401,
      }),
    );
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('new-token');
  });

  it('reports malformed and network responses clearly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Not JSON')),
    );
    await expect(request('/vehicles')).rejects.toThrow('unreadable response');
    expect(errorMessage(new TypeError('Failed to fetch'))).toContain(
      'Unable to connect',
    );
    expect(errorMessage(undefined)).toContain('Something went wrong');
  });
});
