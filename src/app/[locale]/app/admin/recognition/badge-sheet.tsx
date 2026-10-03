"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import type { BadgeMetric, BadgeRule } from "@/lib/dal/scoring-admin";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { emptyRecognitionState, type RecognitionState } from "./state";

// SCR-054's badge sheet — REQ-REC-001: an admin CREATES and edits a badge, each with an Arabic name, a description, an
// award rule and a certificate flag. The artboard draws neither «شارة جديدة» nor these fields; `DEC-232` §5.2 keeps them
// (D5). `?badge=new` or `?badge=<id>`, in console's `EditorSurface`. Its «احفظ» is one `save_recognition()` call — the
// same one-transaction save as edit mode — and «حُفظ» / «لم يتغيّر شيء» are its receipt. Retiring is edit mode's switch;
// this sheet writes the badge's retirement back as it found it.

export interface BadgeSheetBadge {
  id: string;
  updatedAt: string;
  name: string;
  description: string | null;
  issuesCertificate: boolean;
  rule: BadgeRule;
  retired: boolean;
}

/** `evaluate_badges()`'s metrics (`scoring-admin.ts`'s `BADGE_METRICS`, which a client module cannot import). */
const METRICS: readonly BadgeMetric[] = ["check_ins_count", "sessions_delivered_count", "ratings_submitted_count", "streak_awards_count", "presenter_rating_avg", "manual"];
const FIELDS = ["name", "description", "metric", "gte", "avg", "minSessions"] as const;

export function BadgeSheet({ action, badge }: { action: (previous: RecognitionState, formData: FormData) => Promise<RecognitionState>; badge: BadgeSheetBadge | null }) {
  const t = useTranslations("recognition.admin");
  const tb = useTranslations("recognition.admin.badges");
  const toast = useToast();
  const router = useRouter();
  const [state, formAction] = useActionState<RecognitionState, FormData>(async (previous, formData) => {
    const result = await action(previous, formData);
    if (result.receipt) {
      const wrote = result.receipt.wrote.length > 0;
      toast.show({ title: wrote ? t("read.saved") : t("read.unchanged"), tone: wrote ? "success" : "info" });
      router.replace("/app/admin/recognition");
    }
    return result;
  }, emptyRecognitionState);

  const attempted = hasAttempted(state);
  const value = (field: string, stored: string) => (attempted ? was(state, field) : stored);
  const err = (field: string) => (state.errors[field] ? tb(`errors.${state.errors[field]}`) : undefined);
  const prefix = badge ? `badge-${badge.id}` : "badge-new";
  const stored = badge?.rule;
  const [metric, setMetric] = useState<BadgeMetric>((value("metric", stored?.metric ?? "check_ins_count") || "check_ins_count") as BadgeMetric);
  const labels: Record<string, string> = {
    name: tb("nameLabel"),
    description: tb("descriptionLabel"),
    metric: tb("metricLabel"),
    gte: tb("gteLabel"),
    avg: tb("avgLabel"),
    minSessions: tb("minSessionsLabel"),
  };

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="badgeId" value={badge?.id ?? ""} />
      <input type="hidden" name="updatedAt" value={badge?.updatedAt ?? ""} />
      <input type="hidden" name="retired" value={badge?.retired ? "true" : "false"} />
      {state.formError ? (
        <p role="alert" className="flex items-start gap-2 text-body-sm text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{t(`read.errors.${state.formError}`)}</span>
        </p>
      ) : (
        <FormSummary
          key={state.attempt}
          title={t("common.summaryTitle")}
          errors={summaryErrors(state, { fields: FIELDS, label: (f) => labels[f] ?? f, message: (key) => tb(`errors.${key}`), fieldId: (f) => `${prefix}-${f}` })}
        />
      )}
      <Field id={`${prefix}-name`} label={labels.name} required error={err("name")}>
        <Input name="name" maxLength={100} defaultValue={value("name", badge?.name ?? "")} />
      </Field>
      <Field id={`${prefix}-description`} label={labels.description} error={err("description")}>
        <Textarea name="description" rows={2} maxLength={300} defaultValue={value("description", badge?.description ?? "")} />
      </Field>
      <Field id={`${prefix}-metric`} label={labels.metric} required error={err("metric")}>
        <Select name="metric" value={metric} onChange={(e) => setMetric(e.target.value as BadgeMetric)}>
          {METRICS.map((m) => (
            <option key={m} value={m}>
              {tb(`metrics.${m}`)}
            </option>
          ))}
        </Select>
      </Field>
      {metric === "presenter_rating_avg" ? (
        <>
          <Field id={`${prefix}-avg`} label={labels.avg} required error={err("avg")}>
            <Input
              name="avg"
              inputMode="decimal"
              dir="ltr"
              className="w-28 text-center"
              defaultValue={value("avg", stored?.metric === "presenter_rating_avg" && stored.gte !== null ? String(stored.gte) : "4.5")}
            />
          </Field>
          <Field id={`${prefix}-minSessions`} label={labels.minSessions} required error={err("minSessions")}>
            <Input
              name="minSessions"
              inputMode="numeric"
              dir="ltr"
              className="w-28 text-center"
              defaultValue={value("minSessions", stored?.minSessions !== null && stored?.minSessions !== undefined ? String(stored.minSessions) : "3")}
            />
          </Field>
        </>
      ) : metric !== "manual" ? (
        <Field id={`${prefix}-gte`} label={labels.gte} required error={err("gte")}>
          <Input
            name="gte"
            inputMode="numeric"
            dir="ltr"
            className="w-28 text-center"
            defaultValue={value("gte", stored && stored.metric !== "manual" && stored.metric !== "presenter_rating_avg" && stored.gte !== null ? String(stored.gte) : "")}
          />
        </Field>
      ) : null}
      <Switch name="issuesCertificate" label={tb("certificateLabel")} defaultChecked={attempted ? was(state, "issuesCertificate") === "on" : (badge?.issuesCertificate ?? false)} />
      <SubmitButton pendingLabel={t("common.saving")}>{t("read.save")}</SubmitButton>
    </form>
  );
}
