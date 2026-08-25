import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const DEFAULT_PIN = "2026";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pin = body?.pin;
  const scope = body?.scope; // "process" | "company"
  if (typeof pin !== "string" || !pin.length) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (scope !== "process" && scope !== "company") {
    return NextResponse.json({ error: "Missing/invalid scope" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("po_workspace")
      .select("value")
      .eq("key", "settings")
      .maybeSingle();
    if (error) throw error;

    const settingsValue = data?.value || {};
    const realPin = scope === "process" ? settingsValue.processPin : settingsValue.companyPin;
    const expected = typeof realPin === "string" && realPin.length ? realPin : DEFAULT_PIN;

    return NextResponse.json({ ok: pin === expected });
  } catch (err) {
    console.error("verify-pin failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
