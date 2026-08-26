import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { verifyCompanyAccess, getRequests, saveRequests, sanitizeRequestForProject } from "../../../../lib/projectData";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// The only three things a project/company session is allowed to do:
// raise a new request for ITSELF, cancel its OWN still-pending request,
// or confirm receipt on its OWN generated PO. Every branch re-verifies the
// PIN against companyId and re-checks that the target request actually
// belongs to that company before touching anything.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { companyId, pin, action } = body || {};
  if (!companyId || !pin || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const company = await verifyCompanyAccess(supabase, companyId, pin);
    if (!company) return NextResponse.json({ error: "Invalid access" }, { status: 401 });

    const allRequests = await getRequests(supabase);

    if (action === "submit") {
      const { requestedBy, category, items, siteAddress, siteContactPerson, siteContactMobile } = body;
      if (!requestedBy || !String(requestedBy).trim()) {
        return NextResponse.json({ error: "Enter your name" }, { status: 400 });
      }
      const cleanItems = (Array.isArray(items) ? items : [])
        .filter((it) => it && String(it.description || "").trim())
        .map((it) => ({
          id: uid(),
          description: String(it.description).trim(),
          qty: it.qty === "" || it.qty === undefined ? 1 : it.qty,
          unit: it.unit || "pkt",
          rate: "",
          gstPercent: 18,
        }));
      if (!cleanItems.length) {
        return NextResponse.json({ error: "Add at least one material line" }, { status: 400 });
      }

      const newReq = {
        id: uid(),
        createdAt: Date.now(),
        requestedBy: String(requestedBy).trim(),
        companyId: company.id, // always the authenticated company -- ignores anything the client might send
        vendorId: "", // vendor is chosen by admin while pricing, not by the requester
        category: category || "",
        poNo: "",
        requestDate: todayStr(),
        poDate: "",
        siteAddress: siteAddress || company.siteAddress || "",
        siteContactPerson: siteContactPerson || company.siteContactPerson || "",
        siteContactMobile: siteContactMobile || company.siteContactMobile || "",
        items: cleanItems,
        transportNote: "Including",
        additionalTerms: "",
        status: "pending",
        pricedBy: "",
        generatedAt: null,
        materialReceivedBy: "",
        materialReceivedAt: null,
      };

      await saveRequests(supabase, [newReq, ...allRequests]);
      return NextResponse.json({ ok: true, request: sanitizeRequestForProject(newReq) });
    }

    if (action === "cancel") {
      const { requestId } = body;
      const target = allRequests.find((r) => r.id === requestId);
      if (!target || target.companyId !== company.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (target.status !== "pending") {
        return NextResponse.json({ error: "Only a still-pending request can be cancelled" }, { status: 400 });
      }
      await saveRequests(supabase, allRequests.filter((r) => r.id !== requestId));
      return NextResponse.json({ ok: true });
    }

    if (action === "markReceived") {
      const { requestId, byName } = body;
      if (!byName || !String(byName).trim()) {
        return NextResponse.json({ error: "Enter your name" }, { status: 400 });
      }
      const target = allRequests.find((r) => r.id === requestId);
      if (!target || target.companyId !== company.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (target.status !== "generated") {
        return NextResponse.json({ error: "This request isn't ready to confirm yet" }, { status: 400 });
      }
      const next = allRequests.map((r) =>
        r.id === requestId
          ? { ...r, status: "received", materialReceivedBy: String(byName).trim(), materialReceivedAt: Date.now() }
          : r
      );
      await saveRequests(supabase, next);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("project action failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
