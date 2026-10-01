"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// SCR-013's not-found (`16` §7.4, REQ-UIX-016): a material that is missing, taken down while the tab was open,
// hidden by its phase gate, or of another session. Next gives this file no props; «retry» re-fetches the route
// (`router.refresh()`) — harmless if the material is really gone, a recovery if a takedown was reversed. The way
// back is the catalogue: a session that is gone would 404 again.
export default function MaterialNotFound() {
  const t = useTranslations("ui.error");
  const locale = useLocale();
  const router = useRouter();
  return (
    <div className="flex min-h-dvh items-center bg-void p-4">
      <RouteError
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        retryLabel={t("retry")}
        backLabel={t("notFoundBack")}
        backHref={`/${locale}/app/sessions`}
        reset={() => router.refresh()}
      />
    </div>
  );
}
