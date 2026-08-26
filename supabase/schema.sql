-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
--
-- The app stores its data as a small number of JSON documents, keyed by name
-- ("companies", "vendors", "requests", "settings"). Only the Next.js server
-- ever talks to this table, using the service_role key from app/api/kv/*
-- and app/api/project/*.
--
-- Each company object inside "companies" carries its own project-access
-- PIN (accessPin) -- this is what powers the separate, restricted
-- per-company dashboard. It's never exposed to the browser as plain text;
-- see app/api/kv/route.js's sanitizeForClient and app/api/project/*.
--
-- Row Level Security is enabled with NO policies -- this locks the table to
-- service_role-only access, so even if the anon/public key ever leaked, it
-- could not read or write anything here.

create table if not exists public.po_workspace (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.po_workspace enable row level security;

-- Intentionally no policies: only the service_role key (server-side only,
-- bypasses RLS) can read/write this table.

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists po_workspace_set_updated_at on public.po_workspace;
create trigger po_workspace_set_updated_at
  before update on public.po_workspace
  for each row execute function public.set_updated_at();
