# Carpool - Car Dealership Inventory System

A full-stack car dealership inventory system, combining a Python FastAPI backend, a persistent SQLite database, and a responsive React + Tailwind frontend.

This project was built as part of the Incubyte campus recruitment program.

## Features

- **Authentication** — registration, login, and JWT session validation with role-based access.
- **Inventory management** — add, update, search, and delete vehicles. Stock is adjusted atomically, and admin-only operations are enforced server-side.
- **Search and filtering** — filter by make, model, body style, and price range, with make/model options loaded from the database.
- **Purchasing** — purchase vehicles, with stock never overselling under concurrent requests.
- **Account profile** — signed-in members can view their membership details and private purchase history.
- **Indian Rupee pricing** — prices display in INR with Indian digit grouping.

## Architecture

```
backend/          FastAPI application (Python 3.12+)
  app.py          Application factory, error handling, static files
  auth.py         Registration, login, JWT verification
  vehicles.py     Vehicle CRUD, search, purchase, restock
  account.py      Account details and purchase history
  db.py           Persistent SQLite connection and schema
  models.py       Pydantic validation models
  tests/          147 contract tests

src/             React + Tailwind single-page application
  App.tsx         Main SPA with auth, collection, and administration views
  AccountProfile.tsx  Account and purchase history modal
  format.ts       INR currency formatting
  styles.css      Tailwind + custom design system
  tests/          34 component tests

e2e/             Playwright real-browser acceptance tests (desktop + mobile)
```

## Tech Stack

- **Backend** — Python 3.14, FastAPI, Pydantic, PyJWT, bcrypt, SQLite
- **Frontend** — React 19, Tailwind v4, Vite, Lucide React
- **Testing** — pytest + coverage, Vitest, Playwright + axe-core accessibility
- **CI** — GitHub Actions

## Live deployment

The frontend is deployed at **https://inventorysystem-beryl.vercel.app** (production). The backend is a FastAPI application that must run separately or be hosted alongside it; for a fully live demo, run the backend locally (`npm run dev`) or deploy it to a server with the `.env` secrets set.

### Choose how to run it

- **Local only:** `npm run dev` starts both frontend (Vite) and backend (FastAPI) on localhost. This is the fastest way to develop or demo locally.
- **Deployed (live URL above):** The frontend is live on Vercel. To use the full inventory, purchase, and account features, the FastAPI backend also needs to be running (either locally or on a hosted server) because the SPA calls `/api/*` endpoints.

## Setup

### Prerequisites

- Node.js 22
- Python 3.12 or newer

### Backend

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
cp .env.example .env
# Edit .env: set a unique JWT_SECRET and admin credentials
npm run seed          # Populates demo inventory and creates an admin account
```

### Frontend

```bash
npm install
npm run dev           # Starts FastAPI and Vite together
```

Open **http://127.0.0.1:5173/**.

API documentation is available at **http://127.0.0.1:3001/docs** while the server runs.

## Admin access

The seeded admin account uses the credentials in `.env`:

| Field | Value |
|---|---|
| Email | `admin@mail.com` |
| Password | Set in `.env` (`ADMIN_PASSWORD`) |

After signing in, the admin dashboard shows **Add vehicle**, **Edit**, **Restock**, and **Delete** controls on each vehicle card.

## Testing

```bash
npm run test:backend   # 147 Python contract tests
npm run test:frontend  # 34 React component tests
npm run test:e2e       # 4 desktop + mobile browser tests
npm run check          # Type check, lint, coverage, and production build
```

## Deployment

The frontend is a static build that can be deployed to Vercel, Netlify, or any static host. The backend is a FastAPI application that runs on its own server or container.

## Data

Vehicles and accounts are stored in a persistent SQLite database at `./data/forecourt.db`. The database is migrated once from USD to INR at a documented demo rate of 85 INR/USD. A backup of the pre-migration database is saved as `data/forecourt.pre-inr-backup.db`.

Prices and stock are illustrative demo data. Photographs are representative, not the exact vehicles for sale. The live Vercel deployment serves only the static frontend; the database-backed backend needs to be running separately for full functionality.

## My AI Usage

I used Kilo as an AI co-author throughout development. Here is how it was used and what I verified myself.

### Tools used

- **Kilo** — generated scaffolding, wrote tests, implemented features, and verified results.

### How AI was used

- **Project setup** — Kilo generated the initial `package.json`, TypeScript and Vitest configurations, and dependency selection. I reviewed the dependency versions and verified the patched test runner resolves the audit vulnerabilities.
- **Tests** — Kilo wrote the failing authentication, inventory, runtime, account, and frontend contract tests before implementation. I ran them to confirm the RED stage, then implemented against them.
- **Backend implementation** — Kilo implemented the FastAPI backend: authentication, validation, inventory routes, atomic purchase updates, optimistic stock corrections, and the INR currency migration. I verified the business logic, including the concurrency test that confirms eight competing purchases never oversell.
- **Frontend implementation** — Kilo built the Carpool redesign, the account profile modal, and the INR currency formatting. I verified the responsive layouts, accessibility checks, and browser workflows.
- **Code review** — A Kilo review caught a lost-update risk where an admin detail edit could restore purchased stock. I added optimistic `expectedQuantity` checks and regression tests.
- **Verification** — Kilo ran the full test suite, lint, and production build after each change.

### Reflection

AI accelerated scaffolding and test generation, which let me focus on business rules, security, and design decisions. I reviewed every AI-generated change before committing, and the commit history shows the RED-GREEN-REFactor pattern with AI credited only where it made sense.

### Transparency

Every commit where AI was used includes a `Co-authored-by: Kilo` trailer. The raw chat logs are available in `PROMPTS.md`.
