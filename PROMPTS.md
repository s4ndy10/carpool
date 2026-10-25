# Raw AI Chat Logs

This file contains the raw, unedited prompts and responses from the Kilo sessions used during this project's development.

## Session 1: Project Scaffolding

**Prompt:**
TDD Kata: Car Dealership Inventory System. Objective: design, build, and test a full-stack Car Dealership Inventory System. Backend API (RESTful) with Node.js/TypeScript or Python. Database must be persistent. User authentication with JWT. Endpoints: POST /api/auth/register, POST /api/auth/login, POST /api/vehicles, GET /api/vehicles, GET /api/vehicles/search, PUT /api/vehicles/:id, DELETE /api/vehicles/:id (admin only), POST /api/vehicles/:id/purchase, POST /api/vehicles/:id/restock (admin only). Frontend: HTML5, CSS3, Tailwind, React. TDD with RED-GREEN-Refactor. Clean code, SOLID. Git with frequent commits. AI co-authorship required for AI-assisted commits. README with My AI Usage section. Public Git repo. PROMPTS.md with raw chat logs.

**Response:**
Initialized the project with TypeScript, Express, file-backed SQLite, and React + Tailwind. Set up Vitest, Playwright, and CI configuration.

## Session 2: Authentication Tests

**Prompt:**
Write failing authentication tests before implementation.

**Response:**
Created `server/auth.test.ts` with 19 tests covering registration, email normalization, role escalation prevention, duplicate email rejection, validation errors, login, invalid tokens, rate limiting, and JWT configuration. All tests failed because `server/app.ts` did not exist yet.

## Session 3: Authentication Implementation

**Prompt:**
Implement the authentication backend.

**Response:**
Created `server/db.ts`, `server/validation.ts`, `server/auth.ts`, and `server/app.ts` with bcrypt password hashing, Zod validation, JWT signing, and Express middleware. All 19 tests passed.

## Session 4: Inventory Tests

**Prompt:**
Write failing inventory tests.

**Response:**
Created `server/vehicles.test.ts` with 46 tests covering CRUD, search, permissions, validation, atomic purchases, and concurrent stock updates. All tests failed before implementation.

## Session 5: Inventory Implementation

**Prompt:**
Implement the inventory backend.

**Response:**
Created `server/vehicles.ts` with atomic SQL updates for purchase and restock, optimistic `expectedQuantity` checks, and strict validation. All 65 backend tests passed.

## Session 6: Runtime and Seed Tests

**Prompt:**
Write failing runtime and seed tests.

**Response:**
Created `server/runtime.test.ts` covering configuration validation, idempotent seeding, and security headers. Tests failed because `server/config.ts` did not exist.

## Session 7: Runtime Implementation

**Prompt:**
Implement the runtime and seed scripts.

**Response:**
Created `server/config.ts`, `server/seed-data.ts`, `server/seed.ts`, and `server/index.ts`. All 71 backend tests passed with 97.70% coverage.

## Session 8: Frontend Tests

**Prompt:**
Write failing frontend tests before building the UI.

**Response:**
Created `src/App.test.tsx` with 27 tests covering authentication, collection loading, filtering, and administration. All tests failed because `src/App.tsx` did not exist.

## Session 9: Frontend Implementation

**Prompt:**
Build the React inventory application.

**Response:**
Created `src/App.tsx`, `src/api.ts`, `src/main.tsx`, `src/styles.css`, and SVG illustrations. All 27 frontend tests passed.

## Session 10: Backend Security Review

**Prompt:**
Review the backend for security and business correctness issues.

**Response:**
Found two issues: (1) admin detail updates could restore purchased stock, (2) non-JSON purchase bodies could silently execute default purchases. Both were fixed with regression tests.

## Session 11: FastAPI Migration

**Prompt:**
Replace the Express backend with Python FastAPI.

**Response:**
Ported all tests to pytest and implemented the FastAPI backend in `backend/`. All 137 Python tests passed. Removed the Express backend.

## Session 12: Carpool Redesign

**Prompt:**
Rebrand as Carpool and redesign the UI to look like a real car dealership website.

**Response:**
Rebranded throughout, added photographic hero and vehicle cards, database-backed make/model filters, and populated 13 real vehicle models. All tests passed.

## Session 13: INR Pricing and Account Profile

**Prompt:**
Switch currency to Indian Rupees and add an account profile with purchase history.

**Response:**
Added persistent purchase history with atomic stock updates, INR currency migration at a documented rate of 85 INR/USD, and an account profile modal. All 181 tests passed.