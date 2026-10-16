# BiblioBazaar — a marketplace library

A complete, production-shaped marketplace where readers **buy**, **sell** and **borrow** books.
Full-stack JavaScript, **zero runtime dependencies**, and a test suite that drives both the HTTP API
and the real UI in a browser.

```bash
npm start           # http://localhost:3000  (seeds itself on first run)
npm run test:all    # 80 API tests + 41 browser end-to-end checks
```

Requires **Node.js 22.5+** (for the built-in `node:sqlite`). Nothing to install, no build step.

---

## Demo accounts

| Role | Email | Password | What you can see |
|------|-------|----------|------------------|
| Admin | `admin@bibliobazaar.test` | `Admin1234` | Everything, plus the admin console |
| Seller | `seller@bibliobazaar.test` | `Seller1234` | Storefront, listings, order fulfilment |
| Reader | `reader@bibliobazaar.test` | `Reader1234` | Shopping, loans, reviews, wishlist |

Test cards at checkout: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined,
`4000 0000 0000 0003` has insufficient funds. Promo codes: `WELCOME10`, `READMORE`, `STUDENT15`.

---

## What works

**Shopping**
- Catalogue search across title, author, ISBN, description and publisher, with faceted filters
  (category, condition, format, language, price range, rating, availability, buy/borrow) and seven sort orders.
- Facet counts recompute against the active filter set; filters are URL-addressable and shareable.
- Book pages with specs, generated cover art, seller card, related titles, rating histogram and reviews.
- Cart for guests (kept in `localStorage`) that **merges into the account** on sign-in or registration.
- Quantity limits bound by live stock, promo codes with minimum-spend and discount caps, tax,
  three shipping speeds and free standard shipping over a threshold.
- Checkout with address book, card validation (Luhn, expiry, CVC by network), and a mock gateway
  with deterministic declines. Payment failure never creates an order or moves stock.
- Orders: status timeline, per-line fulfilment tracking, cancel-before-dispatch with automatic refund
  and restock, reorder, and invoice-style payment summary.

**Borrowing (the library half)**
- Rent eligible titles by the week; rental stock is tracked separately from sale stock.
- Loans page with due dates, progress, overdue flagging, per-day late fees, returns and extensions
  (capped), plus a reminder sweep that notifies readers before and after the due date.

**Selling**
- Open a storefront in one step; get a public storefront page at `/stores/:slug`.
- Listing editor with cover upload (validated, size-capped, SVG scripts rejected) or generated cover art.
- New and edited listings enter a moderation queue before going live.
- Seller dashboard: revenue, payouts after platform fee, units, 14-day revenue chart, stock, backlog,
  top titles, recent orders and reviews.
- Fulfilment workflow: processing → packed → shipped → delivered, or cancel a line (restocks, refunds, notifies).

**Administration**
- Platform dashboard: GMV, platform revenue, AOV, user/catalogue/loan breakdowns, top sellers and titles.
- Moderation queue with approve / reject (with a note the seller sees) / archive.
- User management: search, filter, role changes, suspension (ends sessions and archives live listings).
- Order search across every account, with refunds.
- Promo code and category CRUD; a maintenance action to run the loan reminder sweep.

**Platform**
- Session auth with scrypt hashes, server-side sessions, HttpOnly cookies, double-submit CSRF,
  per-device session list and "sign out everywhere".
- Role-based access on every route; rate limiting on auth endpoints.
- Notifications for order, refund, loan and review events.
- Light/dark themes (persisted), responsive to 390px, keyboard-navigable, WCAG-AA contrast in both themes.

---

## Architecture

```
server/
  index.js            entry point: boot, seed-if-empty, daily loan sweep, graceful shutdown
  app.js              request pipeline: API router, /uploads, static files, SPA fallback, error mapping
  config.js           env loading + the single source of truth for commerce rules
  lib/                http router, validator, errors, scrypt/HMAC helpers, cookies, rate limiter, static server
  db/                 node:sqlite connection, statement cache, transactions, schema.sql
  middleware/auth.js  session resolution, CSRF enforcement, requireAuth / requireRole / requireSeller
  routes/             thin HTTP layer: parse -> validate -> call a service -> return a DTO
  services/           all business rules (books, cart, orders, loans, reviews, payments, stats, …)
public/
  index.html          app shell
  styles/             design tokens, components, page layouts
  app/                router, store, api client, hyperscript DOM helpers, components, 20 page modules
tests/
  *.test.js           API integration tests (node:test) against a real server on an isolated database
  e2e/run.js          Playwright suite driving the real UI end to end
scripts/              seed (deterministic demo data) and reset
```

**Why zero dependencies.** Node 22 ships `node:sqlite`, `node:test` and a mature `fetch`/`crypto` surface.
Using them directly removes an install step, a supply-chain surface and a build pipeline, and the app runs
anywhere Node 22 does. The trade-off is explicit: the HTTP router, validator and session layer are small
(~700 lines total) and purpose-built rather than battle-tested frameworks. The service layer is framework-agnostic,
so swapping in Express/Fastify or Postgres means rewriting `lib/http.js` and `db/index.js`, not the business rules.

**Data model.** Money is integer cents everywhere; only formatting converts to decimals. Ratings and unit
sales are SQL views (`book_ratings`, `book_sales`) so aggregates can never drift from their source rows.
Orders snapshot title, author and price at purchase time, so later edits to a listing never rewrite history.
Multi-seller orders are modelled per line: each `order_item` carries its own fulfilment state and the order
status is derived from the least-advanced live line.

**Consistency.** Checkout, cancellation, returns and moderation all run inside transactions. Stock decrements
use a conditional `UPDATE … WHERE stock >= ?` and abort the transaction when it matches nothing, so two
shoppers racing for the last copy cannot oversell it (there is a test for exactly this).

---

## API

All endpoints are under `/api`, return JSON, and report errors as
`{ "error": { "code", "message", "fields?" } }`. Mutating requests need the `X-CSRF-Token` header
to match the `bb_csrf` cookie.

| Area | Endpoints |
|------|-----------|
| Meta | `GET /health`, `GET /meta`, `GET /categories` |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET/PATCH /auth/me`, `POST /auth/password`, `GET/DELETE /auth/sessions` |
| Catalogue | `GET /books`, `GET /books/home`, `GET /books/suggest`, `GET /books/:id`, `GET /books/:id/cover.svg`, `POST /books`, `PATCH /books/:id`, `DELETE /books/:id` |
| Reviews | `GET/POST /books/:id/reviews`, `DELETE /reviews/:id`, `POST /reviews/:id/helpful`, `GET /reviews/mine` |
| Cart | `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, `DELETE /cart`, `POST /cart/merge`, `POST /cart/coupon` |
| Checkout & orders | `GET /checkout/preview`, `POST /checkout`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/reorder`, `PATCH /orders/:id/items/:itemId` |
| Loans | `GET /loans`, `POST /loans/:id/return`, `POST /loans/:id/extend` |
| Wishlist & addresses | `GET /wishlist`, `POST /wishlist/:bookId`, `DELETE /wishlist/:bookId`, `GET/POST /addresses`, `PATCH/DELETE /addresses/:id` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
| Selling | `POST /sellers/apply`, `PATCH /sellers/store`, `GET /sellers/dashboard`, `GET /sellers/listings`, `GET /sellers/orders`, `GET /sellers/reviews`, `POST /sellers/uploads`, `GET /stores/:slug` |
| Admin | `GET /admin/dashboard`, `GET /admin/users`, `PATCH /admin/users/:id/role`, `PATCH /admin/users/:id/status`, `GET /admin/moderation`, `POST /admin/books/:id/moderate`, `GET /admin/orders`, `POST /admin/orders/:id/refund`, `GET/POST /admin/coupons`, `PATCH/DELETE /admin/coupons/:id`, `POST /admin/categories`, `PATCH/DELETE /admin/categories/:id`, `POST /admin/maintenance/loan-sweep` |

Example:

```bash
curl -s 'http://localhost:3000/api/books?q=dune&facets=1' | head -c 400
curl -s -c jar -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"reader@bibliobazaar.test","password":"Reader1234"}'
```

---

## Testing

```bash
npm test            # 80 API integration tests, each suite on its own SQLite file
npm run test:e2e    # 41 Playwright checks driving the real UI
SHOTS=1 npm run test:e2e   # also writes screenshots to tests/e2e/screenshots/
npm run test:all    # both
```

The API suite covers auth and CSRF, catalogue search/filter/sort correctness, cart and pricing rules,
checkout (success, decline, validation, empty cart), cancellation and refunds, fulfilment transitions and
their permissions, loans, reviews and votes, addresses, notifications, the seller and admin surfaces,
and platform concerns: security headers, path traversal, SQL injection, XSS escaping, cookie flags,
secret leakage, concurrent oversell, and database invariants.

The browser suite walks the guest, shopper, seller and admin journeys through the real DOM, then checks
access control, deep links, dark mode, mobile layout (no horizontal overflow at 390px), accessible names,
keyboard navigation, and that no console errors occurred during the whole run. Failures write a full-page
screenshot to `tests/e2e/screenshots/fail-*.png`.

---

## Configuration

Copy `.env.example` to `.env` (every value has a safe default):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Listen address |
| `NODE_ENV` | `development` | `production` adds `Secure` cookies and hides error details |
| `SESSION_SECRET` | random per boot | HMAC key for session tokens — **set this in production**, or sessions drop on restart |
| `DB_PATH` | `./data/library.db` | SQLite file, or `:memory:` |
| `UPLOAD_DIR` | `./data/uploads` | Cover uploads |
| `LOG_LEVEL` | `info` | `silent`, `error`, `warn`, `info`, `debug` |
| `RATE_LIMIT_LOGIN` / `RATE_LIMIT_REGISTER` | `20` / `10` | Attempts per window per IP |

Commerce rules (tax rate, shipping prices, free-shipping threshold, rental durations, late fees,
platform fee) live in `server/config.js` and are published to the client via `/api/meta`, so there is
one source of truth for both sides.

```bash
npm run seed    # populate an empty database
npm run reset   # delete and rebuild the database with fresh demo data
```

---

## Operational notes and known limits

- **Single node by design.** SQLite (WAL) and the in-memory rate limiter assume one process. For
  horizontal scale, move the limiter to Redis and the database to Postgres; the service layer SQL is
  standard enough to port, and only `db/index.js` knows the driver.
- **Payments are mocked.** `services/payments.js` validates like a real gateway and fails
  deterministically, but charges nothing. Replace `authorize`/`refund` with a PSP SDK and move the
  secret to the environment; nothing else changes.
- **Sessions are server-side.** Revoking a session is immediate; the cost is a database read per request.
- **Search is `LIKE`-based.** Fine to tens of thousands of rows with the current indexes. Past that,
  move to SQLite FTS5 (`books_fts`) — the query builder in `services/books.js` is the only thing that changes.
- **Uploads are stored on local disk**, so a container restart loses them unless `data/` is a volume.
- **No email.** Notifications are in-app only; the notification service is the natural place to add a transport.
