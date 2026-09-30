"use client";

import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { rescopeTaskAction, submitTaskFormResponseAction, toggleTaskCompletionAction } from "@/components/tasks/actions";
import { RescopeChip, type RescopeOption } from "@/components/materials/rescope-chip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import { Textarea } from "@/components/ui/textarea";
import type { TaskSummary } from "@/lib/dal/tasks";

// One preparatory task — `Event.dc.html:88-90`, `EventDesktop.dc.html:77-79` (DEC-208: written anew). A checkbox and
// the task in words, as the artboard draws it; the kind's own way in beside it.
//
// Kept (`docs/plan/notes/content.md` § PR B, tasks):
//   · REQ-TSK-001 — each kind its affordance: read a material (a link to it), a form (the form), a checklist item
//     (the checkbox), an external task (a link out, `rel="noopener noreferrer"`, and the checkbox);
//   · REQ-TSK-004 — completion is self-declared for checklist, external and read; a form is completed by
//     submitting it, never by a checkbox — so a form task has none;
//   · REQ-TSK-003 — a form's answers are the member's own to see again and edit; the DAL shows them to no one else;
//   · REQ-TSK-002 — nothing here earns a point or opens a check-in;
//   · a toggle that fails says so at the row and puts the box back; a dropped connection never takes the page to
//     its error boundary.

export function TaskRow({ locale, sessionId, task, scope }: { locale: string; sessionId: string; task: TaskSummary; scope?: { currentLabel: string; options: RescopeOption[] } | null }) {
  const t = useTranslations("tasks");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useOptimistic(task.completed, (_s, next: boolean) => next);
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      setDone(next);
      try {
        const result = await toggleTaskCompletionAction(locale, sessionId, task.id, next);
        if (result.error) setError(t("list.toggleFailed"));
      } catch {
        setError(t("list.toggleFailed"));
      }
    });
  }

  const title = (
    <span className="flex flex-col">
      <span className={`text-body ${done ? "text-fg-muted line-through" : "text-fg-heading"}`}>
        <bdi>{task.title}</bdi> <span className="text-caption text-fg-muted">({t(`list.kind.${task.kind}`)})</span>
      </span>
      {task.description ? (
        <span className="text-caption text-fg-muted">
          <bdi>{task.description}</bdi>
        </span>
      ) : null}
    </span>
  );

  return (
    <li className="flex flex-col gap-1 rounded-tile border border-edge bg-surface px-2 py-1">
      {task.kind === "form" ? (
        <div className="flex min-h-11 items-center justify-between gap-3 px-2">
          {title}
          {done ? <span className="shrink-0 text-caption font-bold text-fg-heading">{t("list.completedBadge")}</span> : null}
        </div>
      ) : (
        <Checkbox label={title} checked={done} disabled={pending} onChange={(e) => toggle(e.currentTarget.checked)} />
      )}

      {task.kind === "read_material" && task.materialId ? (
        <Link href={`/app/sessions/${sessionId}/materials/${task.materialId}`} className="ms-10 inline-flex min-h-11 w-fit items-center text-label font-bold text-fg-body underline-offset-4 hover:text-fg-heading hover:underline">
          {t("list.openMaterial")}
        </Link>
      ) : null}
      {task.kind === "external" && task.externalUrl ? (
        <a href={task.externalUrl} target="_blank" rel="noopener noreferrer" className="ms-10 inline-flex min-h-11 w-fit items-center text-label font-bold text-fg-body underline-offset-4 hover:text-fg-heading hover:underline">
          {t("list.openExternal")}
        </a>
      ) : null}
      {task.kind === "form" && task.formSchema ? <TaskForm locale={locale} sessionId={sessionId} task={task} /> : null}
      {scope ? (
        <RescopeChip
          currentLabel={scope.currentLabel}
          options={scope.options}
          triggerAriaLabel={t.markup("list.rescope.trigger", { label: scope.currentLabel, bdi: (chunks) => chunks })}
          failedLabel={t("list.rescope.failed")}
          rescopeAction={rescopeTaskAction.bind(null, locale, sessionId, task.id)}
          className="ms-2"
        />
      ) : null}
      {error ? (
        <p role="alert" className="px-2 pb-1 text-caption text-fg-heading">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function TaskForm({ locale, sessionId, task }: { locale: string; sessionId: string; task: TaskSummary }) {
  const t = useTranslations("tasks.form");
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(task.completed);
  const [editing, setEditing] = useState(!task.completed);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const response: Record<string, string> = {};
    for (const field of task.formSchema ?? []) response[field.id] = String(data.get(field.id) ?? "").trim();
    startTransition(async () => {
      try {
        const result = await submitTaskFormResponseAction(locale, sessionId, task.id, response);
        if (result.error) setError(t("submitFailed"));
        else {
          setSubmitted(true);
          setEditing(false);
        }
      } catch {
        setError(t("submitFailed"));
      }
    });
  }

  if (submitted && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-2 pb-1">
        <p className="text-caption text-fg-muted">{t("submitted")}</p>
        <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center text-label font-bold text-fg-body underline-offset-4 hover:underline">
          {t("edit")}
        </button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2 px-2 pb-2">
      {(task.formSchema ?? []).map((field) => (
        <Field key={field.id} label={<bdi>{field.label}</bdi>}>
          {field.type === "textarea" ? <Textarea name={field.id} defaultValue={task.myFormResponse?.[field.id] ?? ""} /> : <Input name={field.id} defaultValue={task.myFormResponse?.[field.id] ?? ""} />}
        </Field>
      ))}
      {error ? (
        <p role="alert" className="text-caption text-fg-heading">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel={t("submit")} className="self-start">
        {t("submit")}
      </Button>
    </form>
  );
}
