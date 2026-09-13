"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ScheduleState } from "./actions";
import { emptyScheduleState } from "./state";

// SCR-043's «انشر الجلسة». Disabled while anything REQ-SES-001 requires is
// missing — and the list of what is missing is rendered beside it, because
// "publish is greyed out" without a reason is the state SCR-043 calls
// "incomplete, naming what is missing".
//
// The button being enabled proves nothing: 0010's check constraint refuses
// the update regardless, which is what 15-backlog.md means by "blocked by a
// DATABASE CONSTRAINT, not only by the form".
export function PublishButton({
  action,
  missing,
}: {
  action: (prev: ScheduleState, formData: FormData) => Promise<ScheduleState>;
  missing: string[];
}) {
  const t = useTranslations("admin.schedule");
  const [state, formAction, pending] = useActionState(action, emptyScheduleState);
  const incomplete = missing.length > 0;

  return (
    <div className="mt-8 max-w-2xl rounded-field border border-edge p-5">
      {state.published ? (
        <p role="status" className="mb-4 text-body text-fg-heading">
          {t("published")}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="mb-4 text-body-sm text-fg-heading">
          {t(state.error)}
        </p>
      ) : null}

      {incomplete ? (
        <div className="mb-4">
          <p className="text-label text-fg-heading">{t("incompleteTitle")}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-body-sm text-fg-body">
            {missing.map((m) => (
              <li key={m}>{t(`missing.${m}`)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mb-4 text-body-sm text-fg-muted">{t("publishNote")}</p>
      )}

      {/* DEC-012 / REQ-DSG-002: the poster is M6 and does not gate today. */}
      <p className="mb-4 text-body-sm text-fg-muted">{t("posterPending")}</p>

      <form action={formAction}>
        <Button type="submit" disabled={pending || incomplete}>
          {t("publish")}
        </Button>
      </form>
    </div>
  );
}
