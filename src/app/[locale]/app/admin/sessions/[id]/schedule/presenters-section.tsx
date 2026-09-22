"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { MemberPicker, type PickableMember } from "@/components/admin/member-picker";
import { RemovePresenter } from "@/components/sessions/remove-presenter";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AddPresenterState } from "./presenters-state";
import { initialAddPresenterState } from "./presenters-state";

// SCR-043's presenters (REQ-SES-019) — who presents this session, changed by
// an admin at any time after it exists. Composition only: the member picker
// (`console`'s, imported), `RemovePresenter` (the proposal's confirm, with this
// screen's words), `<Field>` and the house button.
//
// ★ Its own two forms, never inside the schedule's: adding someone does not
// save a half-edited schedule, and the schedule's save never sees `memberId`.
//
// ★ The rules are the RPCs'. What this screen does with them is only to not
// offer what would be refused: no «أزل» on the one accepted presenter, and
// nobody in the picker who already presents. A pending or declined row stays
// pickable — adding them is how an admin makes them a presenter (DEC-174 Q2).

export interface PresenterRow {
  memberId: string;
  displayName: string | null;
  accepted: boolean;
  declinedAt: string | null;
}

type RemoveAction = () => Promise<void | { error: string }>;

export function PresentersSection({
  presenters,
  members,
  completed,
  locked = false,
  addAction,
  removeActions,
}: {
  presenters: PresenterRow[];
  /** Active members of the org, before this screen removes the presenters. */
  members: PickableMember[];
  /** Completed or archived: a change now moves points (`scoring`'s, REQ-PTS-015). */
  completed: boolean;
  /** Cancelled: both RPCs refuse, so the list is shown and nothing is offered. */
  locked?: boolean;
  addAction: (prev: AddPresenterState, formData: FormData) => Promise<AddPresenterState>;
  /** One bound Server Action per presenter, by member id (DEC-159: no closures across the boundary). */
  removeActions: Record<string, RemoveAction>;
}) {
  const t = useTranslations("schedule.presenters");
  const [state, formAction] = useActionState(addAction, initialAddPresenterState);
  const named = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

  const accepted = presenters.filter((p) => p.accepted);
  const presenting = new Set(accepted.map((p) => p.memberId));
  const pickable = members.filter((m) => !presenting.has(m.id));
  const nameOf = (id: string) => presenters.find((p) => p.memberId === id)?.displayName ?? members.find((m) => m.id === id)?.displayName ?? "";

  const error = state.status === "refused" ? t(`errors.${state.error}`) : undefined;

  return (
    <div className="space-y-5">
      {presenters.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {presenters.map((p) => {
            // «At least one presenter stays» is counted over accepted rows —
            // the same count `remove_session_presenter()` refuses on.
            const removable = !locked && !(p.accepted && accepted.length === 1);
            const name = p.displayName ?? "";
            return (
              <li key={p.memberId} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-edge px-4 py-3">
                <Avatar memberId={p.memberId} displayName={p.displayName} size={32} decorative />
                <span className="text-body text-fg-heading">
                  <bdi>{p.displayName}</bdi>
                </span>
                {p.declinedAt ? (
                  <Badge tone="ended" size="sm">
                    {t("declined")}
                  </Badge>
                ) : !p.accepted ? (
                  <Badge tone="neutral" outline size="sm">
                    {t("pending")}
                  </Badge>
                ) : null}
                {removable && removeActions[p.memberId] ? (
                  <span className="ms-auto">
                    <RemovePresenter
                      name={p.displayName}
                      action={removeActions[p.memberId]}
                      messages={{
                        trigger: t.rich("removeLabel", { name, t: named }),
                        title: t.rich("removeConfirmTitle", { name, t: named }),
                        body: completed && p.accepted ? t("removeConfirmBodyCompleted") : t("removeConfirmBody"),
                        confirm: t("removeConfirm"),
                        cancel: t("cancel"),
                      }}
                    />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!locked && accepted.length === 1 ? <p className="text-caption text-fg-muted">{t("onlyOne")}</p> : null}

      {locked ? null : (
      <form action={formAction} noValidate className="space-y-3">
        {completed ? <p className="text-body-sm text-fg-body">{t("completedNote")}</p> : null}
        {/* Remounted per outcome: an added member leaves the picker empty; a
            refused one is handed back as the admin chose it. */}
        <Field
          key={state.status === "idle" ? "idle" : `${state.status}:${state.memberId ?? ""}`}
          id="presenter-add"
          label={t("addLabel")}
          hint={t("addHint")}
          error={error}
        >
          <MemberPicker
            members={pickable}
            name="memberId"
            placeholder={t("placeholder")}
            noMatches={t("noMatches")}
            defaultValue={state.status === "refused" ? (state.memberId ?? undefined) : undefined}
          />
        </Field>
        <SubmitButton variant="secondary" size="md" pendingLabel={t("adding")}>
          {t("add")}
        </SubmitButton>
        {/* Always in the tree, so a screen reader hears the line when it fills. */}
        <p role="status" className="text-body-sm text-success empty:hidden">
          {state.status === "added" ? t.rich("added", { name: nameOf(state.memberId), t: named }) : null}
        </p>
      </form>
      )}
    </div>
  );
}
