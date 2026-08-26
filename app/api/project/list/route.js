import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { verifyCompanyAccess, getRequests, getSettingsValue, sanitizeRequestForProject } from "../../../../lib/projectData";

// Re-verifies the PIN against THIS companyId on every call (not just at
// login), then returns only that company's requests, sanitized, plus the
// bits of settings a request form needs (quick-add items) -- never the
// vendor list, never other companies, never pricing.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { companyId, pin } = body || {};
  if (!companyId || !pin) {
    return NextResponse.json({ error: "Missing companyId or pin" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const company = await verifyCompanyAccess(supabase, companyId, pin);
    if (!company) return NextResponse.json({ error: "Invalid access" }, { status: 401 });

    const [allRequests, settingsValue] = await Promise.all([
      getRequests(supabase),
      getSettingsValue(supabase),
    ]);
    const requests = allRequests.filter((r) => r.companyId === companyId).map(sanitizeRequestForProject);

    return NextResponse.json({
      ok: true,
      company: {
        id: company.id,
        name: company.name,
        siteAddress: company.siteAddress || "",
        siteContactPerson: company.siteContactPerson || "",
        siteContactMobile: company.siteContactMobile || "",
      },
      requests,
      quickItems: Array.isArray(settingsValue.quickItems) ? settingsValue.quickItems : [],
    });
  } catch (err) {
    console.error("project list failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
