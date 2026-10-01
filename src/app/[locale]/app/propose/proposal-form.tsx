"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { checkProposalField, PROPOSAL_LIMITS, PROPOSAL_REQUIRED, type ProposalScalarField } from "@/components/sessions/proposal-rules";
import { ActionBar } from "@/components/ui/action-bar";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { emptyFormState, hasAttempted, summaryErrors, was, wasList } from "@/lib/form-state";
import { PROPOSAL_FIELDS, emptyProposeState, type ProposalField, type ProposeState } from "./state";

// SCR-017's form — rebuilt from `Propose.dc.html` (REQ-UIX-067, DEC-213, DEC-214), written after the old file was
// deleted (DEC-208). The kept-behaviour table it answers to is `docs/plan/notes/sessions.md` W19.2.
//
// The artboard's order, inside the form: the summary (only after a failed submit), the progress line, section 1
// «الموضوع» (title, abstract, category, level as three chips, audience, duration), section 2 «المُقدِّمون
// والملاحظات» (co-presenters, notes, the materials note), the earn panel the page hands in, and the sticky bar.
//
// ★ REQ-PRO-001: no date, time or venue control exists here, and the schema has no key for one.
//
// ★ THE BAR IS INSIDE THE FORM, so its two `name="intent"` buttons submit it with no `form=` attribute; it is
// fixed below `lg`, standing on the tab bar (`--stacked-bar-offset`, DEC-214 §3), the shell padding `<main>` and the
// scroll padding for the pair so no focused field sits behind it (REQ-UIX-017); from `lg` it is in flow.
//
// ★ The form model is unchanged from wave 7 (`16` §8.2, REQ-UIX-009 … 011): blur checks every field after the first
// submit through `checkProposalField()` (the browser's mirror of `proposalInput`); typing clears an error the moment
// the value passes; the summary lists exactly the errors on the page, in the page's order, and takes focus once per
// failed round trip; every typed value comes back through `lib/form-state` because React resets the form.
//
// ★ «مطلوب» on the four the schema needs and no «(اختياري)» marker (REQ-UIX-011 wins, DEC-214 D6). The duration's
// step stays 5 (D5). No autosave and no «مسودة محفوظة» line (DEC-213 §5.93).

const SECTION_TOPIC = "section-topic";
const SECTION_PEOPLE = "section-people";

export type ProposalFormCategory = { id: string; name: string };
export type ProposalFormMember = { id: string; displayName: string | null; jobTitle: string | null; teamColor?: string | null };

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

/** The level's own default, so «المتبقّي» never counts a field that cannot be empty. */
const LEVEL_DEFAULT = "introductory";
const LEVELS = [
  { value: "introductory", key: "form.levelIntroductory" },
  { value: "intermediate", key: "form.levelIntermediate" },
  { value: "advanced", key: "form.levelAdvanced" },
] as const;

/** A value STAMPED with the round trip it belongs to: a new attempt makes it stale by comparison, not by an effect. */
type Stamped<T> = { attempt: number; value: T };

/**
 * `create` is SCR-017. `edit` is its resubmit state on `/app/propose/[id]/edit` (DEC-141, `M10b.md` §3): the same
 * fields pre-filled; co-presenters are managed on the proposal's own page; a change request can only be resubmitted.
 */
export type ProposalFormMode =
  | { mode: "create"; members: ProposalFormMember[]; maxCoPresenters: number; maxCoPresentersLabel: string }
  | { mode: "edit"; initial: Partial<Record<ProposalField, string>>; allowDraft: boolean };

export function ProposalForm({
  action,
  categories,
  earn,
  ...variant
}: {
  action: (prev: ProposeState, formData: FormData) => Promise<ProposeState>;
  categories: ProposalFormCategory[];
  /** The earn panel, built by the page from the scoring rules — absent when it would say zero (DEC-213 §5.96). */
  earn?: ReactNode;
} & ProposalFormMode) {
  const t = useTranslations("proposals.propose");
  const tUi = useTranslations("ui.field");
  const [state, formAction, pending] = useActionState(
    action,
    variant.mode === "edit" ? { ...emptyFormState<ProposalField>(), values: variant.initial } : emptyProposeState,
  );
  const allowDraft = variant.mode === "create" || variant.allowDraft;
  const attempted = hasAttempted(state);

  const [checked, setChecked] = useState<Stamped<Partial<Record<ProposalField, string | null>>>>({ attempt: 0, value: {} });
  const [typed, setTyped] = useState<Stamped<Partial<Record<ProposalScalarField, string>>>>({ attempt: 0, value: {} });
  const fresh = <T,>(s: Stamped<T>, empty: T): T => (s.attempt === state.attempt ? s.value : empty);

  /** The key showing for a field: the browser's latest word, else the server's. */
  const shownKey = (field: ProposalField): string | undefined => {
    const overlay = fresh(checked, {});
    return field in overlay ? (overlay[field] ?? undefined) : state.errors[field];
  };
  const err = (field: ProposalField) => {
    const key = shownKey(field);
    return key ? t(`errors.${key}`) : undefined;
  };
  const record = (field: ProposalField, key: string | null) =>
    setChecked((prev) => ({ attempt: state.attempt, value: { ...fresh(prev, {}), [field]: key } }));

  /** What is in the box now — typed since the round trip, else what came back. */
  const current = (field: ProposalScalarField) => {
    const values = fresh(typed, {});
    if (field in values) return values[field] ?? "";
    return field === "level" ? was(state, field) || LEVEL_DEFAULT : was(state, field);
  };

  const typedValue = (field: ProposalScalarField, value: string) => {
    setTyped((prev) => ({ attempt: state.attempt, value: { ...fresh(prev, {}), [field]: value } }));
    // Reward early: a showing error goes the moment the value passes.
    if (attempted && shownKey(field) && checkProposalField(field, value) === null) record(field, null);
  };
  const onChange = (field: ProposalScalarField) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    typedValue(field, event.currentTarget.value);
  const onBlur = (field: ProposalScalarField) => (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    // Punish late, and never before a submit (REQ-UIX-011).
    if (!attempted) return;
    record(field, checkProposalField(field, event.currentTarget.value));
  };
  const validating = (field: ProposalScalarField) => ({ onChange: onChange(field), onBlur: onBlur(field) });
  const required = (field: ProposalField) => (PROPOSAL_REQUIRED as readonly string[]).includes(field);

  const remaining = PROPOSAL_REQUIRED.filter((field) => checkProposalField(field, current(field)) !== null).length;

  // ★ The summary lists exactly the errors on the page (wave 7, sync 2): the server's refusals as the browser has
  // since revised them. Focus moves to it only when a submit mounts it (`key={state.attempt}`).
  const shown = Object.fromEntries(
    PROPOSAL_FIELDS.flatMap((field) => {
      const key = shownKey(field);
      return key ? [[field, key]] : [];
    }),
  ) as Partial<Record<ProposalField, string>>;
  const summary = summaryErrors(
    { ...state, errors: shown },
    { fields: PROPOSAL_FIELDS, label: (field) => t(LABEL_KEY[field]), message: (key) => t(`errors.${key}`) },
  );

  // Which control the member pressed, so `pending` appears on THAT one: `useFormStatus` cannot tell two submit
  // buttons of one form apart.
  const [intent, setIntent] = useState<"submit" | "draft">("submit");

  /** «41 من 150» under a text control — its description, never announced as it changes. */
  const counter = (field: "title" | "abstract", max: number) => (
    <p id={`${field}-count`} className="mt-1.5 text-end text-caption text-fg-muted">
      {t("form.charCount", { value: formatNumber(current(field).length), max: formatNumber(max) })}
    </p>
  );

  /** A section's heading with its number disc — the first in the accent, as drawn. */
  const heading = (id: string, n: number, label: string) => (
    <h2 id={id} className="flex items-center gap-2 font-display text-play-sm font-extrabold text-fg-heading">
      <span
        aria-hidden
        className={`inline-flex size-[1.625rem] shrink-0 items-center justify-center rounded-full text-label ${n === 1 ? "bg-accent text-on-accent" : "bg-raised text-fg-heading"}`}
      >
        {formatNumber(n)}
      </span>
      {label}
    </h2>
  );

  return (
    <form action={formAction} noValidate className="mt-4 flex flex-col gap-6">
      {state.formError ? (
        // A failed WRITE, not a failed field: its own alert, focused.
        <FormError key={state.attempt} message={t(`errors.${state.formError}`)} />
      ) : (
        <FormSummary
          key={state.attempt}
          title={t("form.errorSummaryCount", { count: summary.length, value: formatNumber(summary.length) })}
          description={t("form.errorSummaryDescription", { count: summary.length })}
          errors={summary}
        />
      )}

      {/* The progress line: how many required fields are still unfinished. Not a live region — the summary is the
          announcement; the bar beside the words is decorative. */}
      <div className="flex items-center gap-2 text-caption text-fg-muted">
        {/* ★ The bar's width is its BOX's, not a class on the bar: `ProgressBar` is `w-full`, and a second width
            class on it lost to that one — the bar took the whole row, could not shrink, and pushed the line 42 px
            past the viewport at 390 (gate run 2). */}
        <div className="w-[5.625rem] shrink-0">
          <ProgressBar decorative size="sm" value={PROPOSAL_REQUIRED.length - remaining} max={PROPOSAL_REQUIRED.length} />
        </div>
        <p>{t("form.remaining", { count: remaining, value: formatNumber(remaining) })}</p>
      </div>

      <section aria-labelledby={SECTION_TOPIC} className="flex flex-col gap-4">
        {heading(SECTION_TOPIC, 1, t("form.sectionTopic"))}

        <Field id="title" label={t("form.titleLabel")} hint={t("form.titleHint")} error={err("title")} required={required("title")}>
          <Input name="title" required maxLength={PROPOSAL_LIMITS.titleMax} defaultValue={was(state, "title")} aria-describedby="title-count" {...validating("title")} />
          {counter("title", PROPOSAL_LIMITS.titleMax)}
        </Field>

        <Field id="abstract" label={t("form.abstractLabel")} hint={t("form.abstractHint")} error={err("abstract")} required={required("abstract")}>
          <Textarea
            name="abstract"
            required
            rows={4}
            maxLength={PROPOSAL_LIMITS.abstractMax}
            defaultValue={was(state, "abstract")}
            aria-describedby="abstract-count"
            {...validating("abstract")}
          />
          {counter("abstract", PROPOSAL_LIMITS.abstractMax)}
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

        {/* Three chips, one real radio each (`Propose.dc.html`). Controlled, so React's form reset never moves it. */}
        <RadioGroup
          name="level"
          legend={t("form.levelLabel")}
          appearance="chips"
          required={required("level")}
          requiredLabel={tUi("required")}
          options={LEVELS.map((l) => ({ value: l.value, label: t(l.key) }))}
          value={current("level")}
          onChange={(value) => typedValue("level", value)}
          error={err("level")}
        />

        <Field id="targetAudience" label={t("form.audienceLabel")} hint={t("form.audienceHint")} error={err("targetAudience")}>
          <Input name="targetAudience" maxLength={PROPOSAL_LIMITS.audienceMax} defaultValue={was(state, "targetAudience")} {...validating("targetAudience")} />
        </Field>

        <Field id="expectedDurationMinutes" label={t("form.durationLabel")} hint={t("form.durationHint")} error={err("expectedDurationMinutes")}>
          <div className="flex items-center gap-2.5">
            {/* `dir="ltr"`: a typed number enters left to right whatever the page; the unit keeps its place in the
                reading order because the row is a flex row, not a float — the number sits to its right in RTL. */}
            <Input
              name="expectedDurationMinutes"
              type="number"
              inputMode="numeric"
              min={PROPOSAL_LIMITS.durationMin}
              max={PROPOSAL_LIMITS.durationMax}
              step={5}
              dir="ltr"
              defaultValue={was(state, "expectedDurationMinutes")}
              className="w-[7.5rem] text-center"
              {...validating("expectedDurationMinutes")}
            />
            <span className="text-body text-fg-muted">{t("form.durationUnit")}</span>
          </div>
        </Field>
      </section>

      <section aria-labelledby={SECTION_PEOPLE} className="flex flex-col gap-4">
        {heading(SECTION_PEOPLE, 2, variant.mode === "create" ? t("form.sectionPeople") : t("form.sectionNotes"))}

        {/* REQ-PRO-003, REQ-UIX-008 — a search, not a list of everyone: Arabic-normalised over names and titles, the
            chosen as removable chips with their team ring, stopping at the org's limit. The selection is hidden inputs
            named `coPresenters`, so `getAll()`, the action and `state.ts` are unchanged and it survives a failed round
            trip. `id="coPresenters"` is the summary link's target. A resubmit names nobody new here. */}
        {variant.mode === "create" ? (
          <Field id="coPresenters" label={t("form.coPresentersLabel")} hint={t("form.coPresentersHint")} error={err("coPresenters")}>
            {variant.members.length === 0 ? (
              <p className="text-caption text-fg-muted">{t("form.coPresentersNone")}</p>
            ) : (
              <Combobox
                name="coPresenters"
                multiple
                max={variant.maxCoPresenters}
                options={variant.members.map((m) => ({ value: m.id, label: m.displayName ?? "", hint: m.jobTitle ?? undefined, teamColor: m.teamColor ?? null }))}
                defaultValue={wasList(state, "coPresenters")}
                placeholder={t("form.coPresentersPlaceholder")}
              />
            )}
            <p className="mt-1.5 text-caption text-fg-muted">{variant.maxCoPresentersLabel}</p>
          </Field>
        ) : (
          <p className="text-body-sm text-fg-muted">{t("form.presentersElsewhere")}</p>
        )}

        <Field id="adminNotes" label={t("form.notesLabel")} hint={t("form.notesHint")} error={err("adminNotes")}>
          <Textarea name="adminNotes" maxLength={PROPOSAL_LIMITS.notesMax} rows={3} defaultValue={was(state, "adminNotes")} {...validating("adminNotes")} />
        </Field>

        {/* REQ-PRO-004: where the draft materials go, since this form cannot hold them. */}
        {variant.mode === "create" ? (
          <p className="rounded-tile border border-dashed border-edge px-3 py-2.5 text-body-sm text-fg-muted">{t("form.materialsNote")}</p>
        ) : null}
      </section>

      {earn}

      {/* Below `lg` fixed and stacked on the tab bar; from `lg` in flow at the end of the form (DEC-214 §3). */}
      <ActionBar
        label={t("form.actionsLabel")}
        className="lg:static lg:border-t-0 lg:bg-transparent lg:px-0"
        primary={
          // ★ Pending keeps the LABEL and adds a spinner (REQ-UIX-007); «جارٍ الإرسال…» is what is announced.
          <Button
            type="submit"
            name="intent"
            value="submit"
            size="lg"
            className="w-full"
            onClick={() => setIntent("submit")}
            pending={pending && intent === "submit"}
            pendingLabel={t("form.submitting")}
            disabled={pending}
          >
            {allowDraft ? t("form.submit") : t("form.resubmit")}
          </Button>
        }
        // The draft button is the drawn quiet one — the body's size, not the CTA's: at 390 px a second display-face
        // label pushed the fixed bar 42 px past the viewport, and the whole page scrolled sideways with it.
        secondary={
          allowDraft
            ? [
                <Button
                  key="draft"
                  type="submit"
                  name="intent"
                  value="draft"
                  variant="secondary"
                  size="md"
                  className="whitespace-nowrap"
                  onClick={() => setIntent("draft")}
                  pending={pending && intent === "draft"}
                  pendingLabel={t("form.submitting")}
                  disabled={pending}
                >
                  {t("form.saveDraft")}
                </Button>,
              ]
            : undefined
        }
      />
    </form>
  );
}

/** The whole-form failure — «تعذّر حفظ مقترحك…». Its own alert: there is no control to link to. */
function FormError({ message }: { message: string }) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    region.current?.focus();
  }, []);
  return (
    <div ref={region} role="alert" tabIndex={-1} className="flex items-start gap-2 rounded-field border border-error-border bg-error-bg p-4 text-caption text-error">
      <AlertCircleIcon className="mt-[0.2em]" />
      <span>{message}</span>
    </div>
  );
}
