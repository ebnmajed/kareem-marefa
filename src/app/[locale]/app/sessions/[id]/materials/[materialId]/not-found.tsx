"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// content's file — `16` §7.4: "a `not-found.tsx` per dynamic segment — a
// deleted session, a revoked verification code, a MATERIAL TAKEN DOWN WHILE
// THE TAB WAS OPEN. `notFound()` is already called in six places with no
// boundary to catch it." SCR-013's viewer calls it when a material is
// missing, removed, or the phase gate now hides it.
//
// Next's `not-found.tsx` gets no props — there is nothing to retry in the
// literal sense (the resource is gone, not transiently unavailable), so
// `reset` re-fetches the current route via `router.refresh()`: harmless if
// the material really is gone (the same not-found renders again), and a
// real recovery if it was a takedown that already reversed.
export default function MaterialNotFound() {
  const t = useTranslations("ui.error");
  const locale = useLocale();
  const router = useRouter();
  return (
    <RouteError
      title={t("notFoundTitle")}
      description={t("notFoundDescription")}
      retryLabel={t("retry")}
      backLabel={t("notFoundBack")}
      backHref={`/${locale}/app/sessions`}
      reset={() => router.refresh()}
    />
  );
}
