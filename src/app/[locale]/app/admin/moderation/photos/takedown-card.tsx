"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { type ModerationState } from "./actions";
import { emptyModerationState } from "./state";

// One row of SCR-051's queue — the takedown queue, already hidden.
export function TakedownCard({
  action,
  children,
}: {
  action: (prev: ModerationState, formData: FormData) => Promise<ModerationState>;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.moderation");
  const [state, formAction, pending] = useActionState(action, emptyModerationState);

  return (
    <li className="rounded-field border border-edge p-5">
      {children}

      {state.error ? (
        <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(`error.${state.error}`)}
        </p>
      ) : null}

      <form action={formAction} className="mt-5 border-t border-edge pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" name="action" value="restore" variant="secondary" disabled={pending}>
            {t("restore")}
          </Button>
          <details className="w-full sm:w-auto">
            <summary className="inline-flex h-12 cursor-pointer list-none items-center rounded-field bg-navy-950 px-6 text-label text-white hover:bg-navy-900">
              {t("remove")}
            </summary>
            <div className="mt-3">
              <label htmlFor="reason" className="text-label text-fg-heading">
                {t("reasonLabel")}
              </label>
              <p className="mt-1 text-body-sm text-fg-muted">{t("reasonHint")}</p>
              <textarea id="reason" name="reason" rows={2} maxLength={300} className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading" />
              <Button type="submit" name="action" value="remove" variant="secondary" className="mt-3" disabled={pending}>
                {t("send")}
              </Button>
            </div>
          </details>
        </div>
      </form>
    </li>
  );
}
