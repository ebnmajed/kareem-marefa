"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// SCR-012's not-found — a session the viewer may not see and one that does not exist read the same, so the
// page confirms nothing (`sessions_read` decides). The way back is the sessions list.
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
