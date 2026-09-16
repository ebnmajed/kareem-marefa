"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// sessions's file — `16` §7.4, REQ-UIX-016, DEC-091, DEC-101.
//
// Covers `/app/sessions/[id]` and every dynamic segment below it. The event
// page calls `notFound()` for a session that does not exist, one that belongs
// to another org (where RLS returns no row, which is the same fact from the
// outside), and one deleted while the tab was open.
//
// Next hands `not-found.tsx` no props, so `reset` re-fetches the current route
// rather than re-running a boundary that was never entered: harmless if the
// session really is gone — the same page renders again — and a real recovery
// if a member arrived a moment before it was published. The refresh runs in a
// transition, so the page stays interactive while it re-renders.
export default function SessionNotFound() {
  const t = useTranslations("ui.error");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <RouteError
      title={t("notFoundTitle")}
      description={t("notFoundDescription")}
      retryLabel={t("retry")}
      backLabel={t("notFoundBack")}
      backHref={`/${locale}/app/sessions`}
      reset={() => startTransition(() => router.refresh())}
    />
  );
}
