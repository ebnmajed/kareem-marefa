"use client";

import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/supabase/env";

// The browser client exists for auth UI and Realtime ONLY (DEC-020,
// DEC-021, REQ-NFR-004). No data read or write originates here; every
// channel it subscribes to is private (03 §7). It is not used yet — sign-in
// starts server-side — and it is here so the boundary is named from day one.
export function createBrowserClient() {
  const { url, key } = supabaseEnv();
  return createSsrBrowserClient(url, key);
}
