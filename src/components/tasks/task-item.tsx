"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { TaskSummary } from "@/lib/dal/tasks";
import { rescopeTaskAction, submitTaskFormResponseAction, toggleTaskCompletionAction } from "@/components/tasks/actions";
import { RescopeChip, type RescopeOption } from "@/components/materials/rescope-chip";

interface TaskItemProps {
  locale: string;
  sessionId: string;
  task: TaskSummary;
  /** REQ-SES-018/DEC-121 — present only at `days.length > 1` AND for a manager (`panel.tsx`
   *  decides both); a plain member or a one-day session gets no chip and this stays undefined,
   *  which is what keeps this component's markup at `n <= 1` identical to before T2. */
  scope?: { currentLabel: string; options: RescopeOption[] } | null;
}

/** REQ-TSK-001: one affordance per kind — a link for `read_material`, a form for `form`, a
 *  checkbox for `checklist`, a link + checkbox for `external`. REQ-TSK-004: completion is
 *  self-declared for checklist/external/read_material (a plain toggle); a `form` task is marked
 *  complete by submitting it, never by this toggle (submitTaskFormResponse writes both rows). */
export function TaskItem({ locale, sessionId, task, scope }: TaskItemProps) {
  const t = useTranslations("tasks");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(completed: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await toggleTaskCompletionAction(locale, sessionId, task.id, completed);
        if (result.error) setError(result.error);
      } catch {
        // ★ A request that fails at the NETWORK level (offline, a dropped
        // connection) makes the action REJECT rather than return an
        // `{ error }` value — left uncaught, React would replace the whole
        // event page with the route's error boundary (the lead's real-build
        // finding on the discussion, same shape here).
        setError(t("list.toggleFailed"));
      }
    });
  }

  return (
    <li className="rounded-field border border-edge p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-body font-medium text-fg-heading">
            <bdi>{task.title}</bdi>
          </p>
          <p className="text-body-sm text-fg-muted">{t(`list.kind.${task.kind}`)}</p>
          {task.description ? (
            <p className="mt-1 text-body-sm text-fg-body">
              <bdi>{task.description}</bdi>
            </p>
          ) : null}
        </div>
        {task.completed ? <span className="text-body-sm text-fg-heading">{t("list.completedBadge")}</span> : null}
      </div>

      {/* The group heading already says which day/scope this card is under — only a manager
          gets the chip that can move it. */}
      {scope ? (
        <RescopeChip
          currentLabel={scope.currentLabel}
          options={scope.options}
          triggerAriaLabel={t.markup("list.rescope.trigger", { label: scope.currentLabel, bdi: (chunks) => chunks })}
          failedLabel={t("list.rescope.failed")}
          onRescope={(dayId) => rescopeTaskAction(locale, sessionId, task.id, dayId)}
          className="mt-2"
        />
      ) : null}

      {task.kind === "read_material" && task.materialId ? (
        <Link href={`/${locale}/app/sessions/${sessionId}/materials/${task.materialId}`} className="mt-2 inline-block text-body-sm text-fg-body hover:text-fg-heading">
          {t("list.openMaterial")}
        </Link>
      ) : null}

      {task.kind === "external" && task.externalUrl ? (
        <a href={task.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-body-sm text-fg-body hover:text-fg-heading">
          {t("list.openExternal")}
        </a>
      ) : null}

      {task.kind === "form" && task.formSchema ? <TaskForm locale={locale} sessionId={sessionId} task={task} /> : null}

      {task.kind !== "form" ? (
        <div className="mt-2 flex flex-col gap-1">
          <button type="button" disabled={pending} onClick={() => toggle(!task.completed)} className="self-start text-body-sm text-fg-body underline hover:text-fg-heading disabled:opacity-40 w-fit">
            {task.completed ? t("list.markUndone") : t("list.markDone")}
          </button>
          {error ? <p className="text-body-sm text-fg-heading">{error}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

function TaskForm({ locale, sessionId, task }: TaskItemProps) {
  const t = useTranslations("tasks.form");
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(task.completed);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!task.completed);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const response: Record<string, string> = {};
    for (const field of task.formSchema ?? []) response[field.id] = String(formData.get(field.id) ?? "").trim();

    startTransition(async () => {
      try {
        const result = await submitTaskFormResponseAction(locale, sessionId, task.id, response);
        if (result.error) setError(result.error);
        else {
          setSubmitted(true);
          setEditing(false);
        }
      } catch {
        // Same real-build finding as `TaskItem.toggle` above: an uncaught
        // network-level rejection here would crash the whole event page.
        // The typed answers stay in the form either way — this branch never
        // touches `submitted`/`editing`.
        setError(t("submitFailed"));
      }
    });
  }

  if (submitted && !editing) {
    return (
      <div className="mt-2 flex flex-col gap-1">
        <p className="text-body-sm text-fg-muted">{t("submitted")}</p>
        <button type="button" onClick={() => setEditing(true)} className="self-start text-body-sm text-fg-body underline hover:text-fg-heading w-fit">
          {t("edit")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      {(task.formSchema ?? []).map((field) => (
        <label key={field.id} className="flex flex-col gap-1 text-body-sm text-fg-body">
          <bdi>{field.label}</bdi>
          {field.type === "textarea" ? (
            <textarea name={field.id} defaultValue={task.myFormResponse?.[field.id] ?? ""} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading" />
          ) : (
            <input name={field.id} defaultValue={task.myFormResponse?.[field.id] ?? ""} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading" />
          )}
        </label>
      ))}
      {error ? <p className="text-body-sm text-fg-heading">{error}</p> : null}
      <button type="submit" disabled={pending} className="self-start rounded-field border border-edge-strong px-4 py-2 text-label text-fg-heading disabled:opacity-40 w-fit">
        {t("submit")}
      </button>
    </form>
  );
}
