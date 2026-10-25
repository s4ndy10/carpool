import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CarFront,
  ChevronDown,
  CircleHelp,
  Grid2X2,
  LayoutList,
  LogOut,
  Menu,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError, categories, errorMessage, request, TOKEN_KEY } from './api';
import type { User, Vehicle } from './api';
import { vehicleImage } from './vehicle-images';
import AccountProfile from './AccountProfile';
import { money } from './format';

type InventoryOptions = { makes: string[]; models: Record<string, string[]>; categories: string[] };
type Notice = { text: string; error?: boolean } | null;
type VehicleModal = {
  kind: 'add' | 'edit' | 'delete' | 'restock';
  vehicle?: Vehicle;
};

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark" aria-hidden="true">
        <CarFront size={27} strokeWidth={2.2} />
      </span>
      <span>
        Carpool<span className="brand-period">.</span>
      </span>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
        ) || [],
      );
      const first = controls[0],
        last = controls.at(-1);
      if (!first) {
        event.preventDefault();
        panel.current?.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal"
        ref={panel}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">CARPOOL / INVENTORY</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Auth({
  onAuth,
  initialError,
}: {
  onAuth: (user: User) => void;
  initialError: string;
}) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    if (
      register &&
      (password.length < 12 || new TextEncoder().encode(password).length > 72)
    ) {
      setError(
        'Use at least 12 characters and no more than 72 UTF-8 bytes for your password.',
      );
      return;
    }
    if (register && (name.length < 2 || name.length > 80)) {
      setError('Your name must be between 2 and 80 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await request<{ token: string; user: User }>(
        `/auth/${register ? 'register' : 'login'}`,
        {
          method: 'POST',
          body: JSON.stringify(
            register ? { name, email, password } : { email, password },
          ),
        },
      );
      sessionStorage.setItem(TOKEN_KEY, result.token);
      onAuth(result.user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Introducing Carpool">
        <Brand light />
        <div className="auth-story-copy">
          <div className="eyebrow">
            <span className="small-rule" /> LESS SEARCHING. MORE LIVING.
          </div>
          <h1>
            Your next car.
            <br />
            Your next
            <br />
            <em>adventure.</em>
          </h1>
          <p>
            From the daily commute to the long way home.
            <br />Find the car that fits your life.
          </p>
        </div>
        <div className="auth-car-stage">
          <img
            src="/carpool-hero.jpg"
            alt="A Porsche on an open road, representative lifestyle photograph"
          />
          <span className="art-caption">A LITTLE FREEDOM. FOUR WHEELS.</span>
        </div>
        <div className="auth-story-footer">
          <span>YOUR ROAD STARTS AT CARPOOL.</span>
          <span>
            EST. 2026 <ArrowUpRight size={15} />
          </span>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-topline">
          <span>A BETTER DRIVE STARTS HERE</span>
          <span>01 / 02</span>
        </div>
        <div className="auth-form-content">
          <span className="eyebrow rust">YOUR NEXT CHAPTER</span>
          <h2>
            {register
              ? 'A place for your next adventure.'
              : 'Welcome to your next chapter.'}
          </h2>
          <p className="muted">
            {register
              ? 'Create your account. Find something worth driving.'
              : 'Sign in to explore the collection and find your kind of drive.'}
          </p>
          <div className="auth-tabs" aria-label="Account access">
            <button
              className={!register ? 'active' : ''}
              onClick={() => {
                setRegister(false);
                setError('');
                requestAnimationFrame(() => emailRef.current?.focus());
              }}
              type="button"
            >
              Sign in to Carpool
            </button>
            <button
              className={register ? 'active' : ''}
              onClick={() => {
                setRegister(true);
                setError('');
                requestAnimationFrame(() => nameRef.current?.focus());
              }}
              type="button"
              aria-label="Create an account"
            >
              Create an account
            </button>
          </div>
          <form onSubmit={submit} className="auth-form">
            {register && (
              <label>
                Full name
                <input
                  ref={nameRef}
                  name="name"
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  minLength={2}
                  maxLength={80}
                  required
                  disabled={busy}
                />
              </label>
            )}
            <label>
              Email address
              <input
                ref={emailRef}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                maxLength={254}
                required
                disabled={busy}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={
                  register ? 'At least 12 characters' : 'Enter your password'
                }
                minLength={register ? 12 : undefined}
                maxLength={72}
                required
                disabled={busy}
                aria-describedby={register ? 'password-hint' : undefined}
              />
            </label>
            {register && (
              <p className="field-hint" id="password-hint">
                12–72 characters. Use a unique password. Maximum 72 UTF-8 bytes.
              </p>
            )}
            {(error || initialError) && (
              <div className="error-box" role="alert">
                {error || initialError}
              </div>
            )}
            <button className="button primary auth-submit" disabled={busy}>
              {busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>
          <p className="auth-security">
            <ShieldCheck size={16} /> Your session stays private to this browser
            tab.
          </p>
        </div>
        <div className="auth-bottom">
          <span>Thoughtfully selected. Simply managed.</span>
          <Brand />
        </div>
      </section>
    </main>
  );
}

function VehicleEditor({
  modal,
  onClose,
  onSaved,
  onConflict,
}: {
  modal: VehicleModal;
  onClose: () => void;
  onSaved: (vehicle: Vehicle | undefined, removed?: string) => void;
  onConflict: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const vehicle = modal.vehicle;
  const title = {
    add: 'Add a vehicle',
    edit: 'Edit vehicle',
    delete: 'Remove this vehicle?',
    restock: 'Restock vehicle',
  }[modal.kind];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (modal.kind === 'delete') {
        await request(`/vehicles/${vehicle!.id}`, { method: 'DELETE' });
        onSaved(undefined, vehicle!.id);
      } else if (modal.kind === 'restock') {
        const result = await request<{ vehicle: Vehicle }>(
          `/vehicles/${vehicle!.id}/restock`,
          {
            method: 'POST',
            body: JSON.stringify({ quantity: Number(form.get('quantity')) }),
          },
        );
        onSaved(result.vehicle);
      } else {
        const body = {
          make: String(form.get('make')).trim(),
          model: String(form.get('model')).trim(),
          category: form.get('category'),
          price: Number(form.get('price')),
          quantity: Number(form.get('quantity')),
          ...(modal.kind === 'edit'
            ? { expectedQuantity: vehicle!.quantity }
            : {}),
        };
        if (!body.make || !body.model)
          throw new Error('Make and model cannot be blank.');
        const result = await request<{ vehicle: Vehicle }>(
          modal.kind === 'add' ? '/vehicles' : `/vehicles/${vehicle!.id}`,
          {
            method: modal.kind === 'add' ? 'POST' : 'PUT',
            body: JSON.stringify(body),
          },
        );
        onSaved(result.vehicle);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) onConflict();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        {modal.kind === 'delete' ? (
          <p className="modal-description">
            Remove{' '}
            <strong>
              {vehicle!.make} {vehicle!.model}
            </strong>{' '}
            from the collection? This permanently deletes the vehicle and its
            stock record. This action cannot be undone.
          </p>
        ) : modal.kind === 'restock' ? (
          <>
            <p className="modal-description">
              {vehicle!.make} {vehicle!.model} · {vehicle!.quantity} currently
              available
            </p>
            <label>
              Units to add
              <input
                name="quantity"
                type="number"
                min="1"
                max={Math.max(0, 1000000 - vehicle!.quantity)}
                step="1"
                defaultValue="1"
                required
                disabled={busy}
              />
            </label>
          </>
        ) : (
          <>
            <p className="modal-description">
              A few essentials. A new possibility for the collection.
            </p>
            <div className="form-grid">
              <label>
                Make
                <input
                  name="make"
                  defaultValue={vehicle?.make}
                  placeholder="e.g. Porsche"
                  maxLength={80}
                  required
                  disabled={busy}
                />
              </label>
              <label>
                Model
                <input
                  name="model"
                  defaultValue={vehicle?.model}
                  placeholder="e.g. 911 Carrera"
                  maxLength={80}
                  required
                  disabled={busy}
                />
              </label>
              <label className="full-width">
                Category
                <select
                  name="category"
                  aria-label="Category"
                  defaultValue={vehicle?.category || 'Sedan'}
                  disabled={busy}
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Price (INR)
                <input
                  name="price"
                  type="number"
                  min="0"
                  max="100000000"
                  step="0.01"
                  defaultValue={vehicle?.price}
                  placeholder="0"
                  required
                  disabled={busy}
                />
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  defaultValue={vehicle?.quantity ?? 1}
                  required
                  disabled={busy}
                />
              </label>
            </div>
          </>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className={`button ${modal.kind === 'delete' ? 'danger' : 'primary'}`}
            disabled={
              busy || (modal.kind === 'restock' && vehicle!.quantity >= 1000000)
            }
          >
            {busy
              ? 'Saving…'
              : modal.kind === 'delete'
                ? 'Remove vehicle'
                : modal.kind === 'restock'
                  ? 'Add stock'
                  : 'Save vehicle'}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(!!sessionStorage.getItem(TOKEN_KEY));
  const [authError, setAuthError] = useState('');
  const [sessionRetry, setSessionRetry] = useState(0);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [options, setOptions] = useState<InventoryOptions | null>(null);
  const [optionsError, setOptionsError] = useState('');
  const [optionsRefresh, setOptionsRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    category: '',
    make: '',
    model: '',
    minPrice: '',
    maxPrice: '',
  });
  const [advanced, setAdvanced] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [section, setSection] = useState('collection');
  const [mobileNav, setMobileNav] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const [sort, setSort] = useState('featured');
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [modal, setModal] = useState<VehicleModal | null>(null);
  const [guide, setGuide] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [purchasing, setPurchasing] = useState<string[]>([]);
  const admin = user?.role === 'admin';
  const hasFilters = Object.values(filters).some(Boolean);
  const invalidPrices =
    (filters.minPrice !== '' && Number(filters.minPrice) < 0) ||
    (filters.maxPrice !== '' && Number(filters.maxPrice) < 0) ||
    (filters.minPrice !== '' &&
      filters.maxPrice !== '' &&
      Number(filters.minPrice) > Number(filters.maxPrice));

  useEffect(() => {
    if (!mobileNav) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = Array.from(
      navigationRef.current?.querySelectorAll<HTMLButtonElement>('button') ||
        [],
    );
    controls[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNav(false);
      if (event.key !== 'Tab') return;
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === controls.at(-1)
      ) {
        event.preventDefault();
        controls[0]?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth > 650) setMobileNav(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      previous?.focus();
    };
  }, [mobileNav]);

  useEffect(() => {
    const expired = () => {
      setUser(null);
      setProfileOpen(false);
      setVehicles([]);
      setModal(null);
      setGuide(false);
      setMobileNav(false);
      setNotice(null);
      setAuthError('Session expired. Please sign in again.');
    };
    window.addEventListener('forecourt:unauthorized', expired);
    return () => window.removeEventListener('forecourt:unauthorized', expired);
  }, []);
  useEffect(() => {
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setChecking(true);
    request<{ user: User }>('/auth/me', { signal: controller.signal })
      .then(({ user }) => {
        if (active) {
          setUser(user);
          setAuthError('');
        }
      })
      .catch((error) => {
        if (active) setAuthError(errorMessage(error));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionRetry]);

  useEffect(() => {
    if (!user) { setOptions(null); setOptionsError(''); return; }
    const controller = new AbortController();
    let active = true;
    request<InventoryOptions>('/vehicles/options', { signal: controller.signal })
      .then((data) => { if (active) { setOptions(data); setOptionsError(''); } })
      .catch((error) => { if (active) setOptionsError(`Filter options could not load. ${errorMessage(error)}`); });
    return () => { active = false; controller.abort(); };
  }, [user, optionsRefresh]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let active = true;
    if (invalidPrices) {
      setLoadError(
        'Enter a valid price range. Minimum price cannot exceed maximum price.',
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    const timer = setTimeout(
      () => {
        request<{ vehicles: Vehicle[] }>(
          params.size ? `/vehicles/search?${params}` : '/vehicles',
          { signal: controller.signal },
        )
          .then(({ vehicles }) => {
            if (active) setVehicles(vehicles);
          })
          .catch((error) => {
            if (active) setLoadError(errorMessage(error));
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      hasFilters ? 280 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [user, filters, refresh, hasFilters, invalidPrices]);

  const clearFilters = () =>
    setFilters({
      q: '',
      category: '',
      make: '',
      model: '',
      minPrice: '',
      maxPrice: '',
    });
  const updateFilter = (key: keyof typeof filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value, ...(key === 'make' ? { model: '' } : {}) }));
  function signOut() {
    setProfileOpen(false);
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setAuthError('');
    setVehicles([]);
    setNotice(null);
    setModal(null);
    setGuide(false);
    setMobileNav(false);
    clearFilters();
    setSection('collection');
  }
  function saved(vehicle: Vehicle | undefined, removed?: string) {
    setOptionsRefresh((value) => value + 1);
    setVehicles((current) =>
      removed
        ? current.filter((item) => item.id !== removed)
        : current.some((item) => item.id === vehicle!.id)
          ? current.map((item) => (item.id === vehicle!.id ? vehicle! : item))
          : [vehicle!, ...current],
    );
    setNotice({
      text: removed
        ? 'Vehicle removed from the collection.'
        : modal?.kind === 'restock'
          ? 'Stock updated. Ready for the road.'
          : 'Vehicle saved to the collection.',
    });
    if (hasFilters) setRefresh((value) => value + 1);
  }
  async function purchase(vehicle: Vehicle) {
    if (purchasing.includes(vehicle.id)) return;
    setPurchasing((current) => [...current, vehicle.id]);
    setNotice(null);
    try {
      const result = await request<{ vehicle: Vehicle }>(
        `/vehicles/${vehicle.id}/purchase`,
        { method: 'POST', body: JSON.stringify({ quantity: 1 }) },
      );
      setVehicles((current) =>
        current.map((item) =>
          item.id === result.vehicle.id ? result.vehicle : item,
        ),
      );
      setNotice({
        text: `Purchase complete. One ${vehicle.make} ${vehicle.model} is yours.`,
      });
    } catch (error) {
      setNotice({ text: errorMessage(error), error: true });
    } finally {
      setPurchasing((current) => current.filter((id) => id !== vehicle.id));
    }
  }
  if (checking)
    return (
      <main className="session-loading">
        <Brand />
        <span className="loading-ring" />
        <p>Opening Carpool…</p>
      </main>
    );
  if (!user)
    return (
      <>
        <Auth
          initialError={authError}
          onAuth={(user) => {
            setAuthError('');
            setUser(user);
            setNotice(null);
          }}
        />
        {authError && sessionStorage.getItem(TOKEN_KEY) && (
          <button
            className="session-retry button secondary"
            onClick={() => setSessionRetry((value) => value + 1)}
          >
            Retry session validation
          </button>
        )}
      </>
    );

  const displayed = [...vehicles]
    .filter((vehicle) => (section !== 'available' ? true : vehicle.quantity > 0))
    .sort((a, b) =>
      sort === 'price-low'
        ? a.price - b.price
        : sort === 'price-high'
          ? b.price - a.price
          : sort === 'make'
            ? a.make.localeCompare(b.make) || a.model.localeCompare(b.model)
            : 0,
    );
  const units = vehicles.reduce(
    (total, vehicle) => total + vehicle.quantity,
    0,
  );
  const stockValue = vehicles.reduce(
    (total, vehicle) => total + vehicle.price * vehicle.quantity,
    0,
  );
  const selectSection = (next: string) => {
    setSection(next);
    setMobileNav(false);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#collection">
        Skip to collection
      </a>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        ref={navigationRef}
        className={`sidebar ${mobileNav ? 'is-open' : ''}`}
        aria-label="Main navigation"
        role={mobileNav ? 'dialog' : undefined}
        aria-modal={mobileNav || undefined}
        inert={!!modal || guide || profileOpen}
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <span className="sidebar-caption">A BETTER DRIVE.</span>
        <div className="nav-section-label">YOUR CARPOOL</div>
        <nav>
          <button
            className={`nav-item ${section === 'collection' ? 'selected' : ''}`}
            onClick={() => selectSection('collection')}
            aria-current={section === 'collection' ? 'page' : undefined}
          >
            <Grid2X2 size={18} />
            The collection
            <ArrowUpRight size={15} className="nav-arrow" />
          </button>
          <button
            className={`nav-item ${section === 'available' ? 'selected' : ''}`}
            onClick={() => selectSection('available')}
            aria-current={section === 'available' ? 'page' : undefined}
          >
            <span className="availability-dot" />
            Available now
          </button>
          {admin && (
            <>
              <div className="nav-section-label admin-label">THE WORKSHOP</div>
              <button
                className={`nav-item ${section === 'manage' ? 'selected' : ''}`}
                onClick={() => selectSection('manage')}
                aria-current={section === 'manage' ? 'page' : undefined}
              >
                <SlidersHorizontal size={18} />
                Manage inventory
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-mark">Carpool.</span>
            <p>
              Not just a car.
              <br />
              <em>A way forward.</em>
            </p>
            <span>FIND YOUR NEXT CHAPTER</span>
          </div>
          <button
            className="nav-item help-link"
            onClick={() => {
              setMobileNav(false);
              setGuide(true);
            }}
          >
            <CircleHelp size={17} />A little guidance
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <button className="profile-trigger" aria-label="Open account" aria-haspopup="dialog" onClick={() => { setMobileNav(false); setProfileOpen(true); }}>
            <span className="avatar">
              {user.name
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
            <span className="profile-name">
              <strong>{user.name}</strong>
              <span>{admin ? 'Administrator' : 'Collection member'}</span>
            </span>
            <ChevronDown size={14} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={signOut}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace" inert={mobileNav || !!modal || guide || profileOpen}>
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>CARPOOL</span>
            <span className="breadcrumb-slash">/</span>
            <span>
              {section === 'manage' ? 'Inventory management' : 'The collection'}
            </span>
          </div>
          <div className="topbar-right">
            <span className="live-dot" /> REAL MAKES. CLEAR PRICES. LIVE STOCK.
          </div>
        </header>
        <main id="collection" className="main-content" tabIndex={-1}>
          <section className="collection-intro">
            <div>
              <div className="eyebrow rust">
                <span className="small-rule" /> A BETTER WAY TO FIND YOUR NEXT CAR
              </div>
              <h1>
                {section === 'manage' ? (
                  <>
                    Great cars.<br /><em>All in your hands.</em>
                  </>
                ) : section === 'available' ? (
                  <>
                    Ready for<br /><em>your next chapter.</em>
                  </>
                ) : (
                  <>
                    Find your car.<br /><em>Love the journey.</em>
                  </>
                )}
              </h1>
              <p className="muted">
                {section === 'manage'
                  ? 'Manage your listings, keep stock up to date, and help the next driver find their match.'
                  : 'Big plans or everyday errands. Explore cars for every kind of life, all in one place.'}
              </p>
            </div>
            <div className="intro-action">
              <a className="button hero-browse" href="#inventory">Explore cars <ArrowRight size={18} /></a>
              {admin ? (
                <button
                  className="button primary"
                  onClick={() => setModal({ kind: 'add' })}
                >
                  <Plus size={17} />
                  Add vehicle
                </button>
              ) : (
                <span className="hero-note"><ShieldCheck size={18} /> Clear prices. No guesswork.</span>
              )}
            </div>
            <div className="hero-media">
              <img src="/carpool-hero.jpg" alt="Porsche on the road, representative lifestyle photo" fetchPriority="high" />
              <span className="hero-photo-note">THE LONG WAY HOME LOOKS GOOD ON YOU.</span>
            </div>
          </section>
          <section className="stats-grid" aria-label="Inventory overview">
            <div className="stat">
              <span>
                {hasFilters ? 'MATCHING MODELS' : 'CARS TO DISCOVER'}
              </span>
              <div>
                <strong>{String(vehicles.length).padStart(2, '0')}</strong>
                <span>real makes &amp; models</span>
              </div>
              <Grid2X2 size={17} />
            </div>
            <div className="stat">
              <span>READY FOR THE ROAD</span>
              <div>
                <strong>{units.toLocaleString()}</strong>
                <span>vehicles available</span>
              </div>
              <span className="stat-dot" />
            </div>
            <div className="stat">
              <span>
                {hasFilters ? 'MATCHING INVENTORY VALUE' : 'INVENTORY VALUE'}
              </span>
              <div>
                <strong className="value-stat">{money(stockValue)}</strong>
                <span>in available stock</span>
              </div>
              <ArrowUpRight size={20} />
            </div>
          </section>
          <section
            id="inventory"
            className="inventory-section"
            aria-label="Vehicle collection"
          >
            <div className="section-title">
              <h2>
                {section === 'manage'
                  ? 'Your inventory'
                  : section === 'available'
                    ? 'Available vehicles'
                    : 'Meet your next car'}{' '}
                <span>{displayed.length}</span>
              </h2>
              <div className="view-switch" aria-label="Collection view">
                <button
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                  onClick={() => setView('grid')}
                >
                  <Grid2X2 size={17} />
                </button>
                <button
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                >
                  <LayoutList size={18} />
                </button>
              </div>
            </div>
            <div className="filter-toolbar">
              <div className="search-field">
                <Search size={19} />
                <input
                  aria-label="Search vehicles"
                  placeholder="Search by make or model"
                  value={filters.q}
                  onChange={(event) => updateFilter('q', event.target.value)}
                />
                {filters.q && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => updateFilter('q', '')}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="select-wrap">
                <select
                  aria-label="Category"
                  value={filters.category}
                  onChange={(event) =>
                    updateFilter('category', event.target.value)
                  }
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
              <button
                className={`button filter-toggle ${advanced ? 'active' : ''}`}
                aria-expanded={advanced}
                aria-controls="advanced-filters"
                onClick={() => setAdvanced(!advanced)}
              >
                <SlidersHorizontal size={16} />
                Filters
                {[
                  filters.make,
                  filters.model,
                  filters.minPrice,
                  filters.maxPrice,
                ].some(Boolean) && <span className="filter-indicator" />}
              </button>
            </div>
            {advanced && (
              <div id="advanced-filters" className="advanced-filters">
                <label>
                  Make
                    <select
                      aria-label="Make"
                      value={filters.make}
                    onChange={(event) =>
                      updateFilter('make', event.target.value)
                    }
                    >
                      <option value="">All makes</option>
                      {(options?.makes ?? []).map((make) => <option key={make}>{make}</option>)}
                    </select>
                </label>
                <label>
                  Model
                    <select
                      aria-label="Model"
                      value={filters.model}
                    onChange={(event) =>
                      updateFilter('model', event.target.value)
                    }
                    >
                      <option value="">All models</option>
                      {(filters.make ? options?.models?.[filters.make] ?? [] : [...new Set(Object.values(options?.models ?? {}).flat())].sort()).map((model) => <option key={model}>{model}</option>)}
                    </select>
                </label>
                <label>
                  Minimum price (INR)
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    placeholder="No minimum"
                    value={filters.minPrice}
                    onChange={(event) =>
                      updateFilter('minPrice', event.target.value)
                    }
                  />
                </label>
                <label>
                  Maximum price (INR)
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    placeholder="No maximum"
                    value={filters.maxPrice}
                    onChange={(event) =>
                      updateFilter('maxPrice', event.target.value)
                    }
                  />
                </label>
              </div>
            )}
            {optionsError && <p className="field-hint">{optionsError} <button className="text-button" onClick={() => setOptionsRefresh((value) => value + 1)}>Retry filters</button></p>}
            <div className="category-shortcuts" aria-label="Browse body styles">
              <button className={!filters.category ? 'active' : ''} aria-pressed={!filters.category} onClick={() => updateFilter('category', '')}>All vehicles</button>
              {(options?.categories?.length ? options.categories : categories).map((category) => <button key={category} aria-pressed={filters.category === category} className={filters.category === category ? 'active' : ''} onClick={() => updateFilter('category', category)}>{category}</button>)}
            </div>
            <div className="results-meta">
              <span>
                {loading
                  ? 'Finding your next drive…'
                  : `${displayed.length} ${displayed.length === 1 ? 'vehicle' : 'vehicles'} to make your own`}
                {hasFilters &&
                  !(!loading && !loadError && displayed.length === 0) && (
                    <button className="text-button" onClick={clearFilters}>
                      Clear filters <X size={12} />
                    </button>
                  )}
              </span>
              <label className="sort-control">
                Sort by:
                <select
                  aria-label="Sort vehicles"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="featured">Collection order</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="make">Make: A to Z</option>
                </select>
                <ArrowDown size={13} />
              </label>
            </div>
            {notice && (
              <div
                className={`notice ${notice.error ? 'error-box' : ''}`}
                role={notice.error ? 'alert' : 'status'}
              >
                {!notice.error && <Check size={17} />}
                <span>{notice.text}</span>
                <button
                  className="icon-button"
                  aria-label="Dismiss notice"
                  onClick={() => setNotice(null)}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {loading ? (
              <div className="loading-collection">
                <p role="status">
                  <span className="loading-ring" />
                  Loading the collection…
                </p>
                <div className="vehicle-grid">
                  {[1, 2, 3].map((number) => (
                    <div className="skeleton-card" key={number}>
                      <div />
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              </div>
            ) : loadError ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <CircleHelp size={28} />
                </div>
                <h3>A small detour.</h3>
                <p role="alert">{loadError}</p>
                <button
                  className="button primary"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  Try again
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : displayed.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Search size={28} />
                </div>
                <h3>
                  {hasFilters
                    ? 'A little too particular?'
                    : 'A new collection starts here.'}
                </h3>
                <p>
                  {hasFilters
                    ? 'Try a different search or open up your filters. Your next drive may be a little unexpected.'
                    : section === 'available'
                      ? 'No vehicles are in stock right now. Explore the full collection or check back soon.'
                      : 'There are no vehicles in the collection just yet.'}
                </p>
                {hasFilters ? (
                  <button className="button primary" onClick={clearFilters}>
                    Clear filters
                    <ArrowRight size={16} />
                  </button>
                ) : admin ? (
                  <button
                    className="button primary"
                    onClick={() => setModal({ kind: 'add' })}
                  >
                    Add your first vehicle
                    <Plus size={16} />
                  </button>
                ) : (
                  section === 'available' && (
                    <button
                      className="button primary"
                      onClick={() => setSection('collection')}
                    >
                      View the collection
                      <ArrowRight size={16} />
                    </button>
                  )
                )}
              </div>
            ) : (
              <div
                className={`vehicle-grid ${view === 'list' ? 'list-view' : ''}`}
              >
                {displayed.map((vehicle, index) => (
                  <article
                    className={`vehicle-card ${vehicle.quantity === 0 ? 'is-sold-out' : ''}`}
                    key={vehicle.id}
                  >
                    <div
                      className={`vehicle-art art-${vehicle.category.toLowerCase()}`}
                    >
                      <span className="category-tag">{vehicle.category}</span>
                      <span className="vehicle-number">
                        {String(index + 1).padStart(2, '0')} /
                      </span>
                      <img
                        src={vehicleImage(vehicle.category)}
                        alt={`Representative ${vehicle.category.toLowerCase()} photograph, not the listed ${vehicle.make} ${vehicle.model}`}
                        loading="lazy"
                      />
                      <span className="art-watermark" aria-hidden="true">
                        Representative photo
                      </span>
                    </div>
                    <div className="vehicle-details">
                      <div className="vehicle-make">{vehicle.make}</div>
                      <h3>{vehicle.model}</h3>
                      <div className="vehicle-price-row">
                        <strong>{money(vehicle.price)}</strong>
                        <span
                          className={`stock-label ${vehicle.quantity === 0 ? 'sold-out' : vehicle.quantity <= 3 ? 'low-stock' : ''}`}
                        >
                          <i />
                          {vehicle.quantity === 0
                            ? 'Sold out'
                            : `${vehicle.quantity} available`}
                        </span>
                      </div>
                      <div className="vehicle-card-footer">
                        <span>
                          {vehicle.quantity === 0
                            ? 'Worth the wait.'
                            : vehicle.quantity <= 3
                              ? 'A rare opportunity.'
                              : 'Your next chapter.'}
                        </span>
                        <button
                          className="purchase-button"
                          aria-label={`Purchase ${vehicle.make} ${vehicle.model}`}
                          disabled={
                            vehicle.quantity === 0 ||
                            purchasing.includes(vehicle.id)
                          }
                          onClick={() => purchase(vehicle)}
                        >
                          {purchasing.includes(vehicle.id)
                            ? 'Purchasing…'
                              : 'Purchase'}
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                      {admin && (
                        <div className="admin-actions">
                          <button
                            aria-label={`Edit ${vehicle.make} ${vehicle.model}`}
                            onClick={() => setModal({ kind: 'edit', vehicle })}
                          >
                            <Pencil size={13} />
                            Edit
                          </button>
                          <button
                            aria-label={`Restock ${vehicle.make} ${vehicle.model}`}
                            onClick={() =>
                              setModal({ kind: 'restock', vehicle })
                            }
                            disabled={vehicle.quantity >= 1000000}
                          >
                            <PackagePlus size={14} />
                            Restock
                          </button>
                          <button
                            className="delete-action"
                            aria-label={`Delete ${vehicle.make} ${vehicle.model}`}
                            onClick={() =>
                              setModal({ kind: 'delete', vehicle })
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="collection-footnote">
              <span className="footnote-line" />
              <span>GOOD CARS. NO WRONG TURNS.</span>
              <span className="footnote-line" />
            </div>
          </section>
          <footer className="page-footer">
            <span>
              © {new Date().getFullYear()} Carpool. Find your next drive.
            </span>
            <span>Demo inventory: real models, sample prices and stock. Photos are representative, via <a href="https://unsplash.com/license" target="_blank" rel="noreferrer">Unsplash</a>. Prices in INR.</span>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Back to top <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      {modal && (
        <VehicleEditor
          modal={modal}
          onClose={() => setModal(null)}
          onSaved={saved}
          onConflict={() => setRefresh((value) => value + 1)}
        />
      )}
      {profileOpen && <Modal title="Your account" onClose={() => setProfileOpen(false)}><AccountProfile /></Modal>}
      {guide && (
        <Modal
          title="A considered way forward."
          onClose={() => setGuide(false)}
        >
          <div className="guide-content">
            <p>
              Find your kind of drive using make, model, category, and price
              filters. Every listing shows its current price and available
              quantity.
            </p>
            <h3>Make it yours</h3>
            <p>
              Purchasing reserves one vehicle immediately and reduces the
              available stock by one. There is no payment or delivery workflow
              in this inventory application.
            </p>
            {admin && (
              <>
                <h3>Keep things moving</h3>
                <p>
                  Add and edit listings, restock available units, or remove a
                  vehicle with confirmation. Your administrator tools appear on
                  each card.
                </p>
              </>
            )}
            <p className="field-hint">
              Photos are representative, not the exact vehicles for sale. Seeded prices and stock are sample data. Your
              session is stored only in this browser tab.
            </p>
            <button className="button primary" onClick={() => setGuide(false)}>
              Back to the collection
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
