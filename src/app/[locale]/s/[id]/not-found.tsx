"use client";

import { useLocale, useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// SCR-007's neutral state — «هذه الجلسة غير متاحة» — for every card the
// function would not return: a draft, a cancelled session, a suspended org's,
// an id that names nothing. One page for all of them, so it confirms nothing.
//
// ★ Without this file a `notFound()` here reached no boundary at all:
// `(marketing)/not-found.tsx` covers its own group and `app/not-found.tsx`
// covers `/app`, so a stranger with a dead link got Next's built-in English
// page. A `not-found.tsx` is not a Suspense boundary, so the response is still
// a real 404 (DEC-134 item 4) — see the page's header.
//
// No retry: the card is not transiently missing. The way back is the site's
// home, the one public page a stranger can use.
export default function PublicCardNotFound() {
  const t = useTranslations("sessions.card");
  const locale = useLocale();
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
      <RouteError title={t("unavailableTitle")} description={t("unavailableBody")} backLabel={t("unavailableBack")} backHref={`/${locale}`} />
    </main>
  );
}
