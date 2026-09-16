"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { MemberPicker, type PickableMember } from "@/components/admin/member-picker";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { useActionToast } from "@/components/admin/use-action-toast";
import { formatDateTime } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";

// SCR-054's manual award — REQ-REC-001: «manually awarding a badge requires a
// reason and is audited».
//
// It took the member as a typed UUID (`DEC-050` gave the scoring screen a
// picker and this one never got it). And it called an award «saved» when the
// member already held the badge: `award_badge_manually()` does nothing then,
// but still writes an audit row. The member is now picked by name, the award is
// confirmed by badge and member — a badge cannot be withdrawn once given — and
// a badge already held is said at the member field, naming the badge and since
// when, before anything is written — with the badge still chosen (React's
// reset after the refusal used to put the select back to «اختر شارة»; `ui/select`
// keeps it since `dcd5f05`).

type Action = (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
const IDS: Record<string, string> = { memberId: "award-member", badgeId: "award-badge", reason: "award-reason" };

export function AwardForm({ action, members, badges, timeZone, locale }: { action: Action; members: PickableMember[]; badges: { id: string; name: string }[]; timeZone: string; locale: string }) {
  const t = useTranslations("recognition.admin.award");
  const tc = useTranslations("recognition.admin.common");
  const formRef = useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = useState(0);
  const [confirm, setConfirm] = useState<{ name: string; badge: string; reason: string } | null>(null);
  const [state, dispatch, pending] = useActionToast<SavedFormState>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.saved) setResetKey((k) => k + 1);
      return result;
    },
    emptySavedState(),
    (result) => (result.saved ? { title: t("saved"), tone: "success" } : result.formError ? { title: t(`errors.${result.formError}`), tone: "error" } : null),
  );
  const attempted = hasAttempted(state);
  const since = state.values.alreadyHeldSince;
  // The refusal names the badge: the server's name for it, else the one chosen.
  const heldBadge = state.values.alreadyHeldBadge || badges.find((b) => b.id === was(state, "badgeId"))?.name || "";
  // The summary's message is a string; the field's error is a node, so the badge and the date it quotes are isolated.
  const errText = (field: string) => {
    const key = state.errors[field];
    if (!key) return undefined;
    return key === "alreadyHeld" && since
      ? t.markup("errors.alreadyHeld", { badge: heldBadge, since: formatDateTime(since, timeZone, locale), bdi: (chunks) => chunks })
      : t(`errors.${key}`);
  };
  const err = (field: string) =>
    state.errors[field] === "alreadyHeld" && since ? t.rich("errors.alreadyHeld", { badge: heldBadge, since: formatDateTime(since, timeZone, locale), bdi }) : errText(field);
  const labels: Record<string, string> = { memberId: t("memberLabel"), badgeId: t("badgeLabel"), reason: t("reasonLabel") };

  function review() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const member = members.find((m) => m.id === data.get("memberId"));
    const badge = badges.find((b) => b.id === data.get("badgeId"));
    const reason = String(data.get("reason") ?? "").trim();
    if (!member || !badge || reason === "" || reason.length > 300) {
      form.requestSubmit();
      return;
    }
    setConfirm({ name: member.displayName ?? member.email, badge: badge.name, reason });
  }

  return (
    <>
      <form key={resetKey} ref={formRef} action={dispatch} noValidate className="max-w-xl space-y-5">
        {attempted ? (
          <FormSummary
            key={state.attempt}
            title={t("summaryTitle")}
            errors={summaryErrors(state, {
              fields: ["memberId", "badgeId", "reason"],
              label: (f) => labels[f],
              message: (key) => (key === "alreadyHeld" ? (errText("memberId") ?? t(`errors.${key}`)) : t(`errors.${key}`)),
              fieldId: (f) => IDS[f],
            })}
          />
        ) : null}
        <Field id="award-member" label={t("memberLabel")} required error={err("memberId")}>
          <MemberPicker members={members} name="memberId" placeholder={t("memberPlaceholder")} noMatches={t("noMatches")} defaultValue={attempted ? was(state, "memberId") || undefined : undefined} />
        </Field>
        <Field id="award-badge" label={t("badgeLabel")} required error={err("badgeId")}>
          <Select name="badgeId" defaultValue={attempted ? was(state, "badgeId") : ""}>
            <option value="">{t("badgeChoose")}</option>
            {badges.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="award-reason" label={t("reasonLabel")} required error={err("reason")}>
          <Textarea name="reason" rows={2} maxLength={300} defaultValue={attempted ? was(state, "reason") : ""} />
        </Field>
        {state.formError ? (
          <p className="flex items-start gap-2 text-body-sm text-error">
            <AlertCircleIcon className="mt-[0.2em]" />
            <span>{t(`errors.${state.formError}`)}</span>
          </p>
        ) : null}
        <Button type="button" pending={pending} pendingLabel={t("saving")} onClick={review}>
          {t("submit")}
        </Button>
      </form>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm ? t.rich("confirmTitle", { badge: confirm.badge, name: confirm.name, bdi }) : ""}
        body={<p>{t("confirmBody")}</p>}
        confirmLabel={t("confirm")}
        cancelLabel={tc("cancel")}
        closeLabel={tc("close")}
        tone="primary"
        onConfirm={() => {
          setConfirm(null);
          formRef.current?.requestSubmit();
        }}
      >
        {confirm ? <p className="text-body-sm text-fg-muted">{t.rich("confirmReason", { reason: confirm.reason, bdi })}</p> : null}
      </ConfirmDialog>
    </>
  );
}
