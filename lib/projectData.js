// Shared helpers for the project/company-scoped API routes
// (app/api/project/*). Kept separate from the general-purpose
// app/api/kv/route.js because project routes need row-level filtering
// (only this company's requests) and field-level sanitizing (no pricing,
// no vendor bank details) -- a plain key/value GET can't do either safely.

export async function getCompanies(supabase) {
  const { data, error } = await supabase
    .from("po_workspace")
    .select("value")
    .eq("key", "companies")
    .maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? data.value : [];
}

export async function getRequests(supabase) {
  const { data, error } = await supabase
    .from("po_workspace")
    .select("value")
    .eq("key", "requests")
    .maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? data.value : [];
}

export async function saveRequests(supabase, requests) {
  const { error } = await supabase
    .from("po_workspace")
    .upsert({ key: "requests", value: requests }, { onConflict: "key" });
  if (error) throw error;
}

export async function getSettingsValue(supabase) {
  const { data, error } = await supabase
    .from("po_workspace")
    .select("value")
    .eq("key", "settings")
    .maybeSingle();
  if (error) throw error;
  return data?.value || {};
}

// Returns the full company record if `pin` matches that company's
// accessPin, otherwise null. A blank/unset accessPin never matches
// anything (so a company admin hasn't configured yet simply can't be
// logged into, rather than accidentally matching an empty PIN).
export async function verifyCompanyAccess(supabase, companyId, pin) {
  if (!companyId || !pin) return null;
  const companies = await getCompanies(supabase);
  const company = companies.find((c) => c.id === companyId);
  if (!company) return null;
  const accessPin = typeof company.accessPin === "string" ? company.accessPin.trim() : "";
  if (!accessPin || accessPin !== pin) return null;
  return company;
}

// What a project/company dashboard is allowed to see for one of its own
// requests: never rate, gstPercent, computed amounts, vendor, transport
// cost, or admin notes -- only what's needed to track status.
export function sanitizeRequestForProject(r) {
  return {
    id: r.id,
    createdAt: r.createdAt,
    requestedBy: r.requestedBy,
    companyId: r.companyId,
    category: r.category,
    poNo: r.status === "pending" ? "" : r.poNo,
    poDate: r.status === "pending" ? "" : r.poDate,
    requestDate: r.requestDate,
    siteAddress: r.siteAddress,
    siteContactPerson: r.siteContactPerson,
    siteContactMobile: r.siteContactMobile,
    items: (r.items || []).map((it) => ({ id: it.id, description: it.description, qty: it.qty, unit: it.unit })),
    status: r.status,
    materialReceivedBy: r.materialReceivedBy,
    materialReceivedAt: r.materialReceivedAt,
  };
}
