"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { IconButton } from "@/components/ui/icon-button";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ReorderableList } from "@/components/ui/reorderable-list";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/i18n/routing";
import type { SurveyQuestionKind, SurveyTemplateDTO } from "@/lib/dal/surveys";
import { removeTemplate, saveTemplate } from "./actions";

// SCR-065's editor — the questions an org asks again and again (REQ-SUR-002).
//
// ★ A CLIENT ISLAND, AND IT HAS TO BE. `ui/reorderable-list` takes `renderItem`
// — a function prop — so a Server Component cannot hold it («Event handlers
// cannot be passed to Client Component props», the crash only a production
// build produces, DEC-159). The page reads the template and hands this plain
// data; the action is called from here.
//
// ★ NOT A `<form action>` (DEC-149 §1). The order is state, so every field is
// controlled — and `ui/input` has no controlled-reset repair, so React's reset
// after a refused save would empty every prompt and every option label. The
// save runs in a transition and the outcome is rendered here.
//
// ★ ORDER BY TAPS ALONE (SC 2.5.7). ▲▼ on every row, named by the row they
// move; no drag anywhere, and none is needed to conform. The array order IS the
// order: `position` is assigned 1…n by `survey_template_save()` and is never
// sent from here, so a reordered list is simply a differently ordered array.
//
// ★ A KEY THAT SURVIVES A REORDER. Each row carries a `crypto.randomUUID()`
// held from the moment «أضف سؤالًا» is pressed — never the array index, which
// moves out from under the row it names, and never the position. The key is
// editor state: the database sees an array and assigns its own ids.

type Kind = SurveyQuestionKind;

interface DraftOption {
  key: string;
  label: string;
}

interface DraftQuestion {
  key: string;
  kind: Kind;
  prompt: string;
  required: boolean;
  options: DraftOption[];
}

const KIND_KEYS: Record<Kind, string> = {
  scale_1_5: "kindScale",
  single_choice: "kindSingle",
  multi_choice: "kindMulti",
  free_text: "kindText",
};

const newKey = () => crypto.randomUUID();
const isChoice = (kind: Kind) => kind === "single_choice" || kind === "multi_choice";

function draftFrom(template: SurveyTemplateDTO | null): DraftQuestion[] {
  return (template?.questions ?? []).map((q) => ({
    key: newKey(),
    kind: q.kind,
    prompt: q.prompt,
    required: q.required,
    options: q.options.map((o) => ({ key: newKey(), label: o.label })),
  }));
}

export function TemplateEditor({ locale, template }: { locale: Locale; template: SurveyTemplateDTO | null }) {
  const t = useTranslations("survey.editor");
  const tErrors = useTranslations("survey.errors");
  const tList = useTranslations("survey.templates");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(template?.title ?? "");
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => draftFrom(template));
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const update = (key: string, change: Partial<DraftQuestion>) =>
    setQuestions((current) => current.map((q) => (q.key === key ? { ...q, ...change } : q)));

  const name = (question: DraftQuestion, index: number) =>
    question.prompt.trim() || t("questionFallback", { position: formatNumber(index + 1) });

  function save() {
    // The same rules the database applies, applied here first so a refusal
    // lands on the field rather than as a whole-form message.
    const nextQuestionErrors: Record<string, string> = {};
    for (const question of questions) {
      if (!question.prompt.trim()) nextQuestionErrors[question.key] = "prompt";
      else if (isChoice(question.kind) && (question.options.filter((o) => o.label.trim()).length < 2 || question.options.some((o) => !o.label.trim()))) {
        nextQuestionErrors[question.key] = "options";
      }
    }
    const nextTitleError = title.trim() ? null : "invalid_title";
    const empty = questions.length === 0 ? "empty" : null;
    setTitleError(nextTitleError);
    setQuestionErrors(nextQuestionErrors);
    setFormError(empty);
    setAttempt((n) => n + 1);
    if (nextTitleError || empty || Object.keys(nextQuestionErrors).length > 0) return;

    startTransition(async () => {
      const outcome = await saveTemplate(locale, {
        templateId: template?.id ?? null,
        title: title.trim(),
        questions: questions.map((q) => ({
          kind: q.kind,
          prompt: q.prompt.trim(),
          required: q.required,
          options: isChoice(q.kind) ? q.options.map((o) => o.label.trim()) : [],
        })),
      });

      if (outcome.status === "ok") {
        setSaved(true);
        setFormError(null);
        if (template) router.refresh();
        else router.push(`/app/admin/surveys/${outcome.templateId}`);
        return;
      }
      setSaved(false);
      setAttempt((n) => n + 1);
      if (outcome.status === "invalid") {
        // The database names the question by its INDEX, because the ids it will
        // give the rows do not exist yet.
        const question = questions[outcome.at - 1];
        if (question) setQuestionErrors({ [question.key]: outcome.field });
        else setFormError("generic");
        return;
      }
      if (outcome.status === "invalid_title" || outcome.status === "title_taken") setTitleError(outcome.status);
      else setFormError(outcome.status);
    });
  }

  function remove() {
    if (!template) return;
    startTransition(async () => {
      const outcome = await removeTemplate(locale, template.id);
      if (outcome.status === "ok") router.push("/app/admin/surveys");
      else setFormError("generic");
    });
  }

  const summary = [
    ...(titleError ? [{ fieldId: "template-title", label: t("titleLabel"), message: tErrors(titleError) }] : []),
    ...questions
      .filter((q) => questionErrors[q.key])
      .map((q, index) => ({ fieldId: `prompt-${q.key}`, label: name(q, index), message: tErrors(questionErrors[q.key]) })),
  ];

  return (
    <div className="mt-8 flex max-w-2xl flex-col gap-8">
      {formError ? (
        <p key={attempt} role="alert" className="rounded-card border border-error-border bg-error-bg p-4 text-caption text-error">
          {tErrors(formError)}
        </p>
      ) : (
        <FormSummary key={attempt} title={t("errorSummaryTitle")} description={t("errorSummaryDescription")} errors={summary} />
      )}

      <Field id="template-title" label={t("titleLabel")} hint={t("titleHint")} error={titleError ? tErrors(titleError) : undefined} required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </Field>

      <section aria-labelledby="questions">
        <h2 id="questions" className="text-h3 text-fg-heading">
          {t("questionsLabel")}
        </h2>

        <div className="mt-4">
          <ReorderableList
            items={questions}
            label={t("questionsLabel")}
            getKey={(q) => q.key}
            getName={(q) => name(q, questions.findIndex((x) => x.key === q.key))}
            disabled={pending}
            onReorder={(order) => setQuestions((current) => order.map((key) => current.find((q) => q.key === key)!))}
            renderActions={(q) => (
              <IconButton label={t("removeQuestion")} variant="secondary" onClick={() => setQuestions((current) => current.filter((x) => x.key !== q.key))}>
                <TrashIcon />
              </IconButton>
            )}
            renderItem={(question, { index }) => (
              <QuestionCard
                question={question}
                index={index}
                error={questionErrors[question.key]}
                onChange={(change) => update(question.key, change)}
              />
            )}
          />
        </div>

        <div className="mt-4">
          <Button
            variant="secondary"
            size="md"
            iconStart={<PlusIcon />}
            onClick={() => setQuestions((current) => [...current, { key: newKey(), kind: "scale_1_5", prompt: "", required: false, options: [] }])}
          >
            {t("addQuestion")}
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-6">
        <Button onClick={save} disabled={pending} size="md">
          {pending ? t("saving") : t("save")}
        </Button>
        {saved ? (
          <p role="status" className="text-body-sm text-fg-muted">
            {t("saved")}
          </p>
        ) : null}
        {template ? (
          confirming ? (
            <>
              <span className="text-body-sm text-fg-muted">{tList("deleteConfirm")}</span>
              <Button variant="secondary" size="md" onClick={remove} disabled={pending}>
                {tList("delete")}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="md" onClick={() => setConfirming(true)} disabled={pending}>
              {tList("delete")}
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

/** One question's own fields, inside the reorderable row. */
function QuestionCard({
  question,
  index,
  error,
  onChange,
}: {
  question: DraftQuestion;
  index: number;
  error?: string;
  onChange: (change: Partial<DraftQuestion>) => void;
}) {
  const t = useTranslations("survey.editor");
  const tErrors = useTranslations("survey.errors");

  return (
    <div className="flex flex-col gap-3 rounded-card border border-edge p-4">
      <Field id={`prompt-${question.key}`} label={t("promptLabel")} error={error === "prompt" ? tErrors("prompt") : undefined}>
        <Input
          value={question.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          maxLength={300}
          placeholder={t("questionFallback", { position: formatNumber(index + 1) })}
        />
      </Field>

      <div className="flex flex-wrap items-end gap-4">
        <Field id={`kind-${question.key}`} label={t("kindLabel")} className="min-w-48">
          <Select
            value={question.kind}
            onChange={(e) => {
              const kind = e.target.value as Kind;
              onChange({ kind, options: isChoice(kind) && question.options.length === 0 ? [{ key: newKey(), label: "" }, { key: newKey(), label: "" }] : question.options });
            }}
          >
            {(Object.keys(KIND_KEYS) as Kind[]).map((kind) => (
              <option key={kind} value={kind}>
                {t(KIND_KEYS[kind])}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox checked={question.required} onChange={(e) => onChange({ required: e.target.checked })} label={t("requiredLabel")} />
      </div>

      {isChoice(question.kind) ? (
        <fieldset>
          <legend className="text-body-sm text-fg-muted">{t("optionsLabel")}</legend>
          {error === "options" ? <p className="mt-1 text-caption text-error">{tErrors("options")}</p> : null}
          <div className="mt-2">
            <OptionList question={question} onChange={onChange} />
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

/** A choice question's options — the same primitive, one size down (`16` §10.2.1). */
function OptionList({ question, onChange }: { question: DraftQuestion; onChange: (change: Partial<DraftQuestion>) => void }) {
  const t = useTranslations("survey.editor");

  return (
    <>
      <ReorderableList
        size="sm"
        items={question.options}
        label={t("optionsLabel")}
        getKey={(o) => o.key}
        getName={(o) => o.label.trim() || t("optionFallback", { position: formatNumber(question.options.findIndex((x) => x.key === o.key) + 1) })}
        onReorder={(order) => onChange({ options: order.map((key) => question.options.find((o) => o.key === key)!) })}
        renderActions={(option) => (
          <IconButton label={t("removeOption")} size="sm" variant="secondary" onClick={() => onChange({ options: question.options.filter((o) => o.key !== option.key) })}>
            <TrashIcon />
          </IconButton>
        )}
        renderItem={(option, { index }) => (
          <Input
            size="sm"
            aria-label={`${t("optionLabel")} ${formatNumber(index + 1)}`}
            value={option.label}
            maxLength={120}
            placeholder={t("optionFallback", { position: formatNumber(index + 1) })}
            onChange={(e) => onChange({ options: question.options.map((o) => (o.key === option.key ? { ...o, label: e.target.value } : o)) })}
          />
        )}
      />
      <div className="mt-2">
        <Button variant="secondary" size="sm" iconStart={<PlusIcon />} onClick={() => onChange({ options: [...question.options, { key: newKey(), label: "" }] })}>
          {t("addOption")}
        </Button>
      </div>
    </>
  );
}
