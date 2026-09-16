"use client";

import { useLocale } from "next-intl";
import { RouteBoundary } from "@/components/shell/route-boundary";

// sessions's file — `16` §7.4, REQ-UIX-016, DEC-091, DEC-101. Covers SCR-017
// and SCR-018 (`[id]`), which has no boundary of its own.
//
// ★ A failed SUBMISSION does not land here and must not: the Server Action
// returns a `FormState` carrying every word the member typed, and the form
// renders `errors.failed` in place while keeping the abstract. This boundary
// is for the page failing to RENDER — the categories query timing out, the
// member list refused — where there is nothing typed to protect.
export default function ProposeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  return <RouteBoundary error={error} reset={reset} backHref={`/${locale}/app`} />;
}
