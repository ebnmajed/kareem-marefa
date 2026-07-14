import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client using the PUBLISHABLE key: it operates as `anon` under
 * RLS, which has an insert-only policy — a leaked key can add rows, never
 * read them. The secret key is never used anywhere in this project.
 * Inserts must NOT chain .select(): anon has no select policy, and
 * supabase-js defaults to return=minimal.
 */
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);
