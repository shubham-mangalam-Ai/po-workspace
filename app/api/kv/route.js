import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const DEFAULT_PIN = "2026";

// Two separate admin areas, two separate PINs:
//  - "process"  -> Process POs tab (pricing/generating/deleting requests) AND Vendors tab
//  - "company"  -> Companies tab (company list, standard terms, quick-add
//                  items, approval authorities, and both PINs themselves)
//
// "requests" and "companies" stay unprotected at this endpoint -- this
// endpoint is only ever called from the already admin-gated part of the
// app (see components/POWorkspace.jsx: AdminApp only mounts after the
// entry gate accepts one of the two admin PINs). Per-company data
// isolation for non-admin users is enforced separately and more strictly
// by app/api/project/*, which re-checks a company's own PIN on every call
// and never touches this endpoint at all.
const KEY_PIN_SCOPE = {
  vendors: "process",
  settings: "company",
};

async function fetchRow(supabase, key) {
  const { data, error } = await supabase
    .from("po_workspace")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value;
}

function realPinForScope(settingsValue, scope) {
  const pin = scope === "process" ? settingsValue?.processPin : settingsValue?.companyPin;
  return typeof pin === "string" && pin.length ? pin : DEFAULT_PIN;
}

// Strip secrets from anything sent to the browser -- both admin PINs from
// "settings", and every company's project-access PIN from "companies"
// (replaced with a hasAccessPin boolean so the UI can show a status
// without ever re-displaying the digits).
function sanitizeForClient(key, value) {
  if (key === "settings" && value && typeof value === "object") {
    const { processPin, companyPin, ...rest } = value;
    return rest;
  }
  if (key === "companies" && Array.isArray(value)) {
    return value.map(({ accessPin, ...rest }) => ({ ...rest, hasAccessPin: !!(accessPin && accessPin.trim()) }));
  }
  return value;
}

export async function GET(request) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing ?key=" }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const value = await fetchRow(supabase, key);
    return NextResponse.json({ value: value !== undefined ? sanitizeForClient(key, value) : null });
  } catch (err) {
    console.error("GET /api/kv failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { key, value, pin } = body || {};
  if (!key || value === undefined) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const scope = KEY_PIN_SCOPE[key];

    let existing = null;
    if (scope || key === "settings" || key === "companies") {
      existing = await fetchRow(supabase, key);
    }

    if (scope) {
      const settingsValue = key === "settings" ? existing : await fetchRow(supabase, "settings");
      const realPin = realPinForScope(settingsValue, scope);
      if (typeof pin !== "string" || pin !== realPin) {
        return NextResponse.json({ error: "Invalid admin PIN" }, { status: 401 });
      }
    }

    let toStore = value;

    // "settings" holds both PINs plus terms/quickItems/authorities, but the
    // client never sees the PINs (sanitized on GET), so a client save would
    // otherwise omit them entirely and blow them away. Merge server-side.
    if (key === "settings") {
      toStore = { ...(existing || {}), ...value };
    }

    // "companies" holds each company's accessPin, which the client also
    // never sees (sanitized on GET, replaced with hasAccessPin). Merge
    // each incoming company by id onto its stored counterpart so editing
    // one company (or setting its PIN) can't blank out another company's
    // PIN, and so editing unrelated fields doesn't blank out its own PIN.
    if (key === "companies" && Array.isArray(value)) {
      const existingList = Array.isArray(existing) ? existing : [];
      const byId = Object.fromEntries(existingList.map((c) => [c.id, c]));
      toStore = value.map((incoming) => {
        const { hasAccessPin, ...clean } = incoming; // never persist the derived display-only flag
        return { ...(byId[clean.id] || {}), ...clean };
      });
    }

    const { error } = await supabase
      .from("po_workspace")
      .upsert({ key, value: toStore }, { onConflict: "key" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/kv failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
