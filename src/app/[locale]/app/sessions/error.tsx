"use client";

import { useLocale } from "next-intl";
import { RouteBoundary } from "@/components/shell/route-boundary";

// sessions's file — `16` §7.4, REQ-UIX-016, DEC-091, DEC-101.
//
// Covers `/app/sessions` (SCR-011, browse) and everything below it that has no
// more specific boundary of its own — check-in, the host view, rate. The event
// page has one, because a failure there should not take the catalogue down
// with it.
//
// ★ It is a CLIENT component by Next's contract, so it cannot read the DAL.
// Every `/app/**` route is dynamic and touches it, which is exactly why this
// file exists: without it a Supabase timeout or an RLS `42501` renders Next's
// default page — English, left to right, no shell — to a member of an
// Arabic-first product.
export default function SessionsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  return <RouteBoundary error={error} reset={reset} backHref={`/${locale}/app`} />;
}
