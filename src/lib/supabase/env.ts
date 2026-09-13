// The platform's Supabase connection. DEC-020 / DEC-021: these are the two
// NEXT_PUBLIC_ variables the README once said would never exist; the browser
// client (auth UI and Realtime only) needs them, and RLS is the boundary.
//
// The frozen registration form keeps its own SUPABASE_URL /
// SUPABASE_PUBLISHABLE_KEY (src/lib/supabase.ts) and is not touched.

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set — the platform routes need them (04 §5.2).",
    );
  }
  return { url, key };
}

/** The cookie name @supabase/ssr derives from the project URL, for proxy's optimistic check. */
export function sessionCookieName(): string {
  const { url } = supabaseEnv();
  const host = new URL(url).hostname;
  const ref = host.split(".")[0];
  return `sb-${ref}-auth-token`;
}
