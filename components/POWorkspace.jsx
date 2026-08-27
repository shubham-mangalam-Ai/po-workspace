"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Plus, Trash2, Printer, X, Check, ClipboardList, Stamp, Building2,
  ArrowLeft, Loader2, ChevronRight, Clock, CheckCircle2,
  AlertCircle, Lock, Unlock, PackageCheck, FileSpreadsheet, Truck, Pencil,
  RefreshCw, BarChart3,
} from "lucide-react";

const POLL_INTERVAL_MS = 8000;

const INK = "#1B2A4A";
const INK_SOFT = "#4A567A";
const PAPER = "#EFEDE3";
const PAPER_CARD = "#F8F6EF";
const RULE = "#C6BFA8";
const STAMP_RED = "#A63D2F";
const BRASS = "#8C6A2F";
const GREEN = "#3F6B4F";
const TEAL = "#1C6E7A";

const F_DISPLAY = "'Special Elite', 'Courier New', monospace";
const F_MONO = "'IBM Plex Mono', monospace";
const F_BODY = "'Inter', system-ui, sans-serif";

const UNIT_OPTIONS = ["pkt", "nos", "pcs", "box", "set", "kg", "ltr", "mtr", "roll", "other"];

const MATERIAL_CATEGORIES = ["Stationery", "Housekeeping", "Pantry", "Promotional Materials", "Uniform", "T-Shirts", "Induction Kit"];
const OFFICE_OPTIONS = ["Site Office", "Sales Office", "Head Office"];

function deriveCategoryLabel(materialCategory, office) {
  if (materialCategory && office) return `${materialCategory} — ${office}`;
  return materialCategory || office || "";
}
// Parses a "DD/MM/YYYY" string (how dates are stored throughout this app)
// into a real Date, for date-range filtering in Reports. Returns null for
// anything unparseable so callers can just skip it.
function parseDMY(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

const DEFAULT_QUICK_ITEMS = [
  "Stage Passing Register", "Curing Register", "Cube Register", "Plumbing Register",
  "Drawing Register", "Delay Register", "On Site Decision Book", "Visitor Register",
  "Attendance Register", "Site Diary",
];

const DEFAULT_AUTHORITIES = ["Admin Executive", "Checked By HR - Admin HOD", "Authorized Approved By CMD"];

const DEFAULT_VENDORS = [
  {
    id: "kamal", name: "Kamal Printers",
    address: "Sr.No.9, Kamal Kunj, Kharadi Road, Chandan Nagar, Pune-411030",
    contactPerson: "Mr. Kamal Gupta", contactMobile: "9822616678", gst: "27AIHPG1885G1Z6",
    bankName: "", accountNo: "", ifsc: "", branch: "",
  },
];

const OFFICE_ADDRESS = "Mangalam Landmarks 1st Floor, Life Ville, Above Reymond Shop, PK Chowk, Pimple Saudagar, Pune 411027";

const DEFAULT_COMPANIES = [
  {
    id: "ppa", name: "Preetam Prakash Associates", poPrefix: "ML", gst: "27AAJFP8962F1ZR",
    registeredAddress: OFFICE_ADDRESS,
    siteAddress: "MVF5+3VR, Moshi Gaon, Moshi, Pimpri Chinchwad, Maharashtra 411070",
    siteContactPerson: "Ganesh Panchal", siteContactMobile: "6363271910",
    lastSeq: 322,
  },
  {
    id: "urway", name: "Urway Infra LLP", poPrefix: "ML", gst: "27AAIFU1759J1ZP",
    registeredAddress: OFFICE_ADDRESS,
    siteAddress: "Thathawade S.No. 75/1/2, Jivan Nagar, Chinchwad Police Station, Sharayu Toyota Service Centre & Spare Parts, Milshi Pune 411033",
    siteContactPerson: "Ganesh Panchal", siteContactMobile: "6363271910",
    lastSeq: 320,
  },
  {
    id: "sdm", name: "Shree Datta Mangalam", poPrefix: "ML", gst: "27AEWFS4919Q1ZR",
    registeredAddress: OFFICE_ADDRESS,
    siteAddress: "Mangalam Miraya, Gat no.286, Near Bharat Mata Chowk, Borhadewadi, Moshi Dehu Road, Pune 412105",
    siteContactPerson: "Ganesh Panchal", siteContactMobile: "6363271910",
    lastSeq: 321,
  },
];

const DEFAULT_TERMS = [
  "GST 18% as mentioned above. Transport - As mentioned above. Loading Incl./unloading by us.",
  "Please quote purchase order number in all challans/invoices.",
  "Payment - Advance.",
  "Delivery - Immediate.",
  "Material will be accepted between working hours 10 a.m. to 5 p.m. only. Our weekly off is Sunday.",
  "All goods accepted are subject to final approval of the company's work inspection after confirming quality, quantity, and specifications.",
  "The original invoice must be submitted to the company's head office Pune, purchase order no., date and supplier's delivery challan no. and GST No. must appear on all invoices submitted for payment.",
  "Material should accompany test certificates/lab report/first piece sample/pre-dispatch inspection report (PDIR)/Material Safety Data Sheet (MSDS) as applicable along with challan.",
  "Material must accompany warranty/guarantee card duly sealed and signed as applicable.",
];

const DEFAULT_PIN = "2026";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function rupee(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return "\u20B9" + v.toLocaleString("en-IN");
}
// jsPDF's built-in fonts don't include the ₹ glyph (Unicode U+20B9) --
// standard-14 PDF fonts only cover WinAnsi/Latin-1. Depending on the
// viewer (especially Word's "convert PDF to document" feature), the
// missing glyph gets silently substituted with a wrong character, which
// is why a generated PDF can show something like "¹1,234" instead of
// "₹1,234" even though the underlying number is correct. Use this plain
// "Rs." version anywhere text actually gets drawn into the PDF via
// doc.text()/autoTable -- never inside the on-screen React UI, which
// renders ₹ correctly in every browser.
function rupeePdf(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return "Rs. " + v.toLocaleString("en-IN");
}
function blankItem() {
  return { id: uid(), description: "", qty: 1, unit: "pkt", rate: "", gstPercent: 18 };
}
function newRequest(companyId, vendorId, company) {
  return {
    id: uid(),
    createdAt: Date.now(),
    requestedBy: "",
    companyId,
    vendorId,
    category: "",
    materialCategory: "",
    office: "",
    poNo: "",
    requestDate: todayStr(),
    poDate: "",
    siteAddress: company ? company.siteAddress || "" : "",
    siteContactPerson: company ? company.siteContactPerson || "" : "",
    siteContactMobile: company ? company.siteContactMobile || "" : "",
    items: [blankItem()],
    transportNote: "Including",
    additionalTerms: "",
    status: "pending",
    pricedBy: "",
    generatedAt: null,
    materialReceivedBy: "",
    materialReceivedAt: null,
  };
}
function blankVendor() {
  return { id: uid(), name: "", address: "", contactPerson: "", contactMobile: "", gst: "", bankName: "", accountNo: "", ifsc: "", branch: "" };
}
function blankCompany() {
  return { id: uid(), name: "", poPrefix: "ML", gst: "", registeredAddress: "", siteAddress: "", siteContactPerson: "", siteContactMobile: "", lastSeq: 300, accessPin: "" };
}

async function kvGet(key) {
  try {
    const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (!res.ok) return { value: null, ok: false };
    const data = await res.json();
    return { value: data.value ?? null, ok: true };
  } catch (e) {
    return { value: null, ok: false };
  }
}
async function kvSet(key, value, pin) {
  try {
    const res = await fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, pin }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `Save failed (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Network error while saving." };
  }
}
async function verifyPinOnServer(pin, scope) {
  try {
    const res = await fetch("/api/admin/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, scope }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  } catch (e) {
    return false;
  }
}

// Fetches all four documents in parallel and normalizes them against the
// defaults. Used both for the initial load and for background refreshes,
// so every client (and every open tab/device) converges on the same data
// instead of only seeing what it itself last wrote.
async function fetchAllData() {
  const [cRes, vRes, rRes, sRes] = await Promise.all([
    kvGet("companies"), kvGet("vendors"), kvGet("requests"), kvGet("settings"),
  ]);
  const c = cRes.value, v = vRes.value, r = rRes.value, s = sRes.value;
  return {
    companies: c && c.length ? c : DEFAULT_COMPANIES,
    vendors: v && v.length ? v : DEFAULT_VENDORS,
    requests: r || [],
    settings: {
      terms: s && s.terms && s.terms.length ? s.terms : DEFAULT_TERMS,
      quickItems: s && s.quickItems && s.quickItems.length ? s.quickItems : DEFAULT_QUICK_ITEMS,
      authorities: s && s.authorities && s.authorities.length ? s.authorities : DEFAULT_AUTHORITIES,
    },
  };
}

function itemAmount(it) {
  const rate = Number(it.rate) || 0;
  const qty = Number(it.qty) || 0;
  const gstAmt = (rate * qty * (Number(it.gstPercent) || 0)) / 100;
  return { gstAmt, amount: rate * qty + gstAmt };
}
function computeTotals(items, transportNote) {
  let taxable = 0, gst = 0;
  items.forEach((it) => {
    const rate = Number(it.rate) || 0;
    const qty = Number(it.qty) || 0;
    const { gstAmt } = itemAmount(it);
    taxable += rate * qty;
    gst += gstAmt;
  });
  const sgst = gst / 2;
  const cgst = gst / 2;
  const transportNum = Number(transportNote);
  const transportExtra = transportNote !== "" && !isNaN(transportNum) ? transportNum : 0;
  const grand = taxable + gst + transportExtra;
  return { taxable, gst, sgst, cgst, transportExtra, grand };
}
function statusBadge(req) {
  if (req.status === "received") return { text: `Received \u2713`, color: TEAL };
  if (req.status === "generated") return { text: req.poNo || "Generated", color: GREEN };
  return { text: "Pending pricing", color: BRASS };
}
function resolveVendor(req, vendors) {
  const found = vendors.find((v) => v.id === req.vendorId);
  if (found) return found;
  if (req.supplier) return { ...blankVendor(), ...req.supplier };
  return vendors[0] || blankVendor();
}

function Stamp3({ text, color }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
      border: `2px solid ${color}`, borderRadius: 3, color,
      fontFamily: F_MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase", transform: "rotate(-2deg)", background: `${color}14`, whiteSpace: "nowrap",
    }}>
      {text}
    </div>
  );
}

function LabeledInput({ label, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <input {...props} style={{
        fontFamily: F_BODY, fontSize: 14, padding: "8px 10px", border: `1px solid ${RULE}`,
        borderRadius: 6, background: "#fff", color: INK, outline: "none", ...(props.style || {}),
      }} />
    </label>
  );
}
function LabeledSelect({ label, options, placeholder, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <select {...props} style={{
        fontFamily: F_BODY, fontSize: 14, padding: "8px 10px", border: `1px solid ${RULE}`,
        borderRadius: 6, background: "#fff", color: INK, outline: "none", ...(props.style || {}),
      }}>
        <option value="">{placeholder || "Select..."}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function LabeledTextarea({ label, hint, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <textarea {...props} style={{
        fontFamily: F_BODY, fontSize: 13, padding: "8px 10px", border: `1px solid ${RULE}`,
        borderRadius: 6, background: "#fff", color: INK, outline: "none", resize: "vertical", ...(props.style || {}),
      }} />
      {hint && <span style={{ fontSize: 11, color: INK_SOFT }}>{hint}</span>}
    </label>
  );
}

function Btn({ children, variant = "default", ...props }) {
  const styles = {
    default: { background: "#fff", color: INK, border: `1px solid ${RULE}` },
    primary: { background: INK, color: "#fff", border: `1px solid ${INK}` },
    stamp: { background: STAMP_RED, color: "#fff", border: `1px solid ${STAMP_RED}` },
    teal: { background: TEAL, color: "#fff", border: `1px solid ${TEAL}` },
    ghost: { background: "transparent", color: INK_SOFT, border: "1px solid transparent" },
  };
  return (
    <button {...props} style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F_BODY, fontSize: 13,
      fontWeight: 600, padding: "8px 14px", borderRadius: 6, cursor: "pointer",
      ...styles[variant], ...(props.style || {}),
    }}>
      {children}
    </button>
  );
}

function IconBtn({ children, ...props }) {
  return (
    <button {...props} style={{ background: "transparent", border: `1px solid ${RULE}`, borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: INK_SOFT, display: "flex", alignItems: "center", ...(props.style || {}) }}>
      {children}
    </button>
  );
}

function ConfirmDelete({ onConfirm, label = "Delete" }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <IconBtn onClick={(e) => { e.stopPropagation(); setConfirming(true); }} title={label} style={{ color: "#9B2C2C" }}><Trash2 size={14} /></IconBtn>;
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <span style={{ fontSize: 11, color: "#9B2C2C" }}>Delete?</span>
      <Btn variant="stamp" style={{ padding: "4px 8px", fontSize: 11 }} onClick={onConfirm}>Yes</Btn>
      <Btn variant="ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setConfirming(false)}>No</Btn>
    </span>
  );
}

// The original full-access app: everyone entering here already proved they
// know one of the two admin PINs at the entry gate (see POWorkspace below).
// Raise Request / Track are unrestricted (all companies) because this is
// the admin's own workspace, not the per-company one.
function AdminApp({ initialScope, initialPinValue, onExit }) {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState(DEFAULT_COMPANIES);
  const [vendors, setVendors] = useState(DEFAULT_VENDORS);
  const [requests, setRequests] = useState([]);
  const [settings, setSettings] = useState({ terms: DEFAULT_TERMS, quickItems: DEFAULT_QUICK_ITEMS, authorities: DEFAULT_AUTHORITIES });
  const [tab, setTab] = useState("request");
  const [draft, setDraft] = useState(() => newRequest(DEFAULT_COMPANIES[0].id, DEFAULT_VENDORS[0].id, DEFAULT_COMPANIES[0]));
  const [selectedId, setSelectedId] = useState(null);
  const [printId, setPrintId] = useState(null);
  const [toast, setToast] = useState("");
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: "", registeredAddress: "", gst: "", poPrefix: "ML" });
  // Two separate admin areas with two separate PINs:
  //  - "process" unlocks Process POs (pricing/generating/deleting requests) + Vendors
  //  - "company" unlocks Companies (company list, terms, quick-add items,
  //    approval authorities, and both PINs themselves)
  // Seeded from whichever PIN was used to pass the entry gate, so that tab
  // is already open; the other admin area still needs its own PIN.
  const [processUnlocked, setProcessUnlocked] = useState(initialScope === "process");
  const [processPinValue, setProcessPinValue] = useState(initialScope === "process" ? initialPinValue : "");
  const [companyUnlocked, setCompanyUnlocked] = useState(initialScope === "company");
  const [companyPinValue, setCompanyPinValue] = useState(initialScope === "company" ? initialPinValue : "");
  const [pinInput, setPinInput] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Initial load: also seeds the draft form, which we deliberately do NOT
  // touch again on later refreshes (that would wipe out an in-progress
  // request someone is typing).
  useEffect(() => {
    (async () => {
      const data = await fetchAllData();
      setCompanies(data.companies);
      setVendors(data.vendors);
      setRequests(data.requests);
      setSettings(data.settings);
      setDraft(newRequest(data.companies[0].id, data.vendors[0].id, data.companies[0]));
      setLoading(false);
    })();
  }, []);

  // Background polling so everyone sees everyone else's changes without a
  // manual page reload -- e.g. admin prices a request while a site
  // supervisor has the Track tab open, or two admins both have the queue
  // open at once. Paused while the tab is hidden, and never touches the
  // in-progress draft, selected tab, or admin-unlocked state.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    async function poll() {
      if (typeof document !== "undefined" && document.hidden) return;
      const data = await fetchAllData();
      if (cancelled) return;
      setCompanies(data.companies);
      setVendors(data.vendors);
      setRequests(data.requests);
      setSettings(data.settings);
    }
    const id = setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [loading]);

  async function refreshNow() {
    setManualRefreshing(true);
    const data = await fetchAllData();
    setCompanies(data.companies);
    setVendors(data.vendors);
    setRequests(data.requests);
    setSettings(data.settings);
    setManualRefreshing(false);
    flash("Refreshed.");
  }

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function persistRequests(next) {
    setRequests(next);
    const res = await kvSet("requests", next);
    if (!res.ok) flash(res.error || "Could not save — check connection and retry.");
    return res.ok;
  }
  async function persistCompanies(next) {
    setCompanies(next);
    const res = await kvSet("companies", next);
    if (!res.ok) flash(res.error || "Could not save — check connection and retry.");
    return res.ok;
  }
  async function persistVendors(next) {
    setVendors(next);
    const res = await kvSet("vendors", next, processPinValue);
    if (!res.ok) flash(res.error || "Could not save — check connection and retry.");
    return res.ok;
  }
  // "next" here is a PARTIAL update (e.g. just { terms } or just { companyPin }).
  // The server merges it into the stored settings doc, and we mirror that
  // merge locally so we don't clobber fields (like quickItems/authorities)
  // that weren't part of this particular save.
  async function persistSettings(partial) {
    setSettings((prev) => ({ ...prev, ...partial }));
    const res = await kvSet("settings", partial, companyPinValue);
    if (!res.ok) flash(res.error || "Could not save — check connection and retry.");
    return res.ok;
  }

  async function tryUnlock(scope) {
    if (!pinInput.trim() || unlocking) return;
    setUnlocking(true);
    const ok = await verifyPinOnServer(pinInput.trim(), scope);
    setUnlocking(false);
    if (ok) {
      if (scope === "process") {
        setProcessPinValue(pinInput.trim());
        setProcessUnlocked(true);
      } else {
        setCompanyPinValue(pinInput.trim());
        setCompanyUnlocked(true);
      }
      setPinInput("");
      flash("Admin unlocked for this session.");
    } else {
      flash("Wrong PIN.");
    }
  }

  const pending = useMemo(() => requests.filter((r) => r.status === "pending").sort((a, b) => b.createdAt - a.createdAt), [requests]);
  const issued = useMemo(() => requests.filter((r) => r.status === "generated" || r.status === "received").sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0)), [requests]);

  function companyOf(id) {
    return companies.find((c) => c.id === id) || companies[0];
  }

  function updateDraftItem(itemId, patch) {
    setDraft((d) => ({ ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }));
  }
  function addDraftItem(desc = "") {
    setDraft((d) => ({ ...d, items: [...d.items, { ...blankItem(), description: desc }] }));
  }
  function removeDraftItem(itemId) {
    setDraft((d) => ({ ...d, items: d.items.length > 1 ? d.items.filter((it) => it.id !== itemId) : d.items }));
  }

  async function submitRequest() {
    if (!draft.requestedBy.trim()) return flash("Enter your name so admin knows who raised this.");
    if (!draft.siteAddress.trim()) return flash("Enter the delivery / site address.");
    const items = draft.items.filter((it) => it.description.trim());
    if (!items.length) return flash("Add at least one material line.");
    const clean = { ...draft, items, category: deriveCategoryLabel(draft.materialCategory, draft.office) };
    const ok = await persistRequests([clean, ...requests]);
    if (!ok) return;
    flash("Request sent to PO admin.");
    setDraft(newRequest(draft.companyId, draft.vendorId, companyOf(draft.companyId)));
  }

  async function addCompany() {
    if (!newCompany.name.trim()) return flash("Company name required.");
    const c = { ...blankCompany(), ...newCompany, id: uid() };
    await persistCompanies([...companies, c]);
    setNewCompany({ name: "", registeredAddress: "", gst: "", poPrefix: "ML" });
    setNewCompanyOpen(false);
    flash("Company added.");
  }

  async function updateRequest(id, patch) {
    await persistRequests(requests.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function deleteRequest(id) {
    await persistRequests(requests.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
    flash("PO deleted.");
  }

  async function generatePO(reqId) {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;
    const missing = req.items.some((it) => it.rate === "" || it.rate === null || isNaN(Number(it.rate)));
    if (missing) return flash("Enter a rate for every item before generating.");
    if (!req.poNo.trim()) return flash("Enter a PO number.");
    const company = companyOf(req.companyId);
    const nextSeq = (company.lastSeq || 300) + 1;
    await persistCompanies(companies.map((c) => (c.id === company.id ? { ...c, lastSeq: nextSeq } : c)));
    await updateRequest(reqId, { status: "generated", poDate: req.poDate || todayStr(), generatedAt: Date.now() });
    flash("PO generated.");
    setSelectedId(null);
    setPrintId(reqId);
  }

  async function markReceived(reqId, byName) {
    await updateRequest(reqId, { status: "received", materialReceivedBy: byName, materialReceivedAt: Date.now() });
    flash("Admin has been informed material was received.");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: F_BODY, color: INK_SOFT }}>
        <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} />
        Opening the register...
      </div>
    );
  }

  const printReq = printId ? requests.find((r) => r.id === printId) : null;
  const selectedReq = selectedId ? requests.find((r) => r.id === selectedId) : null;

  return (
    <div style={{ fontFamily: F_BODY, background: PAPER, minHeight: "100vh", color: INK }}>
      <div style={{ background: INK, color: "#F3EFE3", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Stamp size={22} />
          <div>
            <div style={{ fontFamily: F_DISPLAY, fontSize: 19, letterSpacing: "0.02em" }}>PO Register</div>
            <div style={{ fontSize: 11, color: "#B9C2D6", letterSpacing: "0.04em" }}>
              Admin workspace {(processUnlocked || companyUnlocked) ? "— extra areas unlocked" : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.08)", padding: 4, borderRadius: 8, flexWrap: "wrap" }}>
            {[
              { id: "request", label: "Raise request", icon: ClipboardList },
              { id: "track", label: "Track / Received", icon: PackageCheck },
              { id: "admin", label: "Process POs", icon: Stamp, gated: true },
              { id: "reports", label: "Reports", icon: BarChart3, gated: true },
              { id: "vendors", label: "Vendors", icon: Truck, gated: true },
              { id: "companies", label: "Companies", icon: Building2, gated: true },
            ].map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "7px 12px",
                borderRadius: 6, cursor: "pointer", border: "none",
                background: tab === t.id ? "#F3EFE3" : "transparent",
                color: tab === t.id ? INK : "#DAD3C0",
              }}>
                <t.icon size={15} />
                {t.label}
                {t.gated && <Lock size={11} style={{ opacity: 0.7 }} />}
                {t.id === "admin" && pending.length > 0 && (
                  <span style={{ background: STAMP_RED, color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", marginLeft: 2 }}>{pending.length}</span>
                )}
              </button>
            ))}
          </div>
          <button onClick={refreshNow} disabled={manualRefreshing} title="Refresh data" style={{ background: "transparent", border: "none", color: "#DAD3C0", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <RefreshCw size={14} className={manualRefreshing ? "animate-spin" : ""} /> {manualRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          {(processUnlocked || companyUnlocked) && (
            <button onClick={() => { setProcessUnlocked(false); setProcessPinValue(""); setCompanyUnlocked(false); setCompanyPinValue(""); }} title="Lock admin" style={{ background: "transparent", border: "none", color: "#DAD3C0", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              <Unlock size={14} /> Lock
            </button>
          )}
          <button onClick={onExit} title="Sign out" style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.25)`, borderRadius: 6, padding: "6px 10px", color: "#F3EFE3", cursor: "pointer", fontSize: 12 }}>
            Sign out
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ background: "#FCEBEB", color: "#9B2C2C", padding: "8px 24px", fontSize: 13, borderBottom: `1px solid ${RULE}`, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {toast}
        </div>
      )}

      <div style={{ padding: 24 }}>
        {tab === "request" && (
          <RequestTab
            companies={companies} vendors={vendors} draft={draft} setDraft={setDraft}
            updateDraftItem={updateDraftItem} addDraftItem={addDraftItem} removeDraftItem={removeDraftItem}
            submitRequest={submitRequest} quickItems={settings.quickItems}
            newCompanyOpen={newCompanyOpen} setNewCompanyOpen={setNewCompanyOpen}
            newCompany={newCompany} setNewCompany={setNewCompany} addCompany={addCompany}
            myRequests={requests}
          />
        )}

        {tab === "track" && (
          <TrackTab requests={requests} companyOf={companyOf} onMarkReceived={markReceived} onDelete={deleteRequest} />
        )}

        {tab === "admin" && !processUnlocked && (
          <AdminGate pinInput={pinInput} setPinInput={setPinInput} onUnlock={() => tryUnlock("process")} unlocking={unlocking}
            title="Process POs access" description="Enter the Process POs PIN to price requests, generate PO numbers, and manage the queue." />
        )}
        {tab === "admin" && processUnlocked && !selectedReq && (
          <AdminQueueTab pending={pending} issued={issued} companyOf={companyOf} onOpen={(id) => setSelectedId(id)} onView={(id) => setPrintId(id)} onDelete={deleteRequest} />
        )}
        {tab === "admin" && processUnlocked && selectedReq && (
          <PricingEditor
            req={selectedReq}
            company={companyOf(selectedReq.companyId)}
            vendors={vendors}
            onBack={() => setSelectedId(null)}
            onChange={(patch) => updateRequest(selectedId, patch)}
            onGenerate={() => generatePO(selectedId)}
            onDelete={() => deleteRequest(selectedId)}
            onReprint={() => setPrintId(selectedId)}
          />
        )}

        {tab === "reports" && !processUnlocked && (
          <AdminGate pinInput={pinInput} setPinInput={setPinInput} onUnlock={() => tryUnlock("process")} unlocking={unlocking}
            title="Reports access" description="Reports share the Process POs PIN, since they show pricing across every company." />
        )}
        {tab === "reports" && processUnlocked && <ReportsTab requests={requests} companies={companies} />}

        {tab === "vendors" && !processUnlocked && (
          <AdminGate pinInput={pinInput} setPinInput={setPinInput} onUnlock={() => tryUnlock("process")} unlocking={unlocking}
            title="Vendors access" description="Vendors share the Process POs PIN. Enter it to manage vendor details and bank info." />
        )}
        {tab === "vendors" && processUnlocked && <VendorsTab vendors={vendors} onSave={persistVendors} />}

        {tab === "companies" && !companyUnlocked && (
          <AdminGate pinInput={pinInput} setPinInput={setPinInput} onUnlock={() => tryUnlock("company")} unlocking={unlocking}
            title="Companies access" description="Enter the Companies PIN to manage projects, standard terms, quick-add items, approval authorities, and both admin PINs." />
        )}
        {tab === "companies" && companyUnlocked && (
          <CompaniesTab
            companies={companies} requests={requests} onSaveCompanies={persistCompanies}
            settings={settings}
            onChangeCompanyPin={async (pin) => {
              const ok = await persistSettings({ companyPin: pin });
              if (ok) setCompanyPinValue(pin);
              return ok;
            }}
            onChangeProcessPin={async (pin) => persistSettings({ processPin: pin })}
            onChangeTerms={(terms) => persistSettings({ terms })}
            onChangeQuickItems={(quickItems) => persistSettings({ quickItems })}
            onChangeAuthorities={(authorities) => persistSettings({ authorities })}
          />
        )}
      </div>

      {/* Full PO view (pricing + vendor bank details) is admin-only, opened
          from the Process POs queue. Site staff on the Track tab never get
          a way to set printId, so this never renders for them. */}
      {printReq && processUnlocked && (
        <POPrint
          req={printReq}
          company={companyOf(printReq.companyId)}
          vendor={resolveVendor(printReq, vendors)}
          terms={settings.terms && settings.terms.length ? settings.terms : DEFAULT_TERMS}
          authorities={settings.authorities && settings.authorities.length ? settings.authorities : DEFAULT_AUTHORITIES}
          onClose={() => setPrintId(null)}
        />
      )}
    </div>
  );
}

const PROJECT_SESSION_KEY = "po_project_session_v1";

async function verifyProjectPinOnServer(pin) {
  try {
    const res = await fetch("/api/project/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? { companyId: data.companyId, companyName: data.companyName } : null;
  } catch (e) {
    return null;
  }
}
async function projectList(companyId, pin) {
  try {
    const res = await fetch("/api/project/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, pin }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}
async function projectAction(companyId, pin, action, payload) {
  try {
    const res = await fetch("/api/project/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, pin, action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `Request failed (${res.status})` };
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: "Network error." };
  }
}

// Top-level entry point. Nobody sees any data -- not even a full list of
// companies -- until they've proven they know either a project's PIN
// (scoped to that one company) or an admin PIN (full access). This is
// also enforced server-side: the project routes re-check the PIN on every
// call, and AdminApp's own data fetch only ever runs after this gate
// passes, so an unauthenticated visitor's browser never even requests the
// full companies/vendors/requests documents.
export default function POWorkspace() {
  const [entryMode, setEntryMode] = useState(null); // null | "project" | "admin"
  const [checkingSession, setCheckingSession] = useState(true);
  const [projectAuth, setProjectAuth] = useState(null); // { companyId, pin, companyName }
  const [adminEntry, setAdminEntry] = useState(null); // { scope, pin }

  // Try to silently resume a project session saved in this browser tab
  // (sessionStorage -- cleared when the tab closes, unlike localStorage).
  useEffect(() => {
    (async () => {
      try {
        const raw = typeof window !== "undefined" ? sessionStorage.getItem(PROJECT_SESSION_KEY) : null;
        if (raw) {
          const saved = JSON.parse(raw);
          const result = await verifyProjectPinOnServer(saved.pin);
          if (result && result.companyId === saved.companyId) {
            setProjectAuth({ companyId: result.companyId, companyName: result.companyName, pin: saved.pin });
            setEntryMode("project");
            setCheckingSession(false);
            return;
          }
          sessionStorage.removeItem(PROJECT_SESSION_KEY);
        }
      } catch (e) {}
      setCheckingSession(false);
    })();
  }, []);

  function handleProjectLogin(auth) {
    setProjectAuth(auth);
    setEntryMode("project");
    try {
      sessionStorage.setItem(PROJECT_SESSION_KEY, JSON.stringify({ companyId: auth.companyId, pin: auth.pin }));
    } catch (e) {}
  }
  function handleAdminLogin(scope, pin) {
    setAdminEntry({ scope, pin });
    setEntryMode("admin");
  }
  function handleExit() {
    setEntryMode(null);
    setProjectAuth(null);
    setAdminEntry(null);
    try { sessionStorage.removeItem(PROJECT_SESSION_KEY); } catch (e) {}
  }

  if (checkingSession) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: F_BODY, color: INK_SOFT }}>
        <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} />
        Opening the register...
      </div>
    );
  }

  if (entryMode === "project" && projectAuth) {
    return <ProjectDashboard auth={projectAuth} onExit={handleExit} />;
  }
  if (entryMode === "admin" && adminEntry) {
    return <AdminApp initialScope={adminEntry.scope} initialPinValue={adminEntry.pin} onExit={handleExit} />;
  }
  return <GateScreen onProjectLogin={handleProjectLogin} onAdminLogin={handleAdminLogin} />;
}

function GateScreen({ onProjectLogin, onAdminLogin }) {
  const [mode, setMode] = useState(null); // null | "project" | "admin"
  const [pinInput, setPinInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function submitProject() {
    if (!pinInput.trim() || checking) return;
    setChecking(true);
    setError("");
    const result = await verifyProjectPinOnServer(pinInput.trim());
    setChecking(false);
    if (result) onProjectLogin({ ...result, pin: pinInput.trim() });
    else setError("PIN not recognized. Check with your PO admin.");
  }
  async function submitAdmin() {
    if (!pinInput.trim() || checking) return;
    setChecking(true);
    setError("");
    const processOk = await verifyPinOnServer(pinInput.trim(), "process");
    if (processOk) {
      setChecking(false);
      onAdminLogin("process", pinInput.trim());
      return;
    }
    const companyOk = await verifyPinOnServer(pinInput.trim(), "company");
    setChecking(false);
    if (companyOk) onAdminLogin("company", pinInput.trim());
    else setError("Wrong PIN.");
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: PAPER, fontFamily: F_BODY, padding: 24 }}>
      <div style={{ maxWidth: 380, width: "100%", background: PAPER_CARD, border: `1px solid ${RULE}`, borderRadius: 12, padding: 28, textAlign: "center" }}>
        <Stamp size={26} color={INK} style={{ marginBottom: 10 }} />
        <div style={{ fontFamily: F_DISPLAY, fontSize: 20, color: INK, marginBottom: 4 }}>PO Register</div>

        {mode === null && (
          <>
            <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 20 }}>Choose how you'd like to sign in.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Btn variant="stamp" onClick={() => setMode("project")} style={{ justifyContent: "center" }}><ClipboardList size={15} />I'm a project / company</Btn>
              <Btn variant="primary" onClick={() => setMode("admin")} style={{ justifyContent: "center" }}><Lock size={14} />Admin</Btn>
            </div>
          </>
        )}

        {mode === "project" && (
          <>
            <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 16 }}>Enter your project's access PIN, given to you by the PO admin.</div>
            <input type="password" inputMode="numeric" placeholder="Project PIN" value={pinInput} onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitProject()}
              style={{ width: "100%", textAlign: "center", fontFamily: F_MONO, fontSize: 16, letterSpacing: "0.2em", padding: "10px 12px", border: `1px solid ${RULE}`, borderRadius: 6, marginBottom: 12, boxSizing: "border-box" }} />
            {error && <div style={{ fontSize: 12, color: "#9B2C2C", marginBottom: 12 }}>{error}</div>}
            <Btn variant="stamp" onClick={submitProject} disabled={checking} style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}>{checking ? "Checking..." : "Continue"}</Btn>
            <Btn variant="ghost" onClick={() => { setMode(null); setPinInput(""); setError(""); }} style={{ width: "100%", justifyContent: "center" }}><ArrowLeft size={14} />Back</Btn>
          </>
        )}

        {mode === "admin" && (
          <>
            <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 16 }}>Enter either admin PIN — Process POs or Companies.</div>
            <input type="password" inputMode="numeric" placeholder="Admin PIN" value={pinInput} onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitAdmin()}
              style={{ width: "100%", textAlign: "center", fontFamily: F_MONO, fontSize: 16, letterSpacing: "0.2em", padding: "10px 12px", border: `1px solid ${RULE}`, borderRadius: 6, marginBottom: 12, boxSizing: "border-box" }} />
            {error && <div style={{ fontSize: 12, color: "#9B2C2C", marginBottom: 12 }}>{error}</div>}
            <Btn variant="primary" onClick={submitAdmin} disabled={checking} style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}>{checking ? "Checking..." : "Continue"}</Btn>
            <Btn variant="ghost" onClick={() => { setMode(null); setPinInput(""); setError(""); }} style={{ width: "100%", justifyContent: "center" }}><ArrowLeft size={14} />Back</Btn>
          </>
        )}
      </div>
    </div>
  );
}

// The scoped, per-company dashboard. Only ever talks to /api/project/*,
// which re-verifies this company's PIN on every call and only ever
// returns/accepts data for this one companyId -- there is no code path
// here that can see or touch another company's requests.
function ProjectDashboard({ auth, onExit }) {
  const { companyId, pin, companyName } = auth;
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);
  const [requests, setRequests] = useState([]);
  const [quickItems, setQuickItems] = useState(DEFAULT_QUICK_ITEMS);
  const [tab, setTab] = useState("request");
  const [toast, setToast] = useState("");
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const [requestedBy, setRequestedBy] = useState("");
  const [materialCategory, setMaterialCategory] = useState("");
  const [office, setOffice] = useState("");
  const [items, setItems] = useState([blankItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [siteAddress, setSiteAddress] = useState("");
  const [siteContactPerson, setSiteContactPerson] = useState("");
  const [siteContactMobile, setSiteContactMobile] = useState("");
  const siteFieldsSeeded = useRef(false);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function load(showSpinner) {
    if (showSpinner) setLoading(true);
    const data = await projectList(companyId, pin);
    if (data && data.ok) {
      setCompany(data.company);
      setRequests(data.requests || []);
      setQuickItems(data.quickItems && data.quickItems.length ? data.quickItems : DEFAULT_QUICK_ITEMS);
      // Seed the editable site fields from the company's defaults, but only
      // once -- later refreshes/polls must not overwrite what the person is
      // actively typing.
      if (!siteFieldsSeeded.current && data.company) {
        setSiteAddress(data.company.siteAddress || "");
        setSiteContactPerson(data.company.siteContactPerson || "");
        setSiteContactMobile(data.company.siteContactMobile || "");
        siteFieldsSeeded.current = true;
      }
    } else if (showSpinner) {
      flash("Could not load your data. Your session may have expired.");
    }
    if (showSpinner) setLoading(false);
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    async function poll() {
      if (typeof document !== "undefined" && document.hidden) return;
      const data = await projectList(companyId, pin);
      if (cancelled || !data || !data.ok) return;
      setRequests(data.requests || []);
    }
    const id = setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener("visibilitychange", poll); };
  }, [loading, companyId, pin]);

  async function refreshNow() {
    setManualRefreshing(true);
    await load(false);
    setManualRefreshing(false);
    flash("Refreshed.");
  }

  function updateItem(id, patch) {
    setItems((its) => its.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function addItem(desc = "") {
    setItems((its) => [...its, { ...blankItem(), description: desc }]);
  }
  function removeItem(id) {
    setItems((its) => (its.length > 1 ? its.filter((it) => it.id !== id) : its));
  }

  async function submitRequest() {
    if (!requestedBy.trim()) return flash("Enter your name.");
    if (!materialCategory) return flash("Select a material category.");
    if (!office) return flash("Select an office.");
    if (!siteAddress.trim()) return flash("Enter the delivery / site address.");
    const cleanItems = items.filter((it) => it.description.trim());
    if (!cleanItems.length) return flash("Add at least one material line.");
    setSubmitting(true);
    const res = await projectAction(companyId, pin, "submit", {
      requestedBy: requestedBy.trim(),
      materialCategory,
      office,
      items: cleanItems,
      siteAddress: siteAddress.trim(),
      siteContactPerson: siteContactPerson.trim(),
      siteContactMobile: siteContactMobile.trim(),
    });
    setSubmitting(false);
    if (!res.ok) return flash(res.error || "Could not send the request.");
    flash("Request sent to PO admin.");
    setMaterialCategory("");
    setOffice("");
    setItems([blankItem()]);
    load(false);
  }

  async function cancelRequest(id) {
    const res = await projectAction(companyId, pin, "cancel", { requestId: id });
    if (!res.ok) return flash(res.error || "Could not cancel.");
    flash("Request cancelled.");
    load(false);
  }

  async function markReceived(id, byName) {
    const res = await projectAction(companyId, pin, "markReceived", { requestId: id, byName });
    if (!res.ok) return flash(res.error || "Could not confirm receipt.");
    flash("Admin has been informed material was received.");
    load(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: F_BODY, color: INK_SOFT }}>
        <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} />
        Opening the register...
      </div>
    );
  }

  const sorted = [...requests].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div style={{ fontFamily: F_BODY, background: PAPER, minHeight: "100vh", color: INK }}>
      <div style={{ background: INK, color: "#F3EFE3", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Stamp size={22} />
          <div>
            <div style={{ fontFamily: F_DISPLAY, fontSize: 19, letterSpacing: "0.02em" }}>PO Register</div>
            <div style={{ fontSize: 11, color: "#B9C2D6", letterSpacing: "0.04em" }}>{company?.name || companyName}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.08)", padding: 4, borderRadius: 8 }}>
            {[
              { id: "request", label: "Raise request", icon: ClipboardList },
              { id: "track", label: "Track / Received", icon: PackageCheck },
            ].map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "7px 12px",
                borderRadius: 6, cursor: "pointer", border: "none",
                background: tab === t.id ? "#F3EFE3" : "transparent",
                color: tab === t.id ? INK : "#DAD3C0",
              }}>
                <t.icon size={15} />{t.label}
              </button>
            ))}
          </div>
          <button onClick={refreshNow} disabled={manualRefreshing} title="Refresh data" style={{ background: "transparent", border: "none", color: "#DAD3C0", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <RefreshCw size={14} className={manualRefreshing ? "animate-spin" : ""} /> {manualRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button onClick={onExit} title="Sign out" style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.25)`, borderRadius: 6, padding: "6px 10px", color: "#F3EFE3", cursor: "pointer", fontSize: 12 }}>
            Sign out
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ background: "#FCEBEB", color: "#9B2C2C", padding: "8px 24px", fontSize: 13, borderBottom: `1px solid ${RULE}`, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {toast}
        </div>
      )}

      <div style={{ padding: 24 }}>
        {tab === "request" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 20 }}>
            <div style={{ background: PAPER_CARD, border: `1px solid ${RULE}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontFamily: F_DISPLAY, fontSize: 17, marginBottom: 4 }}>New material request</div>
              <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 16 }}>For {company?.name || companyName}. Rates, GST, and vendor are filled in by the PO admin — you don't need them.</div>

              <div style={{ marginBottom: 12 }}>
                <LabeledInput label="Your name" placeholder="Requested by" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <LabeledInput label="Site contact person" value={siteContactPerson} onChange={(e) => setSiteContactPerson(e.target.value)} />
                <LabeledInput label="Site contact mobile" value={siteContactMobile} onChange={(e) => setSiteContactMobile(e.target.value)} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <LabeledInput label="Delivery / site address" placeholder="Where should this be delivered?" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <LabeledSelect label="Material category" value={materialCategory} onChange={(e) => setMaterialCategory(e.target.value)} options={MATERIAL_CATEGORIES} placeholder="Select category" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <LabeledSelect label="Office" value={office} onChange={(e) => setOffice(e.target.value)} options={OFFICE_OPTIONS} placeholder="Select office" />
              </div>

              <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Quick add</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {quickItems.map((qi) => (
                  <button key={qi} onClick={() => addItem(qi)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 20, border: `1px solid ${RULE}`, background: "#fff", color: INK_SOFT, cursor: "pointer" }}>
                    + {qi}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Materials</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {items.map((it, idx) => (
                  <div key={it.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr 70px 90px 32px", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: F_MONO, fontSize: 12, color: INK_SOFT, textAlign: "center" }}>{idx + 1}</div>
                    <input placeholder="Material description" value={it.description} onChange={(e) => updateItem(it.id, { description: e.target.value })}
                      style={{ fontFamily: F_BODY, fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6 }} />
                    <input type="number" min="0" placeholder="Qty" value={it.qty} onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                      style={{ fontFamily: F_MONO, fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6 }} />
                    <select value={it.unit} onChange={(e) => updateItem(it.id, { unit: e.target.value })} style={{ fontFamily: F_BODY, fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6 }}>
                      {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button onClick={() => removeItem(it.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9B2C2C" }} aria-label="Remove line">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <Btn onClick={() => addItem()}><Plus size={14} />Add line</Btn>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${RULE}`, display: "flex", justifyContent: "flex-end" }}>
                <Btn variant="stamp" onClick={submitRequest} disabled={submitting}><ClipboardList size={15} />{submitting ? "Sending..." : "Send request to PO admin"}</Btn>
              </div>
            </div>

            <div>
              <div style={{ fontFamily: F_DISPLAY, fontSize: 15, marginBottom: 10 }}>Recent requests</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 640, overflowY: "auto" }}>
                {sorted.length === 0 && <div style={{ fontSize: 13, color: INK_SOFT }}>No requests raised yet.</div>}
                {sorted.slice(0, 25).map((r) => {
                  const b = statusBadge(r);
                  return (
                    <div key={r.id} style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{r.category || "Material request"}</div>
                          <div style={{ fontSize: 12, color: INK_SOFT }}>{r.items.length} item{r.items.length !== 1 ? "s" : ""} &middot; {r.requestedBy || "unnamed"}</div>
                        </div>
                        <Stamp3 text={b.text} color={b.color} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "track" && (
          <div>
            <div style={{ fontFamily: F_DISPLAY, fontSize: 17, marginBottom: 4 }}>Track requests</div>
            <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 16 }}>Your project's requests only. Once material arrives at site, confirm receipt here.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sorted.length === 0 && <div style={{ fontSize: 13, color: INK_SOFT }}>Nothing raised yet.</div>}
              {sorted.map((r) => {
                const b = statusBadge(r);
                return (
                  <div key={r.id} style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{r.category || "Material request"}</div>
                      <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>{r.items.length} item{r.items.length !== 1 ? "s" : ""} &middot; by {r.requestedBy || "—"}</div>
                      {r.status === "received" && <div style={{ fontSize: 11, color: TEAL, marginTop: 3 }}>Confirmed by {r.materialReceivedBy || "—"}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Stamp3 text={b.text} color={b.color} />
                      {r.status === "pending" && <ConfirmDelete onConfirm={() => cancelRequest(r.id)} label="Cancel this request" />}
                      {r.status === "generated" && <ReceivedButton onConfirm={(name) => markReceived(r.id, name)} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminGate({ pinInput, setPinInput, onUnlock, unlocking, title, description }) {
  return (
    <div style={{ maxWidth: 360, margin: "40px auto", background: PAPER_CARD, border: `1px solid ${RULE}`, borderRadius: 10, padding: 24, textAlign: "center" }}>
      <Lock size={26} color={INK_SOFT} style={{ marginBottom: 10 }} />
      <div style={{ fontFamily: F_DISPLAY, fontSize: 17, marginBottom: 4 }}>{title || "Admin access required"}</div>
      <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 16 }}>{description || "Enter the admin PIN to continue."}</div>
      <input type="password" inputMode="numeric" placeholder="PIN" value={pinInput} onChange={(e) => setPinInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onUnlock()}
        style={{ width: "100%", textAlign: "center", fontFamily: F_MONO, fontSize: 16, letterSpacing: "0.2em", padding: "10px 12px", border: `1px solid ${RULE}`, borderRadius: 6, marginBottom: 12, boxSizing: "border-box" }} />
      <Btn variant="stamp" onClick={onUnlock} disabled={unlocking} style={{ width: "100%", justifyContent: "center" }}><Unlock size={14} />{unlocking ? "Checking..." : "Unlock"}</Btn>
    </div>
  );
}

// Expense reporting dashboard: filter by company / material category /
// office / date range, see total spend across matching POs. Only requests
// that are "generated" or "received" carry real pricing (pending ones
// have no rate yet), so those are the only ones counted here.
function ReportsTab({ requests, companies }) {
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [filterMaterialCategory, setFilterMaterialCategory] = useState("");
  const [filterOffice, setFilterOffice] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const priced = requests.filter((r) => r.status === "generated" || r.status === "received");

  const fromDate = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
  const toDate = dateTo ? new Date(dateTo + "T23:59:59") : null;

  const filtered = priced.filter((r) => {
    if (filterCompanyId && r.companyId !== filterCompanyId) return false;
    if (filterMaterialCategory && r.materialCategory !== filterMaterialCategory) return false;
    if (filterOffice && r.office !== filterOffice) return false;
    if (fromDate || toDate) {
      const d = parseDMY(r.poDate) || parseDMY(r.requestDate);
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
    }
    return true;
  });

  const rows = filtered.map((r) => ({ req: r, totals: computeTotals(r.items, r.transportNote) }));
  const totalExpense = rows.reduce((sum, x) => sum + x.totals.grand, 0);

  function companyName(id) {
    return (companies.find((c) => c.id === id) || {}).name || "Unknown";
  }
  function clearFilters() {
    setFilterCompanyId(""); setFilterMaterialCategory(""); setFilterOffice(""); setDateFrom(""); setDateTo("");
  }

  return (
    <div>
      <div style={{ fontFamily: F_DISPLAY, fontSize: 17, marginBottom: 4 }}>Expense reports</div>
      <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 16 }}>Only priced/generated POs are counted — pending requests have no rate yet.</div>

      <div style={{ background: PAPER_CARD, border: `1px solid ${RULE}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 4 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Company</span>
            <select value={filterCompanyId} onChange={(e) => setFilterCompanyId(e.target.value)} style={{ fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6, background: "#fff" }}>
              <option value="">All companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Category</span>
            <select value={filterMaterialCategory} onChange={(e) => setFilterMaterialCategory(e.target.value)} style={{ fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6, background: "#fff" }}>
              <option value="">All categories</option>
              {MATERIAL_CATEGORIES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Office</span>
            <select value={filterOffice} onChange={(e) => setFilterOffice(e.target.value)} style={{ fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6, background: "#fff" }}>
              <option value="">All offices</option>
              {OFFICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6 }} />
          </label>
        </div>
        <button onClick={clearFilters} style={{ fontSize: 11, color: INK_SOFT, background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", marginTop: 8 }}>Clear filters</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total expense</div>
          <div style={{ fontFamily: F_MONO, fontSize: 26, fontWeight: 700, color: INK, marginTop: 4 }}>{rupee(totalExpense)}</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Matching POs</div>
          <div style={{ fontFamily: F_MONO, fontSize: 26, fontWeight: 700, color: INK, marginTop: 4 }}>{rows.length}</div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: INK, color: "#F3EFE3" }}>
              {["Company", "Category", "Office", "PO No", "PO Date", "Amount"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", textAlign: h === "Amount" ? "right" : "left", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: INK_SOFT, background: "#fff" }}>No matching POs.</td></tr>
            )}
            {rows.map(({ req, totals }) => (
              <tr key={req.id} style={{ borderBottom: `1px solid ${RULE}`, background: "#fff" }}>
                <td style={{ padding: "8px 10px" }}>{companyName(req.companyId)}</td>
                <td style={{ padding: "8px 10px" }}>{req.materialCategory || "—"}</td>
                <td style={{ padding: "8px 10px" }}>{req.office || "—"}</td>
                <td style={{ padding: "8px 10px", fontFamily: F_MONO, color: BRASS }}>{req.poNo}</td>
                <td style={{ padding: "8px 10px" }}>{req.poDate}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: F_MONO, fontWeight: 600 }}>{rupee(totals.grand)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequestTab({ companies, vendors, draft, setDraft, updateDraftItem, addDraftItem, removeDraftItem, submitRequest, quickItems, newCompanyOpen, setNewCompanyOpen, newCompany, setNewCompany, addCompany, myRequests }) {
  const vendor = vendors.find((v) => v.id === draft.vendorId) || vendors[0];
  function selectCompany(companyId) {
    const comp = companies.find((c) => c.id === companyId);
    setDraft((d) => ({
      ...d, companyId,
      siteAddress: comp?.siteAddress || d.siteAddress,
      siteContactPerson: comp?.siteContactPerson || d.siteContactPerson,
      siteContactMobile: comp?.siteContactMobile || d.siteContactMobile,
    }));
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 20 }}>
      <div style={{ background: PAPER_CARD, border: `1px solid ${RULE}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontFamily: F_DISPLAY, fontSize: 17, marginBottom: 4 }}>New material request</div>
        <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 16 }}>Add what's needed at site. Rates and GST are filled by the PO admin — you don't need them.</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <LabeledInput label="Your name" placeholder="Requested by" value={draft.requestedBy} onChange={(e) => setDraft((d) => ({ ...d, requestedBy: e.target.value }))} />
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Project / company</span>
            <select value={draft.companyId}
              onChange={(e) => { if (e.target.value === "__new__") { setNewCompanyOpen(true); return; } selectCompany(e.target.value); }}
              style={{ fontFamily: F_BODY, fontSize: 14, padding: "8px 10px", border: `1px solid ${RULE}`, borderRadius: 6, background: "#fff", color: INK }}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">+ Add new company...</option>
            </select>
          </label>
        </div>
        <div style={{ fontSize: 11, color: INK_SOFT, marginTop: -6, marginBottom: 12 }}>Site address and site contact below auto-fill from the selected project — edit them if this order goes somewhere different.</div>

        {newCompanyOpen && (
          <div style={{ background: "#fff", border: `1px dashed ${RULE}`, borderRadius: 8, padding: 12, marginBottom: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <LabeledInput label="Company name" value={newCompany.name} onChange={(e) => setNewCompany((c) => ({ ...c, name: e.target.value }))} />
              <LabeledInput label="GST no." value={newCompany.gst} onChange={(e) => setNewCompany((c) => ({ ...c, gst: e.target.value }))} />
            </div>
            <LabeledInput label="Registered address" value={newCompany.registeredAddress} onChange={(e) => setNewCompany((c) => ({ ...c, registeredAddress: e.target.value }))} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="primary" onClick={addCompany}><Check size={14} />Save company</Btn>
              <Btn variant="ghost" onClick={() => setNewCompanyOpen(false)}>Cancel</Btn>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Vendor / supplier</span>
            <select value={draft.vendorId} onChange={(e) => setDraft((d) => ({ ...d, vendorId: e.target.value }))}
              style={{ fontFamily: F_BODY, fontSize: 14, padding: "8px 10px", border: `1px solid ${RULE}`, borderRadius: 6, background: "#fff", color: INK }}>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          {vendor && <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 4 }}>{vendor.address}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <LabeledInput label="Site contact person" value={draft.siteContactPerson} onChange={(e) => setDraft((d) => ({ ...d, siteContactPerson: e.target.value }))} />
          <LabeledInput label="Site contact mobile" value={draft.siteContactMobile} onChange={(e) => setDraft((d) => ({ ...d, siteContactMobile: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <LabeledInput label="Delivery / site address" placeholder="e.g. Mangalam Miraya, Gat no.286, Near Bharat Mata Chowk..." value={draft.siteAddress} onChange={(e) => setDraft((d) => ({ ...d, siteAddress: e.target.value }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <LabeledSelect label="Material category" value={draft.materialCategory} onChange={(e) => setDraft((d) => ({ ...d, materialCategory: e.target.value }))} options={MATERIAL_CATEGORIES} placeholder="Select category" />
          <LabeledSelect label="Office" value={draft.office} onChange={(e) => setDraft((d) => ({ ...d, office: e.target.value }))} options={OFFICE_OPTIONS} placeholder="Select office" />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Quick add</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {quickItems.map((qi) => (
            <button key={qi} onClick={() => addDraftItem(qi)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 20, border: `1px solid ${RULE}`, background: "#fff", color: INK_SOFT, cursor: "pointer" }}>
              + {qi}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Materials</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {draft.items.map((it, idx) => (
            <div key={it.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr 70px 90px 32px", gap: 8, alignItems: "center" }}>
              <div style={{ fontFamily: F_MONO, fontSize: 12, color: INK_SOFT, textAlign: "center" }}>{idx + 1}</div>
              <input placeholder="Material description" value={it.description} onChange={(e) => updateDraftItem(it.id, { description: e.target.value })}
                style={{ fontFamily: F_BODY, fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6 }} />
              <input type="number" min="0" placeholder="Qty" value={it.qty} onChange={(e) => updateDraftItem(it.id, { qty: e.target.value })}
                style={{ fontFamily: F_MONO, fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6 }} />
              <select value={it.unit} onChange={(e) => updateDraftItem(it.id, { unit: e.target.value })} style={{ fontFamily: F_BODY, fontSize: 13, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6 }}>
                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <button onClick={() => removeDraftItem(it.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9B2C2C" }} aria-label="Remove line">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <Btn onClick={() => addDraftItem()}><Plus size={14} />Add line</Btn>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${RULE}`, display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="stamp" onClick={submitRequest}><ClipboardList size={15} />Send request to PO admin</Btn>
        </div>
      </div>

      <div>
        <div style={{ fontFamily: F_DISPLAY, fontSize: 15, marginBottom: 10 }}>Recent requests</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 640, overflowY: "auto" }}>
          {myRequests.length === 0 && <div style={{ fontSize: 13, color: INK_SOFT }}>No requests raised yet.</div>}
          {myRequests.slice(0, 25).map((r) => {
            const b = statusBadge(r);
            return (
              <div key={r.id} style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{companies.find((c) => c.id === r.companyId)?.name || "Unknown"}</div>
                    <div style={{ fontSize: 12, color: INK_SOFT }}>{r.items.length} item{r.items.length !== 1 ? "s" : ""} &middot; {r.requestedBy || "unnamed"}</div>
                  </div>
                  <Stamp3 text={b.text} color={b.color} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TrackTab({ requests, companyOf, onMarkReceived, onDelete }) {
  const sorted = useMemo(() => [...requests].sort((a, b) => b.createdAt - a.createdAt), [requests]);
  return (
    <div>
      <div style={{ fontFamily: F_DISPLAY, fontSize: 17, marginBottom: 4 }}>Track requests</div>
      <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 16 }}>See where every request stands. Once material arrives at site, confirm receipt here to inform the PO admin — no need to call or message separately.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.length === 0 && <div style={{ fontSize: 13, color: INK_SOFT }}>Nothing raised yet.</div>}
        {sorted.map((r) => {
          const b = statusBadge(r);
          const c = companyOf(r.companyId);
          return (
            <div key={r.id} style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c?.name}</div>
                <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>{r.category || "Material request"} &middot; {r.items.length} item{r.items.length !== 1 ? "s" : ""} &middot; by {r.requestedBy || "—"}</div>
                {r.status === "received" && <div style={{ fontSize: 11, color: TEAL, marginTop: 3 }}>Confirmed by {r.materialReceivedBy || "—"}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Stamp3 text={b.text} color={b.color} />
                {r.status === "pending" && <ConfirmDelete onConfirm={() => onDelete(r.id)} label="Cancel this request" />}
                {r.status === "generated" && <ReceivedButton onConfirm={(name) => onMarkReceived(r.id, name)} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReceivedButton({ onConfirm }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) return <Btn variant="teal" onClick={() => setOpen(true)}><PackageCheck size={14} />Material received</Btn>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onConfirm(name.trim())}
        style={{ fontFamily: F_BODY, fontSize: 12, padding: "6px 8px", border: `1px solid ${RULE}`, borderRadius: 6, width: 120 }} />
      <Btn variant="teal" onClick={() => name.trim() && onConfirm(name.trim())}><Check size={13} />Confirm</Btn>
      <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: INK_SOFT }} aria-label="Cancel"><X size={16} /></button>
    </div>
  );
}

function AdminQueueTab({ pending, issued, companyOf, onOpen, onView, onDelete }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <div style={{ fontFamily: F_DISPLAY, fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={16} color={BRASS} /> Awaiting pricing ({pending.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pending.length === 0 && <div style={{ fontSize: 13, color: INK_SOFT, background: PAPER_CARD, padding: 14, borderRadius: 8, border: `1px solid ${RULE}` }}>Queue is clear — no pending requests.</div>}
          {pending.map((r) => {
            const c = companyOf(r.companyId);
            return (
              <div key={r.id} onClick={() => onOpen(r.id)} style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c?.name}</div>
                  <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>{r.category || "Material request"} &middot; {r.items.length} item{r.items.length !== 1 ? "s" : ""}</div>
                  <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 2 }}>By {r.requestedBy || "—"} on {r.requestDate}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ConfirmDelete onConfirm={() => onDelete(r.id)} />
                  <ChevronRight size={18} color={INK_SOFT} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontFamily: F_DISPLAY, fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={16} color={GREEN} /> Issued POs ({issued.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflowY: "auto" }}>
          {issued.length === 0 && <div style={{ fontSize: 13, color: INK_SOFT, background: PAPER_CARD, padding: 14, borderRadius: 8, border: `1px solid ${RULE}` }}>Nothing generated yet.</div>}
          {issued.map((r) => {
            const c = companyOf(r.companyId);
            const received = r.status === "received";
            return (
              <div key={r.id} style={{ background: "#fff", border: `1px solid ${received ? TEAL : RULE}`, borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ cursor: "pointer" }} onClick={() => onOpen(r.id)}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c?.name}</div>
                  <div style={{ fontFamily: F_MONO, fontSize: 12, color: BRASS, marginTop: 2 }}>PO {r.poNo}</div>
                  <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 2 }}>{r.poDate}</div>
                  {received && <div style={{ fontSize: 11, color: TEAL, marginTop: 3 }}>Received, confirmed by {r.materialReceivedBy}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <IconBtn onClick={() => onOpen(r.id)} title="Edit"><Pencil size={14} /></IconBtn>
                  <IconBtn onClick={() => onView(r.id)} title="View / print"><Printer size={14} /></IconBtn>
                  <ConfirmDelete onConfirm={() => onDelete(r.id)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PricingEditor({ req, company, vendors, onBack, onChange, onGenerate, onDelete, onReprint }) {
  const [missingIds, setMissingIds] = useState([]);
  const [noPoNo, setNoPoNo] = useState(false);
  const isPending = req && req.status === "pending";
  const suggestedPoNo = req ? (req.poNo || `${company.poPrefix}/26-27/${(company.lastSeq || 300) + 1}`) : "";

  useEffect(() => {
    if (!req || !isPending) return;
    if (!req.poNo) onChange({ poNo: suggestedPoNo });
    if (!req.poDate) onChange({ poDate: todayStr() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req && req.id]);

  if (!req) return null;
  const totals = computeTotals(req.items, req.transportNote);
  function setItem(id, patch) {
    onChange({ items: req.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  }
  function handleGenerateClick() {
    const missing = req.items.filter((it) => it.rate === "" || it.rate === null || isNaN(Number(it.rate))).map((it) => it.id);
    const poEmpty = !req.poNo || !req.poNo.trim();
    setMissingIds(missing);
    setNoPoNo(poEmpty);
    if (missing.length || poEmpty) return;
    onGenerate();
  }
  const badge = statusBadge(req);

  return (
    <div style={{ background: PAPER_CARD, border: `1px solid ${RULE}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 13 }}>
          <ArrowLeft size={15} /> Back to queue
        </button>
        <ConfirmDelete onConfirm={onDelete} label="Delete this PO" />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: F_DISPLAY, fontSize: 18 }}>{company.name}</div>
          <div style={{ fontSize: 12, color: INK_SOFT }}>Requested by {req.requestedBy || "—"} on {req.requestDate}</div>
        </div>
        <Stamp3 text={badge.text} color={badge.color} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
        <LabeledInput
          label="PO number" value={req.poNo || suggestedPoNo}
          onChange={(e) => onChange({ poNo: e.target.value })}
          style={noPoNo ? { border: "1px solid #A63D2F" } : undefined}
        />
        <LabeledInput label="PO date" value={req.poDate || todayStr()} onChange={(e) => onChange({ poDate: e.target.value })} />
        <LabeledInput label="Priced by" value={req.pricedBy} onChange={(e) => onChange({ pricedBy: e.target.value })} placeholder="Your name" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Vendor / supplier</span>
          <select value={req.vendorId} onChange={(e) => onChange({ vendorId: e.target.value })}
            style={{ fontFamily: F_BODY, fontSize: 14, padding: "8px 10px", border: `1px solid ${RULE}`, borderRadius: 6, background: "#fff", color: INK }}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Site / delivery address</div>
          <div style={{ fontSize: 13, background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 8 }}>
            {req.siteAddress} {req.siteContactPerson && <>&middot; {req.siteContactPerson}</>} {req.siteContactMobile && <>&middot; {req.siteContactMobile}</>}
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: INK, color: "#F3EFE3" }}>
              {["#", "Material", "Qty", "Unit", "Rate (\u20B9)", "GST %", "GST amt", "Amount"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", textAlign: h === "Material" ? "left" : "right", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {req.items.map((it, idx) => {
              const { gstAmt, amount } = itemAmount(it);
              return (
                <tr key={it.id} style={{ borderBottom: `1px solid ${RULE}`, background: "#fff" }}>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: F_MONO }}>{idx + 1}</td>
                  <td style={{ padding: "8px 10px" }}>{it.description}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <input type="number" min="0" value={it.qty} onChange={(e) => setItem(it.id, { qty: e.target.value })}
                      style={{ width: 60, textAlign: "right", fontFamily: F_MONO, fontSize: 13, padding: "5px 7px", border: `1px solid ${RULE}`, borderRadius: 5 }} />
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{it.unit}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <input type="number" min="0" value={it.rate} onChange={(e) => { setItem(it.id, { rate: e.target.value }); setMissingIds((m) => m.filter((x) => x !== it.id)); }}
                      style={{ width: 80, textAlign: "right", fontFamily: F_MONO, fontSize: 13, padding: "5px 7px", border: `1px solid ${missingIds.includes(it.id) ? "#A63D2F" : RULE}`, borderRadius: 5, background: missingIds.includes(it.id) ? "#FCEBEB" : "#fff" }} />
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <input type="number" min="0" value={it.gstPercent} onChange={(e) => setItem(it.id, { gstPercent: e.target.value })}
                      style={{ width: 60, textAlign: "right", fontFamily: F_MONO, fontSize: 13, padding: "5px 7px", border: `1px solid ${RULE}`, borderRadius: 5 }} />
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: F_MONO, color: INK_SOFT }}>{rupee(gstAmt)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: F_MONO, fontWeight: 600 }}>{rupee(amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 16 }}>
        <LabeledInput label="Transport & installation (leave as text or enter an amount)" value={req.transportNote} onChange={(e) => onChange({ transportNote: e.target.value })} />
      </div>

      <div style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Tax breakdown</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 8, fontSize: 13 }}>
          <div style={{ color: INK_SOFT }}>Taxable amount</div><div style={{ textAlign: "right", fontFamily: F_MONO }}>{rupee(totals.taxable)}</div>
          <div style={{ color: INK_SOFT }}>Total GST</div><div style={{ textAlign: "right", fontFamily: F_MONO }}>{rupee(totals.gst)}</div>
          <div style={{ color: INK_SOFT }}>&nbsp;&nbsp;SGST @ 9%</div><div style={{ textAlign: "right", fontFamily: F_MONO, color: INK_SOFT }}>{rupee(totals.sgst)}</div>
          <div style={{ color: INK_SOFT }}>&nbsp;&nbsp;CGST @ 9%</div><div style={{ textAlign: "right", fontFamily: F_MONO, color: INK_SOFT }}>{rupee(totals.cgst)}</div>
          {totals.transportExtra > 0 && (<><div style={{ color: INK_SOFT }}>Transport & installation</div><div style={{ textAlign: "right", fontFamily: F_MONO }}>{rupee(totals.transportExtra)}</div></>)}
          <div style={{ fontWeight: 700, borderTop: `1px solid ${RULE}`, paddingTop: 8 }}>Grand total</div>
          <div style={{ fontWeight: 700, borderTop: `1px solid ${RULE}`, paddingTop: 8, textAlign: "right", fontFamily: F_MONO, fontSize: 16 }}>{rupee(totals.grand)}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <LabeledTextarea
          label="Special conditions for this PO (added after the standard terms)"
          rows={3}
          placeholder="Optional — e.g. site-specific delivery instructions for this order only"
          value={req.additionalTerms}
          onChange={(e) => onChange({ additionalTerms: e.target.value })}
        />
      </div>

      {(missingIds.length > 0 || noPoNo) && (
        <div style={{ background: "#FCEBEB", color: "#9B2C2C", border: "1px solid #E3B8B0", borderRadius: 6, padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>
          {missingIds.length > 0 && <div>Enter a rate for the {missingIds.length} highlighted item{missingIds.length !== 1 ? "s" : ""} above.</div>}
          {noPoNo && <div>Enter a PO number before generating.</div>}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, paddingTop: 12, borderTop: `1px solid ${RULE}` }}>
        {isPending ? (
          <Btn variant="stamp" onClick={handleGenerateClick}><Stamp size={15} />Generate PO (opens PDF save)</Btn>
        ) : (
          <>
            <div style={{ fontSize: 12, color: INK_SOFT }}>Changes save automatically.</div>
            <Btn variant="primary" onClick={onReprint}><Printer size={14} />Save updated PDF</Btn>
          </>
        )}
      </div>
    </div>
  );
}

function VendorsTab({ vendors, onSave }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankVendor());

  function startAdd() { setForm(blankVendor()); setEditingId(null); setFormOpen(true); }
  function startEdit(v) { setForm({ ...v }); setEditingId(v.id); setFormOpen(true); }
  function save() {
    if (!form.name.trim()) return;
    if (editingId) onSave(vendors.map((v) => (v.id === editingId ? form : v)));
    else onSave([...vendors, { ...form, id: form.id || uid() }]);
    setFormOpen(false);
  }
  function remove(id) { onSave(vendors.filter((v) => v.id !== id)); }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: F_DISPLAY, fontSize: 17 }}>Vendors / suppliers</div>
        <Btn onClick={startAdd}><Plus size={14} />Add vendor</Btn>
      </div>

      {formOpen && (
        <div style={{ background: "#fff", border: `1px dashed ${RULE}`, borderRadius: 8, padding: 14, marginBottom: 16, maxWidth: 560 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <LabeledInput label="Vendor name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <LabeledInput label="GST no." value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <LabeledInput label="Vendor address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <LabeledInput label="Contact person" value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
            <LabeledInput label="Contact mobile" value={form.contactMobile} onChange={(e) => setForm((f) => ({ ...f, contactMobile: e.target.value }))} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", margin: "10px 0 6px" }}>Bank details (for advance payment)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <LabeledInput label="Bank name" value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
            <LabeledInput label="Branch" value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <LabeledInput label="Account no." value={form.accountNo} onChange={(e) => setForm((f) => ({ ...f, accountNo: e.target.value }))} />
            <LabeledInput label="IFSC code" value={form.ifsc} onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="primary" onClick={save}><Check size={14} />Save vendor</Btn>
            <Btn variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        {vendors.map((v) => (
          <div key={v.id} style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{v.name}</div>
              <div style={{ display: "flex", gap: 4 }}>
                <IconBtn onClick={() => startEdit(v)} title="Edit vendor"><Pencil size={14} /></IconBtn>
                <ConfirmDelete onConfirm={() => remove(v.id)} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 4 }}>{v.address}</div>
            <div style={{ fontFamily: F_MONO, fontSize: 12, color: BRASS, marginBottom: 4 }}>GST {v.gst || "—"}</div>
            <div style={{ fontSize: 11, color: INK_SOFT }}>{v.contactPerson} {v.contactMobile && <>&middot; {v.contactMobile}</>}</div>
            {(v.bankName || v.accountNo) && (
              <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${RULE}` }}>
                {v.bankName} {v.branch && <>, {v.branch}</>}<br />
                A/C {v.accountNo || "—"} {v.ifsc && <>&middot; IFSC {v.ifsc}</>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompaniesTab({ companies, requests, onSaveCompanies, settings, onChangeCompanyPin, onChangeProcessPin, onChangeTerms, onChangeQuickItems, onChangeAuthorities }) {
  const [companyPinInput, setCompanyPinInput] = useState("");
  const [processPinInput, setProcessPinInput] = useState("");
  const [termsText, setTermsText] = useState((settings.terms || DEFAULT_TERMS).join("\n"));
  const [quickText, setQuickText] = useState((settings.quickItems || DEFAULT_QUICK_ITEMS).join("\n"));
  const [authText, setAuthText] = useState((settings.authorities || DEFAULT_AUTHORITIES).join("\n"));

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankCompany());

  function startAdd() { setForm(blankCompany()); setEditingId(null); setFormOpen(true); }
  function startEdit(c) { setForm({ ...c }); setEditingId(c.id); setFormOpen(true); }
  function save() {
    if (!form.name.trim()) return;
    if (editingId) onSaveCompanies(companies.map((c) => (c.id === editingId ? { ...form } : c)));
    else onSaveCompanies([...companies, { ...form, id: form.id || uid() }]);
    setFormOpen(false);
  }
  function remove(id) { onSaveCompanies(companies.filter((c) => c.id !== id)); }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Companies section PIN</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="New PIN" value={companyPinInput} onChange={(e) => setCompanyPinInput(e.target.value)} style={{ fontFamily: F_MONO, fontSize: 14, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6, flex: 1 }} />
            <Btn variant="primary" onClick={() => { if (companyPinInput.trim()) { onChangeCompanyPin(companyPinInput.trim()); setCompanyPinInput(""); } }}><Check size={14} /></Btn>
          </div>
          <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 6 }}>Unlocks this Companies tab (projects, terms, quick-add items, authorities, and both PINs). Share only with whoever manages company/project setup.</div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Process POs &amp; Vendors PIN</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="New PIN" value={processPinInput} onChange={(e) => setProcessPinInput(e.target.value)} style={{ fontFamily: F_MONO, fontSize: 14, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6, flex: 1 }} />
            <Btn variant="primary" onClick={() => { if (processPinInput.trim()) { onChangeProcessPin(processPinInput.trim()); setProcessPinInput(""); } }}><Check size={14} /></Btn>
          </div>
          <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 6 }}>Unlocks Process POs (pricing/generating) and Vendors. Share only with whoever prices and generates POs.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Quick-add materials (one per line)</div>
          <textarea value={quickText} onChange={(e) => setQuickText(e.target.value)} rows={4}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: F_BODY, fontSize: 12.5, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6, marginBottom: 8, resize: "vertical" }} />
          <Btn variant="primary" onClick={() => onChangeQuickItems(quickText.split("\n").map((t) => t.trim()).filter(Boolean))}><Check size={14} />Save</Btn>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Approving authorities (one per line, add or remove)</div>
          <textarea value={authText} onChange={(e) => setAuthText(e.target.value)} rows={4}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: F_BODY, fontSize: 12.5, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6, marginBottom: 8, resize: "vertical" }} />
          <Btn variant="primary" onClick={() => onChangeAuthorities(authText.split("\n").map((t) => t.trim()).filter(Boolean))}><Check size={14} />Save</Btn>
          <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 6 }}>Printed as the signature columns at the bottom of every PO.</div>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Standard terms &amp; conditions (one per line)</div>
        <textarea value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={5}
          style={{ width: "100%", boxSizing: "border-box", fontFamily: F_BODY, fontSize: 12.5, padding: "7px 9px", border: `1px solid ${RULE}`, borderRadius: 6, marginBottom: 8, resize: "vertical" }} />
        <Btn variant="primary" onClick={() => onChangeTerms(termsText.split("\n").map((t) => t.trim()).filter(Boolean))}><Check size={14} />Save terms</Btn>
        <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 6 }}>Printed as the numbered "subject to conditions" list on every PO. Add order-specific notes from the pricing screen instead.</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: F_DISPLAY, fontSize: 17 }}>Companies / projects</div>
        <Btn onClick={startAdd}><Plus size={14} />Add company</Btn>
      </div>

      {formOpen && (
        <div style={{ background: "#fff", border: `1px dashed ${RULE}`, borderRadius: 8, padding: 14, marginBottom: 16, display: "grid", gap: 8, maxWidth: 600 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <LabeledInput label="Company name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <LabeledInput label="GST no." value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} />
          </div>
          <LabeledInput label="Registered / office address" value={form.registeredAddress} onChange={(e) => setForm((f) => ({ ...f, registeredAddress: e.target.value }))} />
          <LabeledInput label="Default site / delivery address" value={form.siteAddress} onChange={(e) => setForm((f) => ({ ...f, siteAddress: e.target.value }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <LabeledInput label="Default site contact person" value={form.siteContactPerson} onChange={(e) => setForm((f) => ({ ...f, siteContactPerson: e.target.value }))} />
            <LabeledInput label="Default site contact mobile" value={form.siteContactMobile} onChange={(e) => setForm((f) => ({ ...f, siteContactMobile: e.target.value }))} />
            <LabeledInput label="PO number prefix" value={form.poPrefix} onChange={(e) => setForm((f) => ({ ...f, poPrefix: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="primary" onClick={save}><Check size={14} />Save company</Btn>
            <Btn variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        {companies.map((c) => {
          const count = requests.filter((r) => r.companyId === c.id).length;
          return (
            <div key={c.id} style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{c.name}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <IconBtn onClick={() => startEdit(c)} title="Edit company"><Pencil size={14} /></IconBtn>
                  <ConfirmDelete onConfirm={() => remove(c.id)} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 4 }}>{c.registeredAddress}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 12, color: BRASS, marginBottom: 6 }}>GST {c.gst}</div>
              <div style={{ fontSize: 11, color: INK_SOFT, marginBottom: 4 }}>Default site: {c.siteAddress || "—"}</div>
              <div style={{ fontSize: 11, color: INK_SOFT, marginBottom: 8 }}>{count} PO{count !== 1 ? "s" : ""} raised &middot; next no. {c.poPrefix}/26-27/{(c.lastSeq || 300) + 1}</div>
              <CompanyPinRow company={c} onSet={(pin) => onSaveCompanies(companies.map((x) => (x.id === c.id ? { ...x, accessPin: pin } : x)))} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Small inline control for setting/rotating one company's project-access
// PIN. The actual current PIN is never sent to the browser (see
// app/api/kv sanitizeForClient) -- only a "set / not set" flag -- so this
// only ever accepts a brand new value, never displays the existing one.
function CompanyPinRow({ company, onSet }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 8, borderTop: `1px solid ${RULE}` }}>
        <span style={{ fontSize: 11, color: company.hasAccessPin ? TEAL : BRASS }}>
          Project PIN: {company.hasAccessPin ? "set" : "not set"}
        </span>
        <button onClick={() => setEditing(true)} style={{ fontSize: 11, background: "transparent", border: "none", color: INK_SOFT, cursor: "pointer", textDecoration: "underline" }}>
          {company.hasAccessPin ? "Change" : "Set PIN"}
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, paddingTop: 8, borderTop: `1px solid ${RULE}` }}>
      <input autoFocus placeholder="New project PIN" value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && value.trim() && (onSet(value.trim()), setEditing(false), setValue(""))}
        style={{ flex: 1, fontFamily: F_MONO, fontSize: 12, padding: "5px 7px", border: `1px solid ${RULE}`, borderRadius: 5 }} />
      <Btn variant="primary" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => { if (value.trim()) { onSet(value.trim()); setEditing(false); setValue(""); } }}><Check size={12} /></Btn>
      <Btn variant="ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => { setEditing(false); setValue(""); }}>Cancel</Btn>
    </div>
  );
}

function downloadExcel(req, company, vendor, terms) {
  const totals = computeTotals(req.items, req.transportNote);
  const rows = [];
  rows.push([company.name]);
  rows.push(["PURCHASE ORDER"]);
  rows.push([]);
  rows.push(["To", "", "Supplier Name :-", vendor.name]);
  rows.push(["", "", "Address", vendor.address]);
  rows.push(["", "", "Contact Person", vendor.contactPerson]);
  rows.push(["", "", "Contact No", vendor.contactMobile]);
  rows.push(["", "", "GST No", vendor.gst]);
  if (vendor.bankName || vendor.accountNo) {
    rows.push(["", "", "Bank", `${vendor.bankName || ""} ${vendor.branch || ""}`.trim()]);
    rows.push(["", "", "A/C No / IFSC", `${vendor.accountNo || ""} / ${vendor.ifsc || ""}`]);
  }
  rows.push([]);
  rows.push(["PO No", req.poNo, "Date", req.poDate]);
  rows.push(["Company GST No", company.gst]);
  rows.push([]);
  if (req.category) rows.push([req.category]);
  rows.push(["Sr. No.", "Material Description", "Qty", "Unit", "Rate", "GST", "Amount"]);
  req.items.forEach((it, idx) => {
    const { gstAmt, amount } = itemAmount(it);
    rows.push([idx + 1, it.description, Number(it.qty), it.unit, Number(it.rate), Math.round(gstAmt), Math.round(amount)]);
  });
  rows.push([]);
  rows.push(["", "", "", "", "", "Taxable Amount", Math.round(totals.taxable)]);
  rows.push(["", "", "", "", "", "Total GST", Math.round(totals.gst)]);
  rows.push(["", "", "", "", "", "SGST @ 9%", Math.round(totals.sgst)]);
  rows.push(["", "", "", "", "", "CGST @ 9%", Math.round(totals.cgst)]);
  rows.push(["", "", "", "", "", "Transport & Installation", req.transportNote]);
  rows.push(["", "", "", "", "", "Grand Total", Math.round(totals.grand)]);
  rows.push([]);
  rows.push(["Delivery Address", req.siteAddress]);
  rows.push(["Site Contact", req.siteContactPerson, req.siteContactMobile]);
  rows.push([]);
  rows.push(["Terms & Conditions"]);
  terms.forEach((t, i) => rows.push([`${i + 1}) ${t}`]));
  if (req.additionalTerms) {
    rows.push([]);
    rows.push(["Special conditions for this order"]);
    rows.push([req.additionalTerms]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Purchase Order");
  const safeName = (req.poNo || "PO").replace(/[\\/:*?"<>|]/g, "-");
  XLSX.writeFile(wb, `PO_${safeName}.xlsx`);
}

function generateRealPdf(req, company, vendor, terms, authorities) {
  const totals = computeTotals(req.items, req.transportNote);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = 46;

  function ensureRoom(need) {
    if (y + need > pageH - 40) { doc.addPage(); y = 46; }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(company.name, pageW / 2, y, { align: "center" });
  y += 18;
  doc.setFontSize(11);
  doc.text("PURCHASE ORDER", pageW / 2, y, { align: "center" });
  y += 10;
  doc.setDrawColor(20);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("To,", margin, y);
  y += 13;
  doc.setFont("helvetica", "bold");
  doc.text(`Supplier Name :- ${vendor.name || ""}`, margin, y);
  y += 13;
  doc.setFont("helvetica", "normal");
  const addrLines = doc.splitTextToSize(vendor.address || "", 300);
  doc.text(addrLines, margin, y);
  y += addrLines.length * 12;
  if (vendor.contactPerson) { doc.text(`Contact Person :- ${vendor.contactPerson}`, margin, y); y += 13; }
  if (vendor.contactMobile) { doc.text(`Contact No :- ${vendor.contactMobile}`, margin, y); y += 13; }
  if (vendor.gst) { doc.text(`GST No :- ${vendor.gst}`, margin, y); y += 13; }
  if (vendor.bankName || vendor.accountNo) {
    doc.text(`Bank: ${vendor.bankName || ""} ${vendor.branch || ""}`, margin, y); y += 13;
    doc.text(`A/C ${vendor.accountNo || ""}  IFSC ${vendor.ifsc || ""}`, margin, y); y += 13;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(`PO No: ${req.poNo || ""}`, pageW - margin, 96, { align: "right" });
  doc.text(`Date: ${req.poDate || ""}`, pageW - margin, 110, { align: "right" });
  doc.text(`Company GST No: ${company.gst || ""}`, pageW - margin, 124, { align: "right" });

  y += 8;
  doc.setFont("helvetica", "normal");
  const openLine = doc.splitTextToSize(
    `Dear Sir/Madam, with respect to your quotation and our subsequent negotiations we are pleased to place an order as follows for our ${company.registeredAddress || ""}`,
    pageW - margin * 2
  );
  doc.text(openLine, margin, y);
  y += openLine.length * 12 + 6;

  if (req.category) {
    doc.setFont("helvetica", "bold");
    doc.text(req.category, margin, y);
    y += 16;
  }

  const itemRows = req.items.map((it, idx) => {
    const { gstAmt, amount } = itemAmount(it);
    return [idx + 1, it.description, it.qty, it.unit, Number(it.rate) || 0, Math.round(gstAmt), Math.round(amount)];
  });
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Sr.", "Material Description", "Qty", "Unit", "Rate", "GST", "Amount"]],
    body: itemRows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, lineColor: [20, 20, 20], lineWidth: 0.5, textColor: [0, 0, 0] },
    headStyles: { fillColor: [27, 42, 74], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { halign: "center", cellWidth: 28 }, 2: { halign: "right", cellWidth: 40 }, 3: { halign: "center", cellWidth: 40 }, 4: { halign: "right", cellWidth: 60 }, 5: { halign: "right", cellWidth: 55 }, 6: { halign: "right", cellWidth: 65 } },
  });
  y = doc.lastAutoTable.finalY + 14;

  ensureRoom(120);
  const totalsRows = [
    ["Taxable Amount", rupeePdf(totals.taxable)],
    ["Total GST", rupeePdf(totals.gst)],
    ["SGST @ 9%", rupeePdf(totals.sgst)],
    ["CGST @ 9%", rupeePdf(totals.cgst)],
  ];
  if (totals.transportExtra > 0) totalsRows.push(["Transport & Installation", rupeePdf(totals.transportExtra)]);
  else totalsRows.push(["Transport & Installation", String(req.transportNote || "Including")]);
  totalsRows.push(["Grand Total", rupeePdf(totals.grand)]);

  autoTable(doc, {
    startY: y,
    margin: { left: pageW - margin - 220 },
    tableWidth: 220,
    body: totalsRows,
    theme: "grid",
    styles: { fontSize: 9.5, cellPadding: 5, lineColor: [20, 20, 20], lineWidth: 0.5, textColor: [0, 0, 0] },
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (data) => { if (data.row.index === totalsRows.length - 1) data.cell.styles.fontStyle = "bold"; },
  });
  const totalsFinalY = doc.lastAutoTable.finalY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Delivery Address:", margin, y + 12);
  doc.setFont("helvetica", "normal");
  const siteLines = doc.splitTextToSize(req.siteAddress || "", pageW - margin - 260);
  doc.text(siteLines, margin, y + 26);
  let leftY = y + 26 + siteLines.length * 12;
  if (req.siteContactPerson) { doc.text(`Contact Person :- ${req.siteContactPerson}`, margin, leftY); leftY += 13; }
  if (req.siteContactMobile) { doc.text(`Mobile No :- ${req.siteContactMobile}`, margin, leftY); leftY += 13; }

  y = Math.max(totalsFinalY, leftY) + 18;

  ensureRoom(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("* Please supply the above material subject to conditions stipulated in this order. *", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.3);
  terms.forEach((t, i) => {
    const lines = doc.splitTextToSize(`${i + 1}) ${t}`, pageW - margin * 2);
    ensureRoom(lines.length * 10 + 2);
    doc.text(lines, margin, y);
    y += lines.length * 10 + 2;
  });

  if (req.additionalTerms) {
    ensureRoom(24);
    doc.setFont("helvetica", "bold");
    doc.text("Special conditions for this order:", margin, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    const specLines = doc.splitTextToSize(req.additionalTerms, pageW - margin * 2);
    doc.text(specLines, margin, y);
    y += specLines.length * 10 + 4;
  }

  ensureRoom(60);
  y += 24;
  doc.setDrawColor(20);
  doc.line(margin, y, pageW - margin, y);
  y += 6;
  const colW = (pageW - margin * 2) / authorities.length;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  authorities.forEach((a, i) => {
    const cx = margin + colW * i + colW / 2;
    doc.text(a, cx, y + 24, { align: "center", maxWidth: colW - 8 });
  });

  const safeName = (req.poNo || "PO").replace(/[\\/:*?"<>|]/g, "-");
  doc.save(`PO_${safeName}.pdf`);
}

function downloadAndPrint(node, poNo) {
  if (!node) return;
  const contentHtml = node.outerHTML;
  const docStr = `<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>PO ${poNo || ""}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500;600;700&display=swap');
body{font-family:'Inter',system-ui,sans-serif;margin:24px;background:#fff;color:#111;}
table{border-collapse:collapse;}
@media print{ body{margin:0;} }
</style></head><body>${contentHtml}
<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
</body></html>`;
  const blob = new Blob([docStr], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const safeName = (poNo || "PO").replace(/[\\/:*?"<>|]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `PO_${safeName}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  try {
    const w = window.open(url, "_blank");
    if (!w) {
      // Popup blocked — the file above still downloaded. Nothing else to do.
    }
  } catch (e) {}

  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function POPrint({ req, company, vendor, terms, authorities, onClose }) {
  const totals = computeTotals(req.items, req.transportNote);
  const printAreaRef = useRef(null);
  const [pdfState, setPdfState] = useState("idle"); // idle | working | fallback

  async function handleDownloadPdf() {
    setPdfState("working");
    try {
      generateRealPdf(req, company, vendor, terms, authorities);
      setPdfState("idle");
    } catch (e) {
      setPdfState("fallback");
      downloadAndPrint(printAreaRef.current, req.poNo);
    }
  }

  return (
    <div className="print-overlay" style={{ position: "fixed", inset: 0, background: "rgba(27,42,74,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", zIndex: 50, padding: "24px 12px" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .po-print-area, .po-print-area * { visibility: visible; }
          .po-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div style={{ background: "#fff", width: "min(820px, 100%)", borderRadius: 8, overflow: "hidden" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", background: INK, color: "#fff", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 13 }}>PO {req.poNo}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="stamp" onClick={handleDownloadPdf} disabled={pdfState === "working"}>
              <Printer size={14} />{pdfState === "working" ? "Preparing PDF..." : "Download PDF"}
            </Btn>
            <Btn onClick={() => downloadExcel(req, company, vendor, terms)} style={{ background: "#fff", color: INK }}><FileSpreadsheet size={14} />Download Excel</Btn>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }} aria-label="Close"><X size={20} /></button>
          </div>
        </div>
        {pdfState === "fallback" && (
          <div className="no-print" style={{ padding: "6px 18px", background: "#FCEBEB", fontSize: 11.5, color: "#9B2C2C" }}>
            Couldn't generate the PDF directly — downloaded a print-ready file instead. Open it and use Print &rarr; Save as PDF.
          </div>
        )}

        <div className="po-print-area" ref={printAreaRef} style={{ padding: 28, fontFamily: F_BODY, color: "#111", fontSize: 13 }}>
          <div style={{ border: "2px solid #111" }}>
            <div style={{ textAlign: "center", fontFamily: F_DISPLAY, fontSize: 22, padding: "12px 8px", borderBottom: "2px solid #111" }}>{company.name}</div>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14, padding: "6px 8px", borderBottom: "2px solid #111", letterSpacing: "0.05em" }}>PURCHASE ORDER</div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", borderBottom: "1px solid #111" }}>
              <div style={{ padding: 10, borderRight: "1px solid #111" }}>
                <div>To,</div>
                <div style={{ fontWeight: 700 }}>Supplier Name :- {vendor.name}</div>
                <div style={{ marginTop: 6 }}>{vendor.address}</div>
                {(vendor.bankName || vendor.accountNo) && (
                  <div style={{ marginTop: 6, fontSize: 11.5, color: "#333" }}>
                    Bank: {vendor.bankName} {vendor.branch && `, ${vendor.branch}`}<br />
                    A/C {vendor.accountNo} {vendor.ifsc && `\u00b7 IFSC ${vendor.ifsc}`}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F_DISPLAY, fontSize: 18, textAlign: "center", padding: 10 }}>
                {company.name}
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                <tr>
                  <td style={cellL}>Contact Person:- {vendor.contactPerson}</td>
                  <td style={cellR}>Date: {req.poDate}</td>
                  <td style={cellREnd}>PO No: {req.poNo}</td>
                </tr>
                <tr>
                  <td style={cellL}>Contact No:- {vendor.contactMobile}</td>
                  <td style={cellR}>Date: {req.poDate}</td>
                  <td style={cellREnd}>Indent No- By Mail</td>
                </tr>
                <tr>
                  <td style={{ ...cellL, borderBottom: "1px solid #111" }}>GST NO - {vendor.gst}</td>
                  <td style={{ ...cellR, borderBottom: "1px solid #111" }}>GST No.</td>
                  <td style={{ ...cellREnd, borderBottom: "1px solid #111" }}>{company.gst}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ padding: 10, borderBottom: "1px solid #111" }}>
              <div>Dear Sir /Madam,</div>
              <div>With respect to your quotation and our subsequent negotiations we are pleased to place an order as follows for our {company.registeredAddress}</div>
            </div>

            {req.category && <div style={{ padding: "6px 10px", borderBottom: "1px solid #111", fontWeight: 700 }}>{req.category}</div>}

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["Sr. No.", "Material Description", "Qty", "Unit", "Rate", "GST", "Amount"].map((h) => (
                    <th key={h} style={{ border: "1px solid #111", padding: "6px 8px", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {req.items.map((it, idx) => {
                  const { gstAmt, amount } = itemAmount(it);
                  return (
                    <tr key={it.id}>
                      <td style={cellCenter}>{idx + 1}</td>
                      <td style={{ border: "1px solid #111", padding: "6px 8px" }}>{it.description}</td>
                      <td style={cellCenter}>{it.qty}</td>
                      <td style={cellCenter}>{it.unit}</td>
                      <td style={cellCenter}>{Number(it.rate)}</td>
                      <td style={cellCenter}>{Math.round(gstAmt)}</td>
                      <td style={cellCenter}>{Math.round(amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #111", padding: "6px 8px", width: "45%" }} rowSpan={totals.transportExtra > 0 ? 6 : 5}>
                    <div style={{ fontWeight: 700 }}>Address:- {req.siteAddress}</div>
                    <div style={{ marginTop: 10 }}>Contact Person :- {req.siteContactPerson}</div>
                    <div>Mobile No : {req.siteContactMobile}</div>
                  </td>
                  <td style={{ border: "1px solid #111", padding: "6px 8px" }}>Taxable Amount</td>
                  <td style={{ border: "1px solid #111", padding: "6px 8px", textAlign: "right" }}>{Math.round(totals.taxable)}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #111", padding: "6px 8px" }}>Total GST</td>
                  <td style={{ border: "1px solid #111", padding: "6px 8px", textAlign: "right" }}>{Math.round(totals.gst)}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #111", padding: "6px 8px" }}>&nbsp;&nbsp;SGST @ 9%</td>
                  <td style={{ border: "1px solid #111", padding: "6px 8px", textAlign: "right" }}>{Math.round(totals.sgst)}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #111", padding: "6px 8px" }}>&nbsp;&nbsp;CGST @ 9%</td>
                  <td style={{ border: "1px solid #111", padding: "6px 8px", textAlign: "right" }}>{Math.round(totals.cgst)}</td>
                </tr>
                {totals.transportExtra > 0 && (
                  <tr>
                    <td style={{ border: "1px solid #111", padding: "6px 8px" }}>Transport &amp; Installation</td>
                    <td style={{ border: "1px solid #111", padding: "6px 8px", textAlign: "right" }}>{Math.round(totals.transportExtra)}</td>
                  </tr>
                )}
                {totals.transportExtra === 0 && (
                  <tr>
                    <td style={{ border: "1px solid #111", padding: "6px 8px" }}>Transport &amp; Installation</td>
                    <td style={{ border: "1px solid #111", padding: "6px 8px", textAlign: "right" }}>{req.transportNote}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ border: "1px solid #111", padding: "6px 8px", fontWeight: 700 }}>Grand Total</td>
                  <td style={{ border: "1px solid #111", padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>{Math.round(totals.grand)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ padding: "6px 10px", borderTop: "1px solid #111", fontWeight: 700, textDecoration: "underline" }}>
              * Please supply the above material subject to conditions stipulated in this order.*
            </div>
            {terms.map((t, i) => (
              <div key={i} style={{ padding: "4px 10px", borderTop: "1px solid #ddd", fontSize: 11.5 }}>{i + 1}) {t}</div>
            ))}
            {req.additionalTerms && (
              <div style={{ padding: "6px 10px", borderTop: "1px solid #111" }}>
                <div style={{ fontWeight: 700, fontSize: 11.5 }}>Special conditions for this order:</div>
                <div style={{ fontSize: 11.5, whiteSpace: "pre-wrap" }}>{req.additionalTerms}</div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${authorities.length}, 1fr)`, borderTop: "2px solid #111" }}>
              {authorities.map((a, i) => (
                <div key={i} style={{ padding: "20px 10px 10px", borderRight: i < authorities.length - 1 ? "1px solid #111" : "none", textAlign: "center", fontWeight: 700 }}>{a}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const cellL = { padding: "4px 8px", borderRight: "1px solid #111" };
const cellR = { padding: "4px 8px", borderRight: "1px solid #111", fontWeight: 700 };
const cellREnd = { padding: "4px 8px", fontWeight: 700 };
const cellCenter = { border: "1px solid #111", padding: "6px 8px", textAlign: "center" };
