"use client";

import { useLocale, useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// content's file — `16` §7.4, REQ-UIX-016, DEC-091. Covers
// `/app/sessions/[id]/materials` AND its `[materialId]` child (an
// `error.tsx` catches its own segment and everything below it unless a more
// specific one exists — there is none here), same pattern as
// `me/bookmarks/error.tsx`.
export default function MaterialsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("ui.error");
  const locale = useLocale();
  return (
    <RouteError
      title={t("title")}
      description={t("description")}
      retryLabel={t("retry")}
      backLabel={t("back")}
      backHref={`/${locale}/app`}
      reset={reset}
      digest={error.digest}
    />
  );
}
