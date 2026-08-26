# PO Register — Next.js + Supabase

A material-requisition and purchase-order tool with three separate access
levels, backed by a real Postgres database:

- **Per-company/project dashboards** — each company logs in with its own
  PIN and only ever sees its own requests. No company can see another
  company's data, add companies, pick vendors, or view priced/generated POs.
- **Process POs admin** — prices requests, generates PO numbers, manages
  vendors, sees every company's requests.
- **Companies admin** — manages the company list, each company's PIN,
  standard terms, quick-add items, approval authorities, and the Process
  POs PIN.

Stack:
- **Next.js 14** (App Router) — hosted on **Vercel**
- **Supabase** (Postgres) — the actual database
- All database access happens **only on the server** (`app/api/*` route
  handlers) using Supabase's `service_role` key. The browser never talks to
  Supabase directly and never sees that key or any PIN in plain text.

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → New project.
2. Once it's provisioned: **SQL Editor** → New query → paste the contents
   of `supabase/schema.sql` → Run.
3. **Project Settings** → **API** → copy:
   - **Project URL** (e.g. `https://abcxyzcompany.supabase.co`)
   - **`service_role` secret key** (NOT the `anon`/`public` key)

## 2. Run it locally (optional, but recommended before deploying)

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and paste in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Open http://localhost:3000 — you'll land on the sign-in gate. Click
**Admin**, enter `2026` (the default Process POs / Companies PIN — both
default to this until changed), then go to the **Companies** tab to:
- change both admin PINs to something real
- add your companies and set each one's **project access PIN**

Give each company/project team their PIN so they can sign in with
**"I'm a project / company"** on the gate screen.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo (or use the `vercel` CLI directly).
2. Go to https://vercel.com/new and import the repo. Framework preset:
   Next.js (auto-detected).
3. Add environment variables (Project → Settings → Environment Variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy.

## How sign-in works

Nobody sees any data until they authenticate at the entry gate:

- **"I'm a project / company"** → enter that company's PIN → scoped
  dashboard for that one company only (Raise Request + Track/Received).
  No vendor picker (admin assigns the vendor while pricing), no "add new
  company," no way to see any other company's requests, and no pricing or
  vendor bank details ever included in what's sent to the browser.
- **"Admin"** → enter either the Process POs PIN or the Companies PIN →
  the full, unrestricted app: Raise Request/Track for every company,
  Process POs, Vendors, and (if you also know the Companies PIN) Companies.
  Whichever PIN you entered auto-unlocks that one area; the other admin
  area still asks for its own PIN.

A project session is remembered in `sessionStorage` (cleared when the
browser tab closes) so people don't have to re-enter their PIN on every
page refresh during a session.

## How data is stored

Everything lives in one Postgres table (`po_workspace`) as four JSON
documents: `companies`, `vendors`, `requests`, `settings`. Each company
object inside `companies` carries its own `accessPin`.

## Security model — what's protected and what isn't

- **Project/company access is enforced server-side on every call.** The
  `app/api/project/*` routes re-verify a company's PIN against that
  specific `companyId` on every request (login, listing, submitting,
  cancelling, confirming receipt) — not just once at sign-in. They also
  strip pricing, vendor, and financial fields before anything is sent to
  the browser (`lib/projectData.js` → `sanitizeRequestForProject`).
- **Vendors and Settings** require the correct admin PIN, checked on the
  server, before any write is accepted (`app/api/kv/route.js`). Neither
  admin PIN, nor any company's project-access PIN, is ever sent to the
  browser in plain text — only a `hasAccessPin` / unlocked boolean.
- **Companies** writes at `/api/kv` are intentionally left open (no PIN
  check), matching the original design where the admin's own Raise Request
  screen can add a company inline. In normal use this endpoint is only
  ever reached from inside the already admin-gated part of the app (you
  had to pass the entry gate to get there). A determined attacker
  crafting raw requests directly to this endpoint could still write to
  `companies` without a PIN — this is a known, documented trade-off, not a
  gap in the project-dashboard isolation (which goes through the strictly
  scoped `/api/project/*` routes instead and never touches this endpoint).
- **Requests** writes at `/api/kv` are also open, since the admin's own
  Raise Request/Track screens need to write there without re-supplying a
  PIN on every action.

If you need stronger guarantees later — real per-user accounts, an audit
trail of which admin generated which PO, or locking down the `companies`
write path — the right upgrade is **Supabase Auth**, replacing the
shared-PIN checks with per-user sessions and Row Level Security policies.
The codebase is structured so that's a contained change (mostly in
`app/api/*` and the sign-in screens), not a rewrite of the UI.

## Files

```
app/
  layout.js, page.js, globals.css
  api/
    kv/route.js                      admin-only reads/writes (companies, vendors, requests, settings)
    admin/verify-pin/route.js        checks an admin PIN server-side without exposing it
    project/verify-pin/route.js      checks a company's PIN, returns only that company's id/name
    project/list/route.js            returns one company's own (sanitized) requests
    project/action/route.js          submit / cancel / confirm-received, scoped to one company
components/
  POWorkspace.jsx     entry gate (POWorkspace) + AdminApp (full app) + ProjectDashboard (scoped app)
lib/
  supabaseAdmin.js    server-only Supabase client (service_role key)
  projectData.js       shared helpers for the project-scoped routes (fetch/filter/sanitize/save)
supabase/
  schema.sql           run once in the Supabase SQL editor
.env.local.example      copy to .env.local for local dev
```
