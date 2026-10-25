import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { TOKEN_KEY } from './api';

const user = { id: 'member-1', name: 'Asha Rao', email: 'asha@example.com', role: 'user', joinedAt: '2026-01-01T00:00:00Z' };
const purchase = { id: 'order-1', vehicleId: 'car-1', make: 'Honda', model: 'Civic Sport', category: 'Sedan', unitPrice: 2248250, quantity: 1, totalPrice: 2248250, purchasedAt: '2026-10-25T10:00:00Z' };
const vehicle = { id: 'car-1', make: 'Honda', model: 'Civic Sport', category: 'Sedan', price: 2248250, quantity: 2 };
let fetchMock: ReturnType<typeof vi.fn<(input: RequestInfo | URL) => Promise<Response>>>;
const response = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
const account = { user, currency: 'INR', purchases: [purchase], summary: { orders: 1, vehicles: 1, totalSpent: 2248250 } };

beforeEach(() => {
  sessionStorage.setItem(TOKEN_KEY, 'token');
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes('/auth/me')) return response({ user });
    if (path === '/api/account') return response(account);
    if (path.includes('/options')) return response({ makes: ['Honda'], models: { Honda: ['Civic Sport'] }, categories: ['Sedan'] });
    return response({ vehicles: [vehicle] });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });

it('shows rupees with Indian digit grouping and opens the signed-in profile', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Civic Sport' });
  expect(within(screen.getByRole('article')).getByText('₹22,48,250')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open account' }));
  const dialog = screen.getByRole('dialog', { name: 'Your account' });
  expect(await within(dialog).findByText('asha@example.com')).toBeInTheDocument();
  expect(within(dialog).getByRole('heading', { name: 'Honda Civic Sport' })).toBeInTheDocument();
  expect(within(dialog).getByText('order-1')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/account', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('handles an account with no purchases', async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((input: RequestInfo | URL) => String(input) === '/api/account'
    ? response({ ...account, purchases: [], summary: { orders: 0, vehicles: 0, totalSpent: 0 } }) : original(input));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open account' }));
  expect(await screen.findByText('Your next journey starts here.')).toBeInTheDocument();
});

it('allows retry after an account request fails', async () => {
  const original = fetchMock.getMockImplementation()!;
  let fail = true;
  fetchMock.mockImplementation((input: RequestInfo | URL) => String(input) === '/api/account' && fail
    ? response({ error: { message: 'Account is temporarily unavailable.' } }, 503) : original(input));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Account is temporarily unavailable.');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry account' }));
  expect(await screen.findByText('asha@example.com')).toBeInTheDocument();
});
