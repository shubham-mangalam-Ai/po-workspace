import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getCompanies } from "../../../../lib/projectData";

// Checks a PIN against every company's accessPin and, on a match, returns
// only that company's id/name -- never the list of companies, never any
// other company's data, never the PIN itself.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  if (!pin) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const companies = await getCompanies(supabase);
    const match = companies.find(
      (c) => typeof c.accessPin === "string" && c.accessPin.trim().length > 0 && c.accessPin.trim() === pin
    );
    if (!match) return NextResponse.json({ ok: false });
    return NextResponse.json({ ok: true, companyId: match.id, companyName: match.name });
  } catch (err) {
    console.error("project verify-pin failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
