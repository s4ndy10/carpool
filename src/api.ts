export type Role = 'user' | 'admin';
export type User = { id: string; name: string; email: string; role: Role };
export const categories = [
  'Sedan',
  'SUV',
  'Coupe',
  'Hatchback',
  'Truck',
  'Wagon',
  'Convertible',
] as const;
export type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: (typeof categories)[number];
  price: number;
  quantity: number;
};
// Retain the persisted key so the Carpool rebrand does not discard existing sessions.
export const TOKEN_KEY = 'forecourt.token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const base = typeof location !== 'undefined' && location.hostname.includes('vercel.app')
    ? 'https://carpool-71h6.onrender.com'
    : '';
  const response = await fetch(`${base}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (
    response.status === 401 &&
    token &&
    sessionStorage.getItem(TOKEN_KEY) === token &&
    !options.signal?.aborted
  ) {
    sessionStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event('forecourt:unauthorized'));
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.error?.message || 'Something went wrong. Please try again.',
      response.status,
    );
  if (!data)
    throw new Error(
      'The server returned an unreadable response. Please try again.',
    );
  return data as T;
}

export function errorMessage(error: unknown) {
  return error instanceof TypeError
    ? 'Unable to connect. Check your connection and try again.'
    : error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';
}
