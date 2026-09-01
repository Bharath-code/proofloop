import { createClient } from '@supabase/supabase-js';

// Public publishable config only (anon role). Writes are limited by RLS to
// inserts on the two submission tables. Server-only secrets would go in
// env vars and are never committed.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

export const db =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;
