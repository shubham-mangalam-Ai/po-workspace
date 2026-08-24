import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const DEFAULT_PIN = "2026";
const PIN_PROTECTED_KEYS = new Set(["vendors", "settings"]);

async function fetchRealAdminPin(supabase) {
  const { data, error } = await supabase
    .from("po_workspace")
    .select("value")
    .eq("key", "settings")
    .maybeSingle();
  if (error) throw error;
  const pin = data?.value?.adminPin;
  return typeof pin === "string" && pin.length ? pin : DEFAULT_PIN;
}

function sanitizeForClient(key, value) {
  if (key === "settings" && value && typeof value === "object") {
    const { adminPin, ...rest } = value;
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
    if (PIN_PROTECTED_KEYS.has(key)) {
      const realPin = await fetchRealAdminPin(supabase);
      if (typeof pin !== "string" || pin !== realPin) {
        return NextResponse.json({ error: "Invalid admin PIN" }, { status: 401 });
      }
    }
    const { error } = await supabase
      .from("po_workspace")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/kv failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
