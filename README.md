# PO Register — Next.js + Supabase

Same app as the prototype (raise requests, price & generate POs, PDF/Excel
export, vendor & company management) rebuilt as a real deployable product:

- **Next.js 14** (App Router) — hosted on **Vercel**
- **Supabase** (Postgres) — the actual database, replacing the old
  browser-only "artifact storage"
- All database access happens **only on the server** (in `app/api/*` route
  handlers) using Supabase's `service_role` key. The browser never talks to
  Supabase directly and never sees that key.
- The admin PIN is verified server-side (`/api/admin/verify-pin`) and is
  never sent back to the browser in plain text.

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → New project. Pick any name/region,
   set a database password (you won't need it directly — save it somewhere
   safe anyway).
2. Once it's provisioned: left sidebar → **SQL Editor** → New query → paste
   the contents of `supabase/schema.sql` from this project → Run.
3. Left sidebar → **Project Settings** → **API**. You'll need two values
   from this page in step 3 below:
   - **Project URL** (e.g. `https://abcxyzcompany.supabase.co`)
   - **`service_role` secret key** (NOT the `anon`/`public` key — the
     service_role key bypasses Row Level Security, which is exactly what
     the server needs and exactly why it must never reach the browser)

## 2. Run it locally (optional, but recommended before deploying)

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and paste in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Open http://localhost:3000 — you should see "Opening the register..." then
the app. The default admin PIN is **2026** (change it immediately from the
Companies tab once you're in).

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo (or use `vercel` CLI directly on the
   folder — either works).
2. Go to https://vercel.com/new and import the repo.
3. Framework preset: Next.js (auto-detected). No build command changes
   needed.
4. Before deploying, add environment variables (Project → Settings →
   Environment Variables, or the "Environment Variables" section on the
   import screen):
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your service_role key
5. Deploy. Vercel gives you a `*.vercel.app` URL immediately; attach a
   custom domain later from Project → Settings → Domains if you want one.

That's it — every employee/admin who opens the URL is now reading and
writing the same shared Postgres data.

## How data is stored

The app keeps 4 JSON documents in one Postgres table (`po_workspace`):
`companies`, `vendors`, `requests`, `settings`. This mirrors the original
prototype's shape closely (so nothing about the UI/logic had to change)
while giving you a real, backed-up, queryable database underneath. If you
outgrow this later, splitting `requests`/`companies`/`vendors` into their
own relational tables is a natural next step — the SQL and API layer are
isolated in `supabase/schema.sql` and `app/api/kv/route.js`, so that
refactor wouldn't touch the UI code in `components/POWorkspace.jsx` much.

## Security model — what's protected and what isn't

- **Vendors and Settings** (which includes the admin PIN, standard terms,
  and approval authorities) require the correct PIN, checked **on the
  server**, before any write is accepted. The PIN itself is never sent to
  the browser — `/api/admin/verify-pin` compares it server-side and only
  returns `true`/`false`.
- **Companies** writes are open (no PIN), because the original design lets
  any employee add a new project/company inline while raising a request.
- **Requests** writes are open (no PIN), because both employees (raising a
  request, confirming receipt) and admins (pricing, generating, deleting)
  need to write to it.

**This means the PIN is a soft, single-shared-secret control** — good
enough for an internal tool used by a small trusted team, but it does not
give you per-user accountability (you can't prove *which* admin generated a
given PO), and anyone who obtains the PIN can hit the API directly and
bypass the UI entirely. If you need real per-person accounts, audit trails,
or the ability to revoke one person's access without changing the PIN for
everyone, the right upgrade is **Supabase Auth** (email/password or magic
link) with Row Level Security policies keyed to `auth.uid()`, replacing the
shared-PIN check in `app/api/kv/route.js`. That's a bigger change but the
codebase here is structured so it's a contained one (mostly in the API
routes + a login screen, not the rest of the UI).

## Files

```
app/
  layout.js               root layout, loads Google Fonts
  page.js                 loads the workspace client-side only
  globals.css
  api/
    kv/route.js            GET/POST for the 4 JSON documents (server-only Supabase access)
    admin/verify-pin/route.js   checks the PIN server-side without exposing it
components/
  POWorkspace.jsx         the entire app UI/logic (ported from the prototype)
lib/
  supabaseAdmin.js        server-only Supabase client (service_role key)
supabase/
  schema.sql              run once in the Supabase SQL editor
.env.local.example        copy to .env.local for local dev
```
