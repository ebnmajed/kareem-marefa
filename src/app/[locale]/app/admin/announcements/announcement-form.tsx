"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ListEditorForm } from "@/components/admin/list-editor-form";
import { ANNOUNCEMENT_MAX, toLocalInput } from "@/components/announcements/rules";
import { formatNumber } from "@/components/sessions/numerals";
import { DateTime } from "@/components/ui/date-time";
import { Field } from "@/components/ui/field";
import { RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { AdminAnnouncement } from "@/lib/dal/announcements";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { ANNOUNCEMENT_FIELD_IDS, ANNOUNCEMENT_FIELDS, emptyAnnouncementState, type AnnouncementState } from "./state";

// The announcement's one form — create (`?new=1`) and edit (`?edit=<id>`), REQ-ADM-025. The text (≤ 500, counted), when
// it goes live — now or at a time on the org's wall clock — and an optional end. No explainer copy: one line says what
// an edit does NOT do once members were notified, because that changes what the admin does next.

export function AnnouncementForm({
  action,
  announcement,
  timeZone,
  closeHref,
}: {
  action: (prev: AnnouncementState, formData: FormData) => Promise<AnnouncementState>;
  announcement: AdminAnnouncement | null;
  timeZone: string;
  closeHref: string;
}) {
  const t = useTranslations("announcements");
  const [mode, setMode] = useState<"now" | "at">(announcement ? "at" : "now");
  const [length, setLength] = useState((announcement?.body ?? "").length);

  const storedPublish = announcement ? toLocalInput(announcement.publishedAt, timeZone) : "";
  const storedExpires = announcement?.expiresAt ? toLocalInput(announcement.expiresAt, timeZone) : "";
  const label = (field: (typeof ANNOUNCEMENT_FIELDS)[number]) =>
    ({ body: t("form.body"), publish: t("form.publish"), publishAt: t("form.publishAtLabel"), expiresAt: t("form.expiresAt") })[field];

  return (
    <ListEditorForm<AnnouncementState>
      action={action}
      emptyState={emptyAnnouncementState}
      closeHref={closeHref}
      savedLabel={t("saved")}
      failedMessage={(key) => t(`errors.${key}`)}
      summaryTitle={t("errorSummaryTitle")}
      summary={(state) => summaryErrors(state, { fields: ANNOUNCEMENT_FIELDS, label, message: (key) => t(`errors.${key}`), fieldId: (f) => ANNOUNCEMENT_FIELD_IDS[f] })}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
    >
      {(state) => {
        const retry = hasAttempted(state) && !state.saved;
        const error = (field: (typeof ANNOUNCEMENT_FIELDS)[number]) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
        return (
          <>
            {announcement?.announced ? <p className="text-body-sm text-fg-muted">{t("form.sent")}</p> : null}
            <div>
              <Field id={ANNOUNCEMENT_FIELD_IDS.body} label={t("form.body")} required error={error("body")}>
                <Textarea
                  name="body"
                  rows={5}
                  maxLength={ANNOUNCEMENT_MAX}
                  defaultValue={retry ? was(state, "body") : (announcement?.body ?? "")}
                  onChange={(e) => setLength(e.currentTarget.value.length)}
                />
              </Field>
              {/* The count, read when it changes — Western digits (DEC-124), each figure isolated. */}
              <p className="mt-1 text-end text-caption text-fg-muted" aria-live="polite">
                {t.rich("form.counter", { used: formatNumber(length), max: formatNumber(ANNOUNCEMENT_MAX), bdi: (c) => <bdi>{c}</bdi> })}
              </p>
            </div>

            <RadioGroup
              name="publish"
              legend={t("form.publish")}
              appearance="chips"
              value={mode}
              onChange={(v) => setMode(v === "at" ? "at" : "now")}
              options={[
                { value: "now", label: t("form.publishNow") },
                { value: "at", label: t("form.publishAt") },
              ]}
            />
            {mode === "at" ? (
              <Field id={ANNOUNCEMENT_FIELD_IDS.publishAt} label={t("form.publishAtLabel")} required error={error("publishAt")}>
                <DateTime name="publishAt" label={t("form.publishAtLabel")} defaultValue={retry ? was(state, "publishAt") : storedPublish} />
              </Field>
            ) : null}

            <Field id={ANNOUNCEMENT_FIELD_IDS.expiresAt} label={t("form.expiresAt")} error={error("expiresAt")}>
              <DateTime name="expiresAt" label={t("form.expiresAt")} defaultValue={retry ? was(state, "expiresAt") : storedExpires} />
            </Field>
          </>
        );
      }}
    </ListEditorForm>
  );
}
