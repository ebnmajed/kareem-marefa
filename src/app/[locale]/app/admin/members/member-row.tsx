"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import type { AdminMemberRow } from "@/lib/dal/admin-members";
import { changeRole, deactivate, reactivate, type RowState } from "./actions";
import { emptyRowState } from "./state";

// One row of SCR-049's list. Two independent reasoned forms — role,
// deactivate — each with its own `useActionState`, so a `last_admin` on
// the role form never shows up attached to the deactivate button. Same
// "reason behind a <details>" shape `admin/proposals/review-card.tsx`
// uses, for the same reason: REQ-ADM-009's deactivation reason is
// substance, not a confirmation step. Reactivation is a single idempotent
// click with no reason, so it is a plain transition (`toggleVenue`'s shape,
// `admin/venues/actions.ts`), not a third `useActionState`.

export function MemberRow({
  member,
  companyName,
  isSelf,
  locale,
  deactivatedLabel,
}: {
  member: AdminMemberRow;
  companyName: string | null;
  isSelf: boolean;
  locale: string;
  deactivatedLabel: string;
}) {
  const t = useTranslations("admin.members");
  const active = member.status === "active";
  const [reactivatePending, startReactivate] = useTransition();

  const [roleState, roleAction, rolePending] = useActionState(changeRole.bind(null, locale as Locale, member.id) as (prev: RowState, fd: FormData) => Promise<RowState>, emptyRowState);
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(deactivate.bind(null, locale as Locale, member.id) as (prev: RowState, fd: FormData) => Promise<RowState>, emptyRowState);

  return (
    <li className="rounded-field border border-edge p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-label text-fg-heading">
            <bdi>{member.displayName ?? member.email}</bdi>
            {!active ? <span className="ms-2 text-body-sm font-normal text-fg-muted">{t("statusDeactivated")}</span> : null}
          </p>
          <p className="mt-1 text-body-sm text-fg-muted">
            <bdi dir="ltr">{member.email}</bdi>
            {companyName ? (
              <>
                {" · "}
                <bdi>{companyName}</bdi>
              </>
            ) : null}
          </p>
          {!active && member.deactivatedAt ? (
            <p className="mt-1 text-body-sm text-fg-muted">
              {t.rich("deactivatedNote", { date: deactivatedLabel, reason: member.deactivatedReason ?? "", bdi: (chunks) => <bdi>{chunks}</bdi> })}
            </p>
          ) : null}
        </div>
        <Link href={`/app/members/${member.id}`} className="text-body-sm text-fg-heading underline underline-offset-4">
          {t("viewProfile")}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-edge pt-4">
        <form action={roleAction} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-body-sm text-fg-body">
            {t("roleLabel")}
            <select name="role" defaultValue={member.role} className="rounded-field border border-edge-strong bg-canvas px-2 py-2 text-body-sm text-fg-heading">
              <option value="admin">{t("role.admin")}</option>
              <option value="moderator">{t("role.moderator")}</option>
              <option value="member">{t("role.member")}</option>
            </select>
          </label>
          <Button type="submit" variant="secondary" disabled={rolePending} className="h-11 px-4 text-body-sm">
            {t("changeRole")}
          </Button>
        </form>

        {isSelf ? null : active ? (
          <details className="w-full sm:w-auto">
            <summary className="inline-flex h-11 cursor-pointer list-none items-center rounded-field border border-edge-strong px-4 text-body-sm text-fg-heading hover:bg-silver-100">
              {t("deactivate")}
            </summary>
            <form action={deactivateAction} className="mt-3 max-w-sm">
              <label htmlFor={`reason-${member.id}`} className="text-body-sm text-fg-heading">
                {t("reasonLabel")}
              </label>
              <p className="mt-1 text-body-sm text-fg-muted">{t("reasonHint")}</p>
              <textarea
                id={`reason-${member.id}`}
                name="reason"
                rows={2}
                maxLength={300}
                className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body-sm text-fg-heading"
              />
              <Button type="submit" variant="secondary" disabled={deactivatePending} className="mt-2 h-11 px-4 text-body-sm">
                {t("send")}
              </Button>
              {deactivateState.error ? (
                <p role="alert" className="mt-2 text-body-sm text-fg-heading">
                  {t(`error.${deactivateState.error}`)}
                </p>
              ) : null}
            </form>
          </details>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={reactivatePending}
            onClick={() => startReactivate(() => reactivate(locale as Locale, member.id))}
            className="h-11 px-4 text-body-sm"
          >
            {t("reactivate")}
          </Button>
        )}
      </div>

      {roleState.error ? (
        <p role="alert" className="mt-3 text-body-sm text-fg-heading">
          {t(`error.${roleState.error}`)}
        </p>
      ) : null}
    </li>
  );
}
