"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hasAttempted, summaryErrors, was, wasList } from "@/lib/form-state";
import { PROPOSAL_FIELDS, PROPOSAL_REQUIRED_FIELDS, emptyProposeState, type ProposalField, type ProposeState } from "./state";

// SCR-017's form. A client component only because it renders field errors
// from `useActionState`; everything it needs is passed in, so it holds no
// data of its own.
//
// ★ REQ-PRO-001: there is no date input, no time input and no venue input
// here, and the schema behind it has no key for one either. The note above
// the fields says so out loud, because a member arriving from the pre-launch
// form will look for a date box and should be told why there isn't one
// rather than left to wonder.
//
// ★★ M9 — ADOPTION, NOT REDESIGN (`16` §8.2). The layout, the order and every
// string are unchanged. What has gone is this file's OWN `Field` component and
// its `const FIELD = "mt-2 block w-full rounded-field border …"` — one of the
// fourteen copies of that string in the product. What has arrived is the four
// things §8.2 asks of every form:
//
//   1  `<Field>` wires the aria, so this file no longer has an `aria()` helper
//      that each screen could get wrong in its own way.
//   2  required is marked «مطلوب» rather than inferred from the ABSENCE of
//      «اختياري» (REQ-UIX-011). This is the one visible change on the screen.
//   3  the errors are red, glyphed and bordered — not `text-fg-heading`, the
//      same colour as a heading, which is what they were.
//   4  ★ the summary LINKS to each field, which is ask 5 in one line. It used
//      to list sentences: a member with six problems read six sentences and
//      then went looking for six boxes.

const NO_FIXES: readonly ProposalField[] = [];

export type ProposalFormCategory = { id: string; name: string };
export type ProposalFormMember = { id: string; displayName: string | null; jobTitle: string | null };

/** Which catalogue key names each field in the summary. */
const LABEL_KEY: Record<ProposalField, string> = {
  title: "form.titleLabel",
  abstract: "form.abstractLabel",
  categoryId: "form.categoryLabel",
  level: "form.levelLabel",
  targetAudience: "form.audienceLabel",
  expectedDurationMinutes: "form.durationLabel",
  coPresenters: "form.coPresentersLabel",
  adminNotes: "form.notesLabel",
};

export function ProposalForm({
  action,
  categories,
  members,
  maxCoPresenters,
  maxCoPresentersLabel,
}: {
  action: (prev: ProposeState, formData: FormData) => Promise<ProposeState>;
  categories: ProposalFormCategory[];
  members: ProposalFormMember[];
  maxCoPresenters: number;
  maxCoPresentersLabel: string;
}) {
  const t = useTranslations("proposals.propose");
  const [state, formAction, pending] = useActionState(action, emptyProposeState);

  // ★ §8.2 item 5 — «inline validation on blur, AFTER THE FIRST SUBMIT ATTEMPT
  // ONLY». `hasAttempted()` is that fact, and it survives the round trip,
  // which a flag set in an onSubmit handler does not. The rule the register
  // form already uses is «reward early, punish late»: a field's error clears
  // the moment it looks fixed, and only comes back on BLUR if it is emptied
  // again — never while the member is still deleting a word.
  //
  // The set is STAMPED with the attempt it belongs to rather than cleared by
  // an effect: a new round trip makes the old set stale by comparison, with no
  // cascading render and nothing to keep in sync.
  const [fixes, setFixes] = useState<{ attempt: number; fields: readonly ProposalField[] }>({ attempt: 0, fields: [] });
  const fixed = fixes.attempt === state.attempt ? fixes.fields : NO_FIXES;

  const attempted = hasAttempted(state);
  const live = (field: ProposalField) => (fixed.includes(field) ? undefined : state.errors[field]);
  const err = (field: ProposalField) => {
    const key = live(field);
    return key ? t(`errors.${key}`) : undefined;
  };
  const current = (prev: { attempt: number; fields: readonly ProposalField[] }) =>
    prev.attempt === state.attempt ? prev.fields : NO_FIXES;
  const reward = (field: ProposalField) => (event: { currentTarget: { value: string } }) => {
    if (!attempted || !state.errors[field] || !event.currentTarget.value.trim()) return;
    setFixes((prev) => {
      const fields = current(prev);
      return { attempt: state.attempt, fields: fields.includes(field) ? fields : [...fields, field] };
    });
  };
  const punish = (field: ProposalField) => (event: { currentTarget: { value: string } }) => {
    if (!attempted || event.currentTarget.value.trim()) return;
    setFixes((prev) => ({ attempt: state.attempt, fields: current(prev).filter((f) => f !== field) }));
  };
  const validating = (field: ProposalField) => ({ onChange: reward(field), onBlur: punish(field) });
  const required = (field: ProposalField) => PROPOSAL_REQUIRED_FIELDS.includes(field);

  // ★ The summary is a record of ONE attempt and does not shrink as fields are
  // fixed. It is `role="alert"`: mutating it while the member types would
  // re-announce the whole list on every keystroke. The inline error clears —
  // that is the reward — and the summary is rebuilt by the next submit.
  const summary = summaryErrors(state, {
    fields: PROPOSAL_FIELDS,
    label: (field) => t(LABEL_KEY[field]),
    message: (key) => t(`errors.${key}`),
  });

  // Which control the member pressed, so `pending` appears on THAT one.
  // `useFormStatus` reports the nearest enclosing form and cannot tell two
  // submit buttons apart; this form has two.
  const [intent, setIntent] = useState<"submit" | "draft">("submit");

  return (
    <form action={formAction} noValidate className="mt-8 max-w-2xl space-y-7">
      {state.formError ? (
        // A failed WRITE, not a failed field: there is no control to link to,
        // so it is its own alert rather than an invented focus target. The two
        // are mutually exclusive by construction — `submitProposal` returns
        // field errors from the Zod branch and this from the catch.
        <FormError key={state.attempt} message={t(`errors.${state.formError}`)} />
      ) : (
        // `key` is what moves focus here on every failed round trip, including
        // two consecutive failures carrying identical errors.
        <FormSummary key={state.attempt} title={t("form.errorSummaryTitle")} errors={summary} />
      )}

      <Field id="title" label={t("form.titleLabel")} hint={t("form.titleHint")} error={err("title")} required={required("title")}>
        <Input name="title" required maxLength={150} defaultValue={was(state, "title")} {...validating("title")} />
      </Field>

      <Field id="abstract" label={t("form.abstractLabel")} hint={t("form.abstractHint")} error={err("abstract")} required={required("abstract")}>
        <Textarea name="abstract" required maxLength={2000} defaultValue={was(state, "abstract")} {...validating("abstract")} />
      </Field>

      <Field id="categoryId" label={t("form.categoryLabel")} error={err("categoryId")} required={required("categoryId")}>
        <Select name="categoryId" required defaultValue={was(state, "categoryId")} {...validating("categoryId")}>
          <option value="" disabled>
            {t("form.categoryPlaceholder")}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="level" label={t("form.levelLabel")} error={err("level")} required={required("level")}>
        <Select name="level" required defaultValue={was(state, "level") || "introductory"} {...validating("level")}>
          <option value="introductory">{t("form.levelIntroductory")}</option>
          <option value="intermediate">{t("form.levelIntermediate")}</option>
          <option value="advanced">{t("form.levelAdvanced")}</option>
        </Select>
      </Field>

      <Field id="targetAudience" label={t("form.audienceLabel")} hint={t("form.audienceHint")} error={err("targetAudience")}>
        <Input name="targetAudience" maxLength={300} defaultValue={was(state, "targetAudience")} {...validating("targetAudience")} />
      </Field>

      <Field
        id="expectedDurationMinutes"
        label={t("form.durationLabel")}
        hint={t("form.durationHint")}
        error={err("expectedDurationMinutes")}
      >
        <div className="flex items-center gap-3">
          {/* The box is dir="ltr" because a typed number enters left to right
              whatever the surrounding direction; the unit label keeps its
              place in the reading order because the row is a flex row, not a
              physical float. ★ This is the field that rules out cloneElement
              in `<Field>`: the child here is the row, not the control. */}
          <Input
            name="expectedDurationMinutes"
            type="number"
            inputMode="numeric"
            min={15}
            max={480}
            step={5}
            dir="ltr"
            defaultValue={was(state, "expectedDurationMinutes")}
            className="w-32 text-center"
            {...validating("expectedDurationMinutes")}
          />
          <span className="text-body text-fg-muted">{t("form.durationUnit")}</span>
        </div>
      </Field>

      {/* REQ-PRO-003. Checkboxes rather than a multi-select: a multi-select
          at 390 px is a scroll trap, and the count has to stay visible
          against the org's limit. The list comes from members_member_view, so
          it cannot show anyone outside the org — and the database refuses one
          anyway.
          ★ `id="coPresenters"` is how the summary's link reaches this group:
          a <fieldset> is not focusable, so the link focuses the first checkbox
          inside it. */}
      <fieldset id="coPresenters">
        <legend className="text-label text-fg-heading">{t("form.coPresentersLabel")}</legend>
        <p className="mt-1 text-caption text-fg-muted">{t("form.coPresentersHint")}</p>
        <p className="mt-1 text-caption text-fg-muted">{maxCoPresentersLabel}</p>
        {members.length === 0 ? (
          <p className="mt-3 text-caption text-fg-muted">{t("form.coPresentersNone")}</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {members.map((m) => (
              <li key={m.id}>
                <Checkbox
                  name="coPresenters"
                  value={m.id}
                  defaultChecked={wasList(state, "coPresenters").includes(m.id)}
                  disabled={maxCoPresenters === 0}
                  label={
                    <span>
                      <bdi>{m.displayName}</bdi>
                      {m.jobTitle ? (
                        <span className="text-fg-muted">
                          {" · "}
                          <bdi>{m.jobTitle}</bdi>
                        </span>
                      ) : null}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {err("coPresenters") ? (
          <p className="mt-2 flex items-start gap-2 text-caption text-error">
            <AlertCircleIcon className="mt-[0.2em]" />
            <span>{err("coPresenters")}</span>
          </p>
        ) : null}
      </fieldset>

      <Field id="adminNotes" label={t("form.notesLabel")} hint={t("form.notesHint")} error={err("adminNotes")}>
        <Textarea name="adminNotes" maxLength={2000} rows={3} defaultValue={was(state, "adminNotes")} {...validating("adminNotes")} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        {/* ★ Pending keeps the LABEL and adds a spinner beside it (REQ-UIX-007).
            «جارٍ الإرسال…» is still in use — as what is ANNOUNCED while the
            action is in flight, rather than as the label that replaces the one
            the member just pressed. */}
        <Button
          type="submit"
          name="intent"
          value="submit"
          onClick={() => setIntent("submit")}
          pending={pending && intent === "submit"}
          pendingLabel={t("form.submitting")}
          disabled={pending}
        >
          {t("form.submit")}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="draft"
          variant="secondary"
          onClick={() => setIntent("draft")}
          pending={pending && intent === "draft"}
          pendingLabel={t("form.submitting")}
          disabled={pending}
        >
          {t("form.saveDraft")}
        </Button>
      </div>
    </form>
  );
}

/**
 * The whole-form failure — «تعذّر حفظ مقترحك — حاول مرة أخرى…».
 *
 * Local to this form on purpose: `FormSummaryProps` has no slot for it, and
 * inventing a `fieldId` so it could travel in the summary would mean the link
 * focuses a control that has nothing to do with the failure.
 */
function FormError({ message }: { message: string }) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    region.current?.focus();
  }, []);
  return (
    <div
      ref={region}
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-2 rounded-field border border-error-border bg-error-bg p-4 text-caption text-error"
    >
      <AlertCircleIcon className="mt-[0.2em]" />
      <span>{message}</span>
    </div>
  );
}
