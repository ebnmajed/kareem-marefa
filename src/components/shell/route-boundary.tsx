"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// The body every `error.tsx` renders — one import, one shape, one place the
// copy lives. `16` §7.4, REQ-UIX-016.
//
// ★ It is a CLIENT component and so is every `error.tsx`, which means
// `useTranslations` (the client hook) rather than `getTranslations` (the
// server one). `NextIntlClientProvider` is above it — a route boundary sits
// INSIDE the locale layout, unlike `global-error.tsx`, which replaces it. That
// difference is the whole reason there are two files.
//
// Each track writes the two-line `error.tsx` under its own routes (DEC-101);
// this is what they render, so nobody re-types the copy or the markup.

export function RouteBoundary({ error, reset, backHref = "/ar/app" }: { error: Error & { digest?: string }; reset: () => void; backHref?: string }) {
  const t = useTranslations("ui.error");
  return (
    <RouteError
      title={t("title")}
      description={t("description")}
      retryLabel={t("retry")}
      backLabel={t("back")}
      backHref={backHref}
      reset={reset}
      digest={error.digest}
    />
  );
}
