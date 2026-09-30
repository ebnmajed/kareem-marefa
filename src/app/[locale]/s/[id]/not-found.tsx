"use client";

import { useLocale, useTranslations } from "next-intl";
import { PublicCardFooter, PublicCardFrame, PublicCardHeader } from "@/components/browse/public-card-frame";
import { RouteError } from "@/components/ui/route-error";

// SCR-007's neutral state — «هذه الجلسة غير متاحة» — for every card the function
// would not return: a draft, a cancelled session (DEC-207, N2), a suspended org's,
// an id that names nothing. One page for all of them, so it confirms nothing. In
// the card's own frame (wave 18), with no org's name: there is no org to name.
//
// A `not-found.tsx` is not a Suspense boundary, so the response is still a real
// 404 (DEC-134 item 4) — see the page's header. No retry: the card is not
// transiently missing. The way back is the site's home.
export default function PublicCardNotFound() {
  const t = useTranslations("sessions.card");
  const shell = useTranslations("app.shell");
  const locale = useLocale();
  return (
    <PublicCardFrame>
      <PublicCardHeader homeLabel={shell("brand")} />
      <main className="px-4 py-10">
        <RouteError title={t("unavailableTitle")} description={t("unavailableBody")} backLabel={t("unavailableBack")} backHref={`/${locale}`} />
      </main>
      <PublicCardFooter privacy={shell("privacy")} terms={shell("terms")} />
    </PublicCardFrame>
  );
}
