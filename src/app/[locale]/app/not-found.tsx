"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// The not-found boundary for everything under `/app` that has no nearer one —
// `16` §7.4, REQ-UIX-016, DEC-091, DEC-134.
//
// Before wave 6 a `notFound()` from a STATIC route under `/app` — every admin
// page's staff gate, a platform page's — fell through to Next's built-in page:
// an English «404 · This page could not be found.» in an Arabic product. The
// nearer boundaries (`sessions/[id]`, `propose/[id]`, the material viewer) keep
// their own copy; this one catches the rest, including the six dynamic
// segments the route-coverage allowlist was still excusing.
//
// ★ Under the loading model (`app/loading.tsx` wraps the whole subtree) this
// renders into a response that has already begun streaming, so the status is
// 200 with `noindex` — Next 16's documented HTTP contract, recorded in
// DEC-134. The authorization is unchanged: the gate that called `notFound()`
// rendered no data.
export default function AppNotFound() {
  const t = useTranslations("ui.error");
  const locale = useLocale();
  const router = useRouter();
  return (
    <RouteError
      title={t("notFoundTitle")}
      description={t("notFoundDescription")}
      retryLabel={t("retry")}
      backLabel={t("notFoundBack")}
      backHref={`/${locale}/app`}
      reset={() => router.refresh()}
    />
  );
}
