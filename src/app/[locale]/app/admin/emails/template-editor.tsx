"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { useActionToast } from "@/components/admin/use-action-toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import type { TemplateDTO } from "@/lib/dal/notifications";

// SCR-058's template editor — REQ-NTF-007. What it does today, on the form
// model: a subject, a body and the required fields, and the trigger's refusal
// at the field it names. NOT the email studio (`16` §11, M12, `notify`'s):
// no blocks, no preview, no «أرسل اختبارًا».
//
// A refusal used to redirect with a banner and re-render the form from the
// database — the admin lost everything they typed — and restoring the default
// deleted the org's template with one press. The form now keeps what was typed
// and the restore confirms, naming the message and saying the template cannot
// be recovered.
//
// ★ Two gaps this screen states rather than hides, both the email studio's to
// close (the lead's sync-1 ruling Q2): the default text is not shown, so an org
// template starts from blank; and the required fields are what the admin
// declares, not what the message needs.

type Action = (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
const IDS: Record<string, string> = { subject: "template-subject", body: "template-body", requiredFields: "template-required" };

export function TemplateEditor({
  messageKey,
  name,
  template,
  action,
  restore,
}: {
  messageKey: string;
  name: string;
  template: TemplateDTO | null;
  action: Action;
  restore: (templateId: string) => Promise<void>;
}) {
  const t = useTranslations("notifications.admin.emails.editor");
  const toast = useToast();
  const router = useRouter();
  const [state, dispatch] = useActionToast<SavedFormState>(action, emptySavedState(), (result) =>
    result.saved ? { title: t("saved"), tone: "success" } : result.formError ? { title: t(`errors.${result.formError}`), tone: "error" } : null,
  );
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const attempted = hasAttempted(state);
  const value = (field: string, stored: string) => (attempted ? was(state, field) : stored);
  const err = (field: string) => {
    const key = state.errors[field];
    if (!key) return undefined;
    return key === "missingRequiredField" ? t.markup("errors.missingRequiredField", { field: state.values.missingField ?? "", bdi: (chunks) => chunks }) : t(`errors.${key}`);
  };
  const labels: Record<string, string> = { subject: t("subject"), body: t("body"), requiredFields: t("requiredFields") };

  async function restoreDefault() {
    if (!template) return;
    setRestoring(true);
    try {
      await restore(template.id);
      setConfirming(false);
      toast.show({ title: t("restored"), tone: "success" });
      router.refresh();
    } catch {
      toast.show({ title: t("restoreFailed"), tone: "error" });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <Panel tone="info" className="max-w-2xl">
        <p className="text-body-sm text-fg-body">{template ? t("overridden") : t("usingDefault")}</p>
      </Panel>

      <form key={template?.updatedAt ?? "default"} action={dispatch} noValidate className="mt-6 max-w-2xl space-y-5">
        {attempted ? (
          <FormSummary
            key={state.attempt}
            title={t("summaryTitle")}
            errors={summaryErrors(state, { fields: ["subject", "body", "requiredFields"], label: (f) => labels[f], message: (key) => (key === "missingRequiredField" ? (err("body") ?? "") : t(`errors.${key}`)), fieldId: (f) => IDS[f] })}
          />
        ) : null}
        <input type="hidden" name="key" value={messageKey} />
        <Field id={IDS.subject} label={t("subject")} required error={err("subject")}>
          <Input name="subject" maxLength={200} defaultValue={value("subject", template?.subject ?? "")} />
        </Field>
        <Field id={IDS.body} label={t("body")} hint={t("bodyHint")} required error={err("body")}>
          {/* No `overflow: hidden` near a text line — it clips tashkeel (10 §2). A textarea scrolls. */}
          <Textarea name="body" rows={10} maxLength={20000} className="leading-[1.7]" defaultValue={value("body", template?.body ?? "")} />
        </Field>
        <Field id={IDS.requiredFields} label={t("requiredFields")} hint={t("requiredFieldsHint")} error={err("requiredFields")}>
          <Input name="requiredFields" dir="ltr" defaultValue={value("requiredFields", (template?.requiredFields ?? []).join(", "))} />
        </Field>
        {state.formError ? (
          <p className="flex items-start gap-2 text-body-sm text-error">
            <AlertCircleIcon className="mt-[0.2em]" />
            <span>{t(`errors.${state.formError}`)}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel={t("saving")}>{t("save")}</SubmitButton>
          {template ? (
            <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
              {t("restore")}
            </Button>
          ) : null}
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t.rich("restoreTitle", { name, bdi })}
        body={<p>{t("restoreBody")}</p>}
        confirmLabel={t("restoreConfirm")}
        cancelLabel={t("cancel")}
        closeLabel={t("close")}
        pending={restoring}
        onConfirm={restoreDefault}
      />
    </>
  );
}
