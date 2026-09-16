"use client";

import { useLocale, useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// content's file — `16` §7.4, REQ-UIX-016, DEC-091. The route error boundary
// for `/app/me/bookmarks`, at the same level as its (future) `loading.tsx`.
//
// `error.tsx` is a CLIENT component by Next's contract, so this cannot read
// the DAL — everything it needs comes from `useTranslations`/`useLocale`
// (both work here: this sits under the locale layout's
// `NextIntlClientProvider`, unlike `global-error.tsx`, which replaces the
// root layout entirely and has none) and the `error`/`reset` Next hands it.
//
// The generic `ui.error.*` copy (lead's, `ui.json`) is reused as-is rather
// than a bookmarks-specific sentence — §7.4's own wording for "a way back"
// is literally "back to `/app`", which is what `back`/`backHref` below do.
export default function BookmarksError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
