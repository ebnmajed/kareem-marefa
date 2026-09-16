"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent, type FocusEvent } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { checkProposalField, PROPOSAL_LIMITS, PROPOSAL_REQUIRED, type ProposalScalarField } from "@/components/sessions/proposal-rules";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { emptyFormState, hasAttempted, summaryErrors, was, wasList } from "@/lib/form-state";
import { PROPOSAL_FIELDS, emptyProposeState, type ProposalField, type ProposeState } from "./state";

// SCR-017's form. A client component because it renders field errors from
// `useActionState` and checks a field on blur; everything it needs is passed
// in, so it holds no data of its own.
//
// ★ REQ-PRO-001: there is no date input, no time input and no venue input
// here, and the schema behind it has no key for one either. The note beside
// the buttons says so out loud, because a member arriving from the pre-launch
// form will look for a date box and should be told why there isn't one.
//
// ★★ WAVE 7 — the form model, finished (`16` §8.2, REQ-UIX-009 … 011):
//
//   · BLUR CHECKS EVERY FIELD, not only the ones the server already refused.
//     M9's blur could only re-show a server error, so a field that passed at
//     submit and was emptied afterwards said nothing until the next submit.
//     Now blur runs `checkProposalField()` — the browser's mirror of
//     `proposalInput`, pinned to it by a unit test — and returns the same
//     message key the action would. Still AFTER THE FIRST SUBMIT ONLY
//     (REQ-UIX-011): nothing is invalid before the member has tried.
//   · «REWARD EARLY, PUNISH LATE», unchanged in spirit: typing clears a
//     showing error the moment the value passes; only blur adds one.
//   · TWO SECTIONS AND «المتبقّي» (`16` §8.2 item 7, DEC-141 ruling 7). The
//     canvas's three steps had objectives and tags in the middle, which have no
//     columns; two sections remain, and the count of required fields still
//     unfinished sits above them. It is not a live region — a count announced
//     on every keystroke is noise, and the summary is the announcement.
//   · THE SUMMARY COUNTS AND REASSURES — «لم نستطع إرسال المقترح — حقلان
//     يحتاجان تصحيحًا» and «ما كتبته محفوظ كما هو».
//
// Values surviving a failed submit are `lib/form-state`'s `was()`, as before:
// React 19 resets the form when the action resolves, and every `defaultValue`
// reads back what the action captured.

const SECTION_TOPIC = "section-topic";
const SECTION_PEOPLE = "section-people";

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

/** The level select's own default, so «المتبقّي» never counts a field that cannot be empty. */
const LEVEL_DEFAULT = "introductory";

/**
 * What the browser has said about each field since the last round trip —
 * a message key, or `null` for «passes now». STAMPED with the attempt it
 * belongs to, so a new round trip makes the whole overlay stale by comparison
 * rather than by an effect that clears it (`react-hooks/set-state-in-effect`).
 */
type Stamped<T> = { attempt: number; value: T };

/**
 * `create` is SCR-017. `edit` is SCR-018's edit path (DEC-141): the same
 * fields, pre-filled, with two differences the database dictates —
 * co-presenters are managed on the proposal's own page, and a change request
 * can only be resubmitted (`allowDraft={false}`), never saved back to a draft.
 */
export type ProposalFormMode =
  | { mode: "create"; members: ProposalFormMember[]; maxCoPresenters: number; maxCoPresentersLabel: string }
  | { mode: "edit"; initial: Partial<Record<ProposalField, string>>; allowDraft: boolean };

export function ProposalForm({
  action,
  categories,
  ...variant
}: {
  action: (prev: ProposeState, formData: FormData) => Promise<ProposeState>;
  categories: ProposalFormCategory[];
} & ProposalFormMode) {
  const t = useTranslations("proposals.propose");
  // An edit starts from the proposal as saved: attempt 0, so nothing is
  // invalid, and `was()` hands every field its stored value.
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

  const onChange = (field: ProposalScalarField) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    setTyped((prev) => ({ attempt: state.attempt, value: { ...fresh(prev, {}), [field]: value } }));
    // Reward early: a showing error goes the moment the value passes.
    if (attempted && shownKey(field) && checkProposalField(field, value) === null) record(field, null);
  };
  const onBlur = (field: ProposalScalarField) => (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    // Punish late, and never before a submit (REQ-UIX-011).
    if (!attempted) return;
    record(field, checkProposalField(field, event.currentTarget.value));
  };
  const validating = (field: ProposalScalarField) => ({ onChange: onChange(field), onBlur: onBlur(field) });
  const required = (field: ProposalField) => (PROPOSAL_REQUIRED as readonly string[]).includes(field);

  const remaining = PROPOSAL_REQUIRED.filter((field) => checkProposalField(field, current(field)) !== null).length;

  // ★ THE SUMMARY LISTS EXACTLY THE ERRORS ON THE PAGE (sync 2, wave 7). M9 made
  // it a record of one attempt, so a field the member broke AFTER submitting —
  // a duration of 5, caught on blur — showed its error while the summary above
  // still counted two. A summary that disagrees with the fields is worse than
  // none. So it is built from what is SHOWN: the server's refusals as the
  // browser has since revised them — added on blur, cleared by a fix.
  //
  // It does not churn per keystroke: a field enters it only on blur and leaves
  // it only when its value first passes, so an update is one field changing
  // state. Focus moves to it only when a submit mounts it (`key={state.attempt}`).
  const shown = Object.fromEntries(PROPOSAL_FIELDS.flatMap((field) => {
    const key = shownKey(field);
    return key ? [[field, key]] : [];
  })) as Partial<Record<ProposalField, string>>;
  const summary = summaryErrors(
    { ...state, errors: shown },
    {
      fields: PROPOSAL_FIELDS,
      label: (field) => t(LABEL_KEY[field]),
      message: (key) => t(`errors.${key}`),
    },
  );

  // Which control the member pressed, so `pending` appears on THAT one.
  // `useFormStatus` reports the nearest enclosing form and cannot tell two
  // submit buttons apart; this form has two.
  const [intent, setIntent] = useState<"submit" | "draft">("submit");

  /** «41 من 150» under a text control — its description, never announced as it changes. */
  const counter = (field: "title" | "abstract", max: number) => (
    <p id={`${field}-count`} className="mt-1.5 text-caption text-fg-muted">
      {t("form.charCount", { value: formatNumber(current(field).length), max: formatNumber(max) })}
    </p>
  );

  return (
    <form action={formAction} noValidate className="mt-8 flex max-w-2xl flex-col gap-10">
      {state.formError ? (
        // A failed WRITE, not a failed field: there is no control to link to,
        // so it is its own alert rather than an invented focus target. The two
        // are mutually exclusive by construction — `submitProposal` returns
        // field errors from the Zod branch and this from the catch.
        <FormError key={state.attempt} message={t(`errors.${state.formError}`)} />
      ) : (
        // `key` is what moves focus here on every failed round trip, including
        // two consecutive failures carrying identical errors.
        <FormSummary
          key={state.attempt}
          title={t("form.errorSummaryCount", { count: summary.length, value: formatNumber(summary.length) })}
          description={t("form.errorSummaryDescription", { count: summary.length })}
          errors={summary}
        />
      )}

      {/* The two sections, and how much is left. In-page links, not steps:
          one form, one submit, nothing hidden. */}
      <nav aria-label={t("form.progressLabel")} className="flex flex-col gap-3 border-y border-edge py-4">
        <ol className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {[
            [SECTION_TOPIC, t("form.sectionTopic")],
            [SECTION_PEOPLE, variant.mode === "create" ? t("form.sectionPeople") : t("form.sectionNotes")],
          ].map(([href, label], i) => (
            <li key={href}>
              <a href={`#${href}`} className="inline-flex min-h-11 items-center gap-2.5 text-label text-fg-heading underline-offset-4 hover:underline">
                <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-md border border-edge-strong text-caption">
                  {formatNumber(i + 1)}
                </span>
                {label}
              </a>
            </li>
          ))}
        </ol>
        <p className="text-body-sm text-fg-muted">{t("form.remaining", { count: remaining, value: formatNumber(remaining) })}</p>
      </nav>

      <section aria-labelledby={SECTION_TOPIC} className="flex flex-col gap-7">
        <SectionHeader id={SECTION_TOPIC} title={t("form.sectionTopic")} />

        <Field id="title" label={t("form.titleLabel")} hint={t("form.titleHint")} error={err("title")} required={required("title")}>
          <Input name="title" required maxLength={PROPOSAL_LIMITS.titleMax} defaultValue={was(state, "title")} aria-describedby="title-count" {...validating("title")} />
          {counter("title", PROPOSAL_LIMITS.titleMax)}
        </Field>

        <Field id="abstract" label={t("form.abstractLabel")} hint={t("form.abstractHint")} error={err("abstract")} required={required("abstract")}>
          <Textarea
            name="abstract"
            required
            maxLength={PROPOSAL_LIMITS.abstractMax}
            defaultValue={was(state, "abstract")}
            aria-describedby="abstract-count"
            {...validating("abstract")}
          />
          {counter("abstract", PROPOSAL_LIMITS.abstractMax)}
        </Field>

        <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
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
            <Select name="level" required defaultValue={was(state, "level") || LEVEL_DEFAULT} {...validating("level")}>
              <option value="introductory">{t("form.levelIntroductory")}</option>
              <option value="intermediate">{t("form.levelIntermediate")}</option>
              <option value="advanced">{t("form.levelAdvanced")}</option>
            </Select>
          </Field>
        </div>

        <Field id="targetAudience" label={t("form.audienceLabel")} hint={t("form.audienceHint")} error={err("targetAudience")}>
          <Input name="targetAudience" maxLength={PROPOSAL_LIMITS.audienceMax} defaultValue={was(state, "targetAudience")} {...validating("targetAudience")} />
        </Field>

        <Field id="expectedDurationMinutes" label={t("form.durationLabel")} hint={t("form.durationHint")} error={err("expectedDurationMinutes")}>
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
              min={PROPOSAL_LIMITS.durationMin}
              max={PROPOSAL_LIMITS.durationMax}
              step={5}
              dir="ltr"
              defaultValue={was(state, "expectedDurationMinutes")}
              className="w-32 text-center"
              {...validating("expectedDurationMinutes")}
            />
            <span className="text-body text-fg-muted">{t("form.durationUnit")}</span>
          </div>
        </Field>
      </section>

      <section aria-labelledby={SECTION_PEOPLE} className="flex flex-col gap-7">
        <SectionHeader id={SECTION_PEOPLE} title={variant.mode === "create" ? t("form.sectionPeople") : t("form.sectionNotes")} />

        {/* REQ-PRO-003. Checkboxes until `ui/combobox` reads the field wiring
            and stops forcing left-to-right input (DEC-141, R2): a multi-select
            at 390 px is a scroll trap, and the count has to stay visible
            against the org's limit. The list comes from members_member_view,
            so it cannot show anyone outside the org — and the database refuses
            one anyway.
            ★ `id="coPresenters"` is how the summary's link reaches this group:
            a fieldset is not focusable, so the link focuses the first checkbox
            inside it. An edit names nobody new here — co-presenters are managed
            on the proposal's own page. */}
        {variant.mode === "create" ? (
          <fieldset id="coPresenters">
            <legend className="text-label text-fg-heading">{t("form.coPresentersLabel")}</legend>
            <p className="mt-1 text-caption text-fg-muted">{t("form.coPresentersHint")}</p>
            <p className="mt-1 text-caption text-fg-muted">{variant.maxCoPresentersLabel}</p>
            {variant.members.length === 0 ? (
              <p className="mt-3 text-caption text-fg-muted">{t("form.coPresentersNone")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1">
                {variant.members.map((m) => (
                  <li key={m.id}>
                    <Checkbox
                      name="coPresenters"
                      value={m.id}
                      defaultChecked={wasList(state, "coPresenters").includes(m.id)}
                      disabled={variant.maxCoPresenters === 0}
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
        ) : (
          <p className="text-body-sm text-fg-muted">{t("form.presentersElsewhere")}</p>
        )}

        <Field id="adminNotes" label={t("form.notesLabel")} hint={t("form.notesHint")} error={err("adminNotes")}>
          <Textarea name="adminNotes" maxLength={PROPOSAL_LIMITS.notesMax} rows={3} defaultValue={was(state, "adminNotes")} {...validating("adminNotes")} />
        </Field>
      </section>

      <div className="flex flex-col gap-4">
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
            {allowDraft ? t("form.submit") : t("form.resubmit")}
          </Button>
          {allowDraft ? (
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
          ) : null}
        </div>
        {/* REQ-PRO-001, said to the member and not only to the schema — and
            where the draft materials go, since this form cannot hold them. */}
        <p className="text-body-sm text-fg-muted">{t("noScheduleNote")}</p>
        {variant.mode === "create" ? <p className="text-body-sm text-fg-muted">{t("form.materialsNote")}</p> : null}
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
