import "server-only";
import { cookies } from "next/headers";
import { createServerClient as createSsrClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/supabase/env";

// The server-side client for ALL data access (04 §5.1). It runs as
// `authenticated` with the user's JWT, so RLS applies to every query it
// makes. Never the secret key, never service_role — those are the worker's,
// and only through SECURITY DEFINER functions.
export async function createServerClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();
  return createSsrClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        // Server Components cannot write cookies; proxy.ts refreshes the
        // session where they can be written. Swallowing here is expected.
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {}
      },
    },
  });
}
