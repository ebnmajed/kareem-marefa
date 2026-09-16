"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { MemberPicker, type PickableMember } from "@/components/admin/member-picker";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { useActionToast } from "@/components/admin/use-action-toast";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";

// SCR-053's manual adjustment — REQ-PTS-009: a reason is mandatory, and the
// entry lands in the member's history and the audit log.
//
// ★ Two things the old form got wrong in an RTL, append-only world. The
// direction was a minus sign typed into a right-to-left number box («سالب
// للخصم»); it is now a choice — «إضافة نقاط» or «خصم نقاط» — and the amount is
// always positive. And the write was one press with no confirmation, into a
// ledger nobody can edit (invariant 9): a mistyped «500» for «50» could only be
// corrected by a second, opposite entry. It now confirms, naming the member,
// the amount and the reason (`REQ-UIX-013`). A form with something missing goes
// straight to the server, which says what is missing at the field.

type Action = (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
const FIELDS = ["memberId", "direction", "amount", "reason"] as const;
const IDS: Record<string, string> = { memberId: "adjust-member", direction: "direction", amount: "adjust-amount", reason: "adjust-reason" };
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

export function ManualAdjustmentForm({ action, members }: { action: Action; members: PickableMember[] }) {
  const t = useTranslations("scoring.admin.manual");
  const formRef = useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = useState(0);
  const [confirm, setConfirm] = useState<{ name: string; amount: number; deduct: boolean; reason: string } | null>(null);
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
  const err = (field: string) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const labels: Record<string, string> = { memberId: t("memberLabel"), direction: t("directionLegend"), amount: t("amountLabel"), reason: t("reasonLabel") };

  function review() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const memberId = String(data.get("memberId") ?? "");
    const amount = Number(String(data.get("amount") ?? "").trim());
    const reason = String(data.get("reason") ?? "").trim();
    const member = members.find((m) => m.id === memberId);
    // Anything missing or malformed goes to the server, which refuses it at
    // the field; only a complete adjustment is worth confirming.
    if (!member || !Number.isInteger(amount) || amount < 1 || amount > 100000 || reason === "" || reason.length > 300) {
      form.requestSubmit();
      return;
    }
    setConfirm({ name: member.displayName ?? member.email, amount, deduct: data.get("direction") === "deduct", reason });
  }

  return (
    <>
      <form key={resetKey} ref={formRef} action={dispatch} noValidate className="max-w-xl space-y-5">
        {attempted ? (
          <FormSummary
            key={state.attempt}
            title={t("summaryTitle")}
            errors={summaryErrors(state, { fields: FIELDS, label: (field) => labels[field], message: (key) => t(`errors.${key}`), fieldId: (field) => IDS[field] })}
          />
        ) : null}
        <Field id="adjust-member" label={t("memberLabel")} required error={err("memberId")}>
          <MemberPicker members={members} name="memberId" placeholder={t("memberPlaceholder")} noMatches={t("noMatches")} defaultValue={attempted ? was(state, "memberId") || undefined : undefined} />
        </Field>
        <RadioGroup
          name="direction"
          legend={t("directionLegend")}
          defaultValue={attempted ? was(state, "direction") || "add" : "add"}
          options={[
            { value: "add", label: t("add") },
            { value: "deduct", label: t("deduct") },
          ]}
        />
        <Field id="adjust-amount" label={t("amountLabel")} hint={t("amountHint")} required error={err("amount")}>
          <Input name="amount" type="number" inputMode="numeric" min={1} max={100000} step={1} dir="ltr" className="w-40 text-center" defaultValue={attempted ? was(state, "amount") : ""} />
        </Field>
        <Field id="adjust-reason" label={t("reasonLabel")} hint={t("reasonHint")} required error={err("reason")}>
          <Textarea name="reason" rows={3} maxLength={300} defaultValue={attempted ? was(state, "reason") : ""} />
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
        title={
          confirm
            ? t.rich(confirm.deduct ? "confirmDeductTitle" : "confirmAddTitle", { count: confirm.amount, value: formatNumber(confirm.amount), name: confirm.name, bdi })
            : ""
        }
        body={<p>{t("confirmBody")}</p>}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        closeLabel={t("close")}
        tone={confirm?.deduct ? "danger" : "primary"}
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
