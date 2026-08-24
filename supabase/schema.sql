-- PO Register — Supabase schema
-- Run once in Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists po_requests (
  id         uuid primary key default gen_random_uuid(),
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists po_requests_created_at_idx on po_requests (created_at desc);

-- IMPORTANT — read before going live:
-- These are OPEN policies: anyone holding the public "anon" key can
-- read and write everything. That mirrors the app's original model
-- (PIN-gated in the browser only) which is fine for a small trusted
-- team behind a private link, but it is NOT real access control —
-- vendor bank details and GST numbers are readable by anyone with the
-- anon key. See README.md "Security" section for hardening steps
-- (Supabase Auth + real RLS policies restricted to authenticated
-- admin users).
alter table app_state enable row level security;
alter table po_requests enable row level security;

drop policy if exists "app_state_select" on app_state;
drop policy if exists "app_state_insert" on app_state;
drop policy if exists "app_state_update" on app_state;
create policy "app_state_select" on app_state for select using (true);
create policy "app_state_insert" on app_state for insert with check (true);
create policy "app_state_update" on app_state for update using (true);

drop policy if exists "po_requests_select" on po_requests;
drop policy if exists "po_requests_insert" on po_requests;
drop policy if exists "po_requests_update" on po_requests;
drop policy if exists "po_requests_delete" on po_requests;
create policy "po_requests_select" on po_requests for select using (true);
create policy "po_requests_insert" on po_requests for insert with check (true);
create policy "po_requests_update" on po_requests for update using (true);
create policy "po_requests_delete" on po_requests for delete using (true);

alter publication supabase_realtime add table po_requests;
alter publication supabase_realtime add table app_state;

insert into app_state (key, value) values
  ('companies', '[
    {"id":"ppa","name":"Preetam Prakash Associates","poPrefix":"ML","gst":"27AAJFP8962F1ZR","registeredAddress":"Mangalam Landmarks 1st Floor, Life Ville, Above Reymond Shop, PK Chowk, Pimple Saudagar, Pune 411027","siteAddress":"MVF5+3VR, Moshi Gaon, Moshi, Pimpri Chinchwad, Maharashtra 411070","siteContactPerson":"Ganesh Panchal","siteContactMobile":"6363271910","lastSeq":322},
    {"id":"urway","name":"Urway Infra LLP","poPrefix":"ML","gst":"27AAIFU1759J1ZP","registeredAddress":"Mangalam Landmarks 1st Floor, Life Ville, Above Reymond Shop, PK Chowk, Pimple Saudagar, Pune 411027","siteAddress":"Thathawade S.No. 75/1/2, Jivan Nagar, Chinchwad Police Station, Sharayu Toyota Service Centre & Spare Parts, Milshi Pune 411033","siteContactPerson":"Ganesh Panchal","siteContactMobile":"6363271910","lastSeq":320},
    {"id":"sdm","name":"Shree Datta Mangalam","poPrefix":"ML","gst":"27AEWFS4919Q1ZR","registeredAddress":"Mangalam Landmarks 1st Floor, Life Ville, Above Reymond Shop, PK Chowk, Pimple Saudagar, Pune 411027","siteAddress":"Mangalam Miraya, Gat no.286, Near Bharat Mata Chowk, Borhadewadi, Moshi Dehu Road, Pune 412105","siteContactPerson":"Ganesh Panchal","siteContactMobile":"6363271910","lastSeq":321}
  ]'::jsonb)
on conflict (key) do nothing;

insert into app_state (key, value) values
  ('vendors', '[
    {"id":"kamal","name":"Kamal Printers","address":"Sr.No.9, Kamal Kunj, Kharadi Road, Chandan Nagar, Pune-411030","contactPerson":"Mr. Kamal Gupta","contactMobile":"9822616678","gst":"27AIHPG1885G1Z6","bankName":"","accountNo":"","ifsc":"","branch":""}
  ]'::jsonb)
on conflict (key) do nothing;

insert into app_state (key, value) values
  ('settings', '{
    "adminPin": "2026",
    "terms": [
      "GST 18% as mentioned above. Transport - As mentioned above. Loading Incl./unloading by us.",
      "Please quote purchase order number in all challans/invoices.",
      "Payment - Advance.",
      "Delivery - Immediate.",
      "Material will be accepted between working hours 10 a.m. to 5 p.m. only. Our weekly off is Sunday.",
      "All goods accepted are subject to final approval of the company''s work inspection after confirming quality, quantity, and specifications.",
      "The original invoice must be submitted to the company''s head office Pune, purchase order no., date and supplier''s delivery challan no. and GST No. must appear on all invoices submitted for payment.",
      "Material should accompany test certificates/lab report/first piece sample/pre-dispatch inspection report (PDIR)/Material Safety Data Sheet (MSDS) as applicable along with challan.",
      "Material must accompany warranty/guarantee card duly sealed and signed as applicable."
    ],
    "quickItems": ["Stage Passing Register","Curing Register","Cube Register","Plumbing Register","Drawing Register","Delay Register","On Site Decision Book","Visitor Register","Attendance Register","Site Diary"],
    "authorities": ["Admin Executive","Checked By HR - Admin HOD","Authorized Approved By CMD"]
  }'::jsonb)
on conflict (key) do nothing;
