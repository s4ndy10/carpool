import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const user = {
  id: 'u1',
  name: 'Alex Morgan',
  email: 'alex@example.com',
  role: 'user',
};
const vehicle = {
  id: 'car-1',
  make: 'Porsche',
  model: '911 Carrera',
  category: 'Coupe',
  price: 114400,
  quantity: 3,
};
const reply = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(status === 204 ? null : JSON.stringify(body), { status }),
  );
let App: ComponentType;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  sessionStorage.clear();
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/me')) return reply({ user });
    return reply({ vehicles: [vehicle] });
  });
  vi.stubGlobal('fetch', fetchMock);
  App = (await import('./App')).default;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function collection(admin = false, vehicles = [vehicle]) {
  sessionStorage.setItem('forecourt.token', 'stored-token');
  fetchMock.mockImplementation((input: RequestInfo | URL) =>
    String(input).includes('/auth/me')
      ? reply({ user: { ...user, role: admin ? 'admin' : 'user' } })
      : reply({ vehicles }),
  );
  render(<App />);
  await screen.findByRole('heading', { name: '911 Carrera' });
}

function fillLogin() {
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: user.email },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'a-secure-password' },
  });
}

describe('Carpool authentication', () => {
  it('introduces the Carpool dealership without old visible branding', () => {
    render(<App />);
    expect(screen.getByRole('region', { name: 'Introducing Carpool' })).toBeInTheDocument();
    expect(screen.queryByText(/forecourt/i)).not.toBeInTheDocument();
  });
  it('shows a labeled sign-in form without requesting protected inventory', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Welcome to your next chapter.' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute(
      'type',
      'email',
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs in, stores the token in session storage, and loads the collection', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes('/auth/login')
        ? reply({ token: 'new-token', user })
        : reply({ vehicles: [vehicle] }),
    );
    render(<App />);
    fillLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: '911 Carrera' });
    expect(sessionStorage.getItem('forecourt.token')).toBe('new-token');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          password: 'a-secure-password',
        }),
      }),
    );
  });

  it('registers a regular account without a role field', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes('/auth/register')
        ? reply({ token: 'registration-token', user })
        : reply({ vehicles: [vehicle] }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: user.name },
    });
    fillLogin();
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { name: '911 Carrera' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          password: 'a-secure-password',
        }),
      }),
    );
  });

  it('validates a stored session with a bearer token before showing inventory', async () => {
    await collection();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer stored-token',
        }),
      }),
    );
    expect(
      screen.queryByRole('button', { name: 'Add vehicle' }),
    ).not.toBeInTheDocument();
  });

  it('clears expired tokens and returns to sign in on 401', async () => {
    sessionStorage.setItem('forecourt.token', 'expired');
    fetchMock.mockImplementation(() =>
      reply(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Session expired. Please sign in again.',
          },
        },
        401,
      ),
    );
    render(<App />);
    await screen.findByRole('button', { name: 'Sign in' });
    expect(sessionStorage.getItem('forecourt.token')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/session expired/i);
  });

  it('shows server authentication errors', async () => {
    fetchMock.mockImplementation(() =>
      reply(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Email or password is incorrect.',
          },
        },
        401,
      ),
    );
    render(<App />);
    fillLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect.',
    );
  });

  it('rejects a registration password over 72 UTF-8 bytes', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: user.name },
    });
    fillLogin();
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'é'.repeat(37) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '72 UTF-8 bytes',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs out and removes the stored token', async () => {
    await collection();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(sessionStorage.getItem('forecourt.token')).toBeNull();
  });

  it('keeps mobile navigation focus contained and restores it on Escape', async () => {
    await collection();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    trigger.focus();
    fireEvent.click(trigger);
    const navigation = screen.getByRole('dialog', { name: 'Main navigation' });
    expect(navigation).toContainElement(document.activeElement as HTMLElement);
    const last = within(navigation).getByRole('button', { name: 'Sign out' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(
      within(navigation).getByRole('button', { name: 'Close navigation' }),
    ).toHaveFocus();
    fireEvent.keyDown(navigation, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('Carpool collection', () => {
  it('loads make and model filter options from the database endpoint', async () => {
    sessionStorage.setItem('forecourt.token', 'stored-token');
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/me')) return reply({ user });
      if (url.includes('/vehicles/options')) return reply({ makes: ['Honda', 'Porsche'], models: { Honda: ['Civic'], Porsche: ['911 Carrera'] }, categories: ['Coupe', 'Sedan'] });
      return reply({ vehicles: [vehicle] });
    });
    render(<App />);
    await screen.findByRole('heading', { name: '911 Carrera' });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const make = screen.getByRole('combobox', { name: 'Make' });
    await within(make).findByRole('option', { name: 'Honda' });
    fireEvent.change(make, { target: { value: 'Honda' } });
    const model = screen.getByRole('combobox', { name: 'Model' });
    expect(within(model).getByRole('option', { name: 'Civic' })).toBeInTheDocument();
    fireEvent.change(model, { target: { value: 'Civic' } });
    fireEvent.change(make, { target: { value: 'Porsche' } });
    expect(model).toHaveValue('');
    expect(within(model).queryByRole('option', { name: 'Civic' })).not.toBeInTheDocument();
  });
  it('shows an inventory loading state', async () => {
    sessionStorage.setItem('forecourt.token', 'stored-token');
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes('/auth/me')
        ? reply({ user })
        : new Promise(() => {}),
    );
    render(<App />);
    expect(
      await screen.findByText('Loading the collection…'),
    ).toBeInTheDocument();
  });

  it('searches the server with combined make/model and category filters', async () => {
    await collection();
    fireEvent.change(screen.getByLabelText('Search vehicles'), {
      target: { value: 'Porsche' },
    });
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Coupe' },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/vehicles\/search\?.*q=Porsche.*category=Coupe/,
        ),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it('shows empty filtered results and a clear filters action', async () => {
    await collection();
    fetchMock.mockImplementation(() => reply({ vehicles: [] }));
    fireEvent.change(screen.getByLabelText('Search vehicles'), {
      target: { value: 'Missing' },
    });
    expect(
      await screen.findByRole('heading', { name: 'A little too particular?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByLabelText('Search vehicles')).toHaveValue('');
  });

  it('recovers from a vehicle loading error using retry', async () => {
    sessionStorage.setItem('forecourt.token', 'stored-token');
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes('/auth/me')
        ? reply({ user })
        : reply(
            {
              error: {
                code: 'UNAVAILABLE',
                message: 'The collection is temporarily unavailable.',
              },
            },
            503,
          ),
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'temporarily unavailable',
    );
    fetchMock.mockImplementation(() => reply({ vehicles: [vehicle] }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: '911 Carrera' }),
    ).toBeInTheDocument();
  });

  it('purchases one vehicle and updates availability', async () => {
    await collection();
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).endsWith('/purchase')
        ? reply({ vehicle: { ...vehicle, quantity: 2 } })
        : reply({ vehicles: [{ ...vehicle, quantity: 2 }] }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Purchase Porsche 911 Carrera' }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vehicles/car-1/purchase',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('2 available')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/purchase/i);
  });

  it('disables purchases for sold-out vehicles', async () => {
    await collection(false, [{ ...vehicle, quantity: 0 }]);
    expect(
      screen.getByRole('button', { name: 'Purchase Porsche 911 Carrera' }),
    ).toBeDisabled();
    expect(screen.getByText('Sold out')).toBeInTheDocument();
  });

  it('returns to sign in if a purchase detects an expired session', async () => {
    await collection();
    fetchMock.mockImplementation(() =>
      reply(
        { error: { code: 'UNAUTHORIZED', message: 'Session expired.' } },
        401,
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Purchase Porsche 911 Carrera' }),
    );
    await screen.findByRole('button', { name: 'Sign in' });
    expect(sessionStorage.getItem('forecourt.token')).toBeNull();
  });

  it('rejects inverted price filters without submitting them to the server', async () => {
    await collection();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Minimum price (INR)'), {
      target: { value: '100000' },
    });
    fireEvent.change(screen.getByLabelText('Maximum price (INR)'), {
      target: { value: '50000' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Minimum price cannot exceed maximum price',
    );
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('minPrice')),
    ).toBe(false);
  });

  it('aborts previous searches and ignores late results', async () => {
    await collection();
    let resolveOld: (response: Response) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes('q=Old')
        ? new Promise<Response>((resolve) => {
            resolveOld = resolve;
          })
        : reply({ vehicles: [{ ...vehicle, model: 'New arrival' }] }),
    );
    fireEvent.change(screen.getByLabelText('Search vehicles'), {
      target: { value: 'Old' },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('q=Old'),
        expect.anything(),
      ),
    );
    const oldCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('q=Old'),
    )!;
    fireEvent.change(screen.getByLabelText('Search vehicles'), {
      target: { value: 'New' },
    });
    expect(oldCall[1].signal.aborted).toBe(true);
    await screen.findByRole('heading', { name: 'New arrival' });
    resolveOld(
      new Response(
        JSON.stringify({ vehicles: [{ ...vehicle, model: 'Stale arrival' }] }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Stale arrival' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'New arrival' }),
    ).toBeInTheDocument();
  });
});

describe('Carpool administration', () => {
  it('adds a vehicle with numeric price and quantity', async () => {
    await collection(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a vehicle' });
    fireEvent.change(within(dialog).getByLabelText('Make'), {
      target: { value: 'Volvo' },
    });
    fireEvent.change(within(dialog).getByLabelText('Model'), {
      target: { value: 'V60' },
    });
    fireEvent.change(within(dialog).getByLabelText('Category'), {
      target: { value: 'Wagon' },
    });
    fireEvent.change(within(dialog).getByLabelText('Price (INR)'), {
      target: { value: '48000' },
    });
    fireEvent.change(within(dialog).getByLabelText('Quantity'), {
      target: { value: '4' },
    });
    fetchMock.mockImplementation((_, options: RequestInit) =>
      options?.method === 'POST'
        ? reply(
            {
              vehicle: {
                ...vehicle,
                id: 'car-2',
                make: 'Volvo',
                model: 'V60',
                category: 'Wagon',
                price: 48000,
                quantity: 4,
              },
            },
            201,
          )
        : reply({ vehicles: [vehicle] }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save vehicle' }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vehicles',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            make: 'Volvo',
            model: 'V60',
            category: 'Wagon',
            price: 48000,
            quantity: 4,
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('edits an existing vehicle', async () => {
    await collection(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Porsche 911 Carrera' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit vehicle' });
    expect(within(dialog).getByLabelText('Make')).toHaveValue('Porsche');
    fireEvent.change(within(dialog).getByLabelText('Price (INR)'), {
      target: { value: '112000' },
    });
    fetchMock.mockImplementation(() =>
      reply({
        vehicle: { ...vehicle, price: 112000 },
        vehicles: [{ ...vehicle, price: 112000 }],
      }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save vehicle' }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vehicles/car-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            make: vehicle.make,
            model: vehicle.model,
            category: vehicle.category,
            price: 112000,
            quantity: vehicle.quantity,
            expectedQuantity: vehicle.quantity,
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('requires confirmation before deletion', async () => {
    await collection(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Porsche 911 Carrera' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Remove this vehicle?' });
    expect(
      fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE'),
    ).toBe(false);
    fetchMock.mockImplementation((_, options: RequestInit) =>
      options?.method === 'DELETE' ? reply(null, 204) : reply({ vehicles: [] }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Remove vehicle' }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vehicles/car-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '911 Carrera' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('restocks with a positive integer quantity', async () => {
    await collection(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Restock Porsche 911 Carrera' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Restock vehicle' });
    fireEvent.change(within(dialog).getByLabelText('Units to add'), {
      target: { value: '5' },
    });
    fetchMock.mockImplementation(() =>
      reply({
        vehicle: { ...vehicle, quantity: 8 },
        vehicles: [{ ...vehicle, quantity: 8 }],
      }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add stock' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vehicles/car-1/restock',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ quantity: 5 }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('focuses the modal, closes with Escape, and restores trigger focus', async () => {
    await collection(true);
    const trigger = screen.getByRole('button', { name: 'Add vehicle' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps an edit dialog open with a conflict error and unsaved values', async () => {
    await collection(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Porsche 911 Carrera' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Price (INR)'), {
      target: { value: '112000' },
    });
    fetchMock.mockImplementation((_, options: RequestInit) =>
      options?.method === 'PUT'
        ? reply(
            {
              error: {
                code: 'STOCK_CHANGED',
                message: 'Stock changed. Reopen the vehicle and try again.',
              },
            },
            409,
          )
        : reply({ vehicles: [{ ...vehicle, quantity: 2 }] }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save vehicle' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Stock changed',
    );
    expect(within(dialog).getByLabelText('Price (INR)')).toHaveValue(112000);
    expect(
      within(dialog).getByRole('button', { name: 'Save vehicle' }),
    ).toBeEnabled();
    await screen.findByText('2 available');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Porsche 911 Carrera' }),
    );
    expect(
      within(screen.getByRole('dialog')).getByLabelText('Quantity'),
    ).toHaveValue(2);
  });

  it('traps keyboard focus inside the modal', async () => {
    await collection(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Close dialog' });
    const save = within(dialog).getByRole('button', { name: 'Save vehicle' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(close).toHaveFocus();
  });
});
