import { createClient } from "@supabase/supabase-js";

let _client = null;

export function getSupabaseAdmin() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
