import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const DEFAULT_PIN = "2026";

// Two separate admin areas, two separate PINs:
//  - "process"  -> Process POs tab (pricing/generating/deleting requests) AND Vendors tab
//  - "company"  -> Companies tab (company list, standard terms, quick-add
//                  items, approval authorities, and both PINs themselves)
// "requests" and "companies" stay unprotected -- see README for why.
const KEY_PIN_SCOPE = {
  vendors: "process",
  settings: "company",
};

async function fetchSettingsValue(supabase) {
  const { data, error } = await supabase
    .from("po_workspace")
    .select("value")
    .eq("key", "settings")
    .maybeSingle();
  if (error) throw error;
  return data?.value || {};
}

function realPinForScope(settingsValue, scope) {
  const pin = scope === "process" ? settingsValue.processPin : settingsValue.companyPin;
  return typeof pin === "string" && pin.length ? pin : DEFAULT_PIN;
}

// Strip both PINs from anything sent to the browser, for every caller --
// including an already-unlocked admin's own screen. The UI never needs to
// display the current PIN back, only accept a new one to set.
function sanitizeForClient(key, value) {
  if (key === "settings" && value && typeof value === "object") {
    const { processPin, companyPin, ...rest } = value;
    return rest;
  }
  return value;
}

export async function GET(request) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing ?key=" }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("po_workspace")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    const value = data ? sanitizeForClient(key, data.value) : null;
    return NextResponse.json({ value });
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

    let settingsValue = null;
    if (scope) {
      settingsValue = await fetchSettingsValue(supabase);
      const realPin = realPinForScope(settingsValue, scope);
      if (typeof pin !== "string" || pin !== realPin) {
        return NextResponse.json({ error: "Invalid admin PIN" }, { status: 401 });
      }
    }

    // "settings" holds both PINs plus terms/quickItems/authorities, but the
    // client never sees the PINs (sanitized on GET), so a client save would
    // otherwise omit them entirely and blow them away. Merge server-side
    // instead of overwriting, so fields the client doesn't know about
    // (the PINs) survive any settings save.
    let toStore = value;
    if (key === "settings") {
      if (!settingsValue) settingsValue = await fetchSettingsValue(supabase);
      toStore = { ...settingsValue, ...value };
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
