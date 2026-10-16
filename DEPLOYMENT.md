# Deploying BiblioBazaar

The app is a single long-lived Node 22.5+ process that stores everything in a SQLite file and
writes cover uploads to disk. That shapes every hosting decision below.

| Target | Everything works? | Data survives restarts? | Effort |
|--------|-------------------|--------------------------|--------|
| **Render / Railway / Fly.io** (persistent disk) | Yes | Yes | Lowest — recommended |
| **Vercel** (as configured here) | Yes, per instance | **No** — resets on every cold start | Lowest, but demo-only |
| **Vercel + Turso/libSQL** | Yes | Yes | Medium — requires porting the data layer |

---

## Option A — Vercel (configured in this repo)

`vercel.json` and `api/[...path].js` are already committed, so the repo imports and deploys as-is.

**From the dashboard (no CLI):**
1. Go to <https://vercel.com/new> and import `VivekKhator/LIBRARY-WEB`.
2. Framework preset: **Other**. Leave the build and install commands empty — there is no build step.
3. Add the environment variables below, then **Deploy**.
4. The URL Vercel prints is the live site.

**From the CLI:**
```bash
npm i -g vercel
vercel login
vercel --prod            # run from the repository root
```

Environment variables to set in **Project → Settings → Environment Variables**:

| Variable | Value | Why |
|----------|-------|-----|
| `SESSION_SECRET` | a long random string (`openssl rand -hex 32`) | Without it every instance signs its own cookies and users are logged out constantly |
| `SEED_ADMIN_EMAIL` | your email | Otherwise the published demo admin credentials work on your public URL |
| `SEED_ADMIN_PASSWORD` | a strong password | As above |

### What you get, precisely

Serverless functions have a read-only bundle and a writable `/tmp` that is **per-instance and
discarded on cold start**. The app detects this (`config.isServerless`) and puts the database and
uploads in `/tmp`, seeding the demo catalogue on each cold start. So:

- Browsing, search, filtering, book pages, the cart, checkout, the seller and admin consoles all work.
- Anything you *write* — a new order, a review, a listing — lives only in the instance that served it.
  A cold start, a redeploy, or a request routed to a second instance shows the freshly seeded data again.
- Uploaded cover images disappear with the instance; generated covers are unaffected.
- The rate limiter counts per instance rather than globally.

That is fine for a demo or a portfolio link. It is not a durable deployment, and no amount of
configuration makes a serverless filesystem durable — the fix is a network database (Option C).

---

## Option B — a host with a persistent disk (recommended)

Nothing in the app changes; point `DB_PATH` and `UPLOAD_DIR` at a mounted volume.

**Render** — `render.yaml` is committed, so <https://dashboard.render.com/blueprints> → *New Blueprint*
→ pick the repo. Set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before the first boot. A disk needs a
paid instance type; on the free tier the filesystem is wiped on every deploy and idle shutdown.

**Railway / Fly.io / any Docker host** — a `Dockerfile` is committed:

```bash
docker build -t bibliobazaar .
docker run -d -p 3000:3000 \
  -v bibliobazaar-data:/data \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e SEED_ADMIN_EMAIL=you@example.com \
  -e SEED_ADMIN_PASSWORD='a-strong-password' \
  bibliobazaar
```

The image copies `server/`, `public/` and `scripts/`, runs as the unprivileged `node` user, keeps state
on the `/data` volume and ships a healthcheck against `/api/health`. (The image was authored here but
not built — this environment has the Docker CLI without a daemon. The identical process and paths were
verified directly: production mode boots, authenticated writes succeed, and both data and sessions
survive a SIGTERM restart.)

**Plain VPS** — `node server/index.js` behind nginx or Caddy for TLS, with systemd for restarts.
Set `NODE_ENV=production` so cookies get the `Secure` flag.

---

## Option C — Vercel with durable data

If Vercel is a hard requirement *and* data must persist, swap SQLite-on-disk for a network database.
[Turso](https://turso.tech) (libSQL) is the closest fit: same SQL dialect, same schema, HTTP driver
that works in serverless.

The work is contained but not trivial:

1. `npm i @libsql/client` and rewrite `server/db/index.js` against it (~120 lines).
2. libSQL's client is **async** while the current helpers (`get`, `all`, `run`, `transaction`) are
   synchronous, so every call site in `server/services/*` becomes `await`-ed and those functions
   become `async`. The routes already `await` their handlers, so the HTTP layer is unaffected.
3. Move uploads to object storage (Vercel Blob or S3) in `server/services/uploads.js`.
4. Replace the in-memory limiter in `server/lib/ratelimit.js` with Redis/Upstash so limits are global.

Budget most of a day including re-running the suite. Nothing above touches the UI, the schema or the
business rules — the service layer boundary is what makes it contained.

---

## Post-deploy checklist

```bash
curl https://<your-domain>/api/health     # {"ok":true,...}
curl https://<your-domain>/api/meta       # commerce rules + categories
```

Then in a browser: sign in, add a book to the cart, and complete a checkout with `4242 4242 4242 4242`.
If the order appears under **Orders**, every layer — session, CSRF, database write, transaction — is live.

Confirm in the logs that no startup warnings remain: the server warns when `SESSION_SECRET` is unset,
when the demo admin password is still in place, and when it detects a serverless filesystem.
