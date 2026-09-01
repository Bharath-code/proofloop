import { createClient } from '@supabase/supabase-js';

// Publishable anon config is fine for the two submission tables (RLS allows
// anon inserts only). Workspace/review writes need the service-role key,
// which bypasses RLS; it is server-only and never committed.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';

export const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_KEY);

export const db =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;
