"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// The admin console's error boundary. `error.tsx` is a CLIENT component by
// Next's own contract, so — unlike every page it sits under — it cannot call
// the DAL or `getTranslations` (server-only). Everything it needs comes from
// `useTranslations` (client-safe, already used elsewhere: `field.tsx`,
// `header.tsx`) and the boundary's own props. `RouteError` (lead's,
// `ui/route-error.tsx`) is the shared body every `error.tsx` in the product
// renders — never a stack trace, never an error code as the headline (`16`
// §7.4).
//
// "Back" goes to the admin dashboard, not to the page that just threw — a
// retry (`reset()`) is offered first and is almost always the right move for
// a transient failure (a dropped connection, a stale `claims_version` on a
// privileged write); "back" is the exit for when it keeps failing.

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("admin.error");
  return (
    <RouteError
      title={t("title")}
      description={t("description")}
      retryLabel={t("retry")}
      backLabel={t("back")}
      backHref="/app/admin"
      reset={reset}
      digest={error.digest}
    />
  );
}
