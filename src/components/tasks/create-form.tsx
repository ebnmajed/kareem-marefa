"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { TaskKind } from "@/lib/dal/tasks";
import { createTaskAction } from "@/components/tasks/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

interface CreateTaskFormProps {
  locale: string;
  sessionId: string;
  materials: { id: string; title: string }[];
  /** REQ-SES-018/DEC-121 — never a field IN this form, the scope of whichever group's own
   *  instance rendered it (`panel.tsx` mounts one `CreateTaskForm` per group at `days.length > 1`),
   *  matching `materials/upload-form.tsx`'s identical `sessionDayId` prop. */
  sessionDayId?: string | null;
}

const FORM_KIND: TaskKind[] = ["read_material", "form", "checklist", "external"];

/** REQ-TSK-001 — shown only to the session's presenter/admin (the `Tasks` slot decides that;
 *  `p8_presenter_write`, 03 §5.5b, is still the real gate regardless). Kept deliberately simple:
 *  a `form` task's questions are one label per line, not an authored JSON schema — REQ-TSK-001's
 *  acceptance only asks for "a matching affordance," not a schema-authoring tool. */
export function CreateTaskForm({ locale, sessionId, materials, sessionDayId }: CreateTaskFormProps) {
  const t = useTranslations("tasks.create");
  const tList = useTranslations("tasks.list"); // kind labels are authored once, under `list.kind.*`
  const [kind, setKind] = useState<TaskKind>("checklist");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (kind === "read_material" && !formData.get("materialId")) {
      setError(t("materialRequired"));
      return;
    }
    const formQuestions =
      kind === "form"
        ? String(formData.get("formQuestions") ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : undefined;
    if (kind === "form" && (!formQuestions || formQuestions.length === 0)) {
      setError(t("formQuestionsRequired"));
      return;
    }

    setBusy(true);
    try {
      const result = await createTaskAction(locale, {
        sessionId,
        sessionDayId: sessionDayId ?? undefined,
        kind,
        title,
        description: description || undefined,
        materialId: kind === "read_material" ? (formData.get("materialId") as string) : undefined,
        externalUrl: kind === "external" ? String(formData.get("externalUrl") ?? "").trim() : undefined,
        formQuestions,
      });
      if (result.error) {
        setError(result.error === "not_authorized" ? t("notAuthorized") : t("createFailed"));
        return;
      }
      form.reset();
      setKind("checklist");
    } finally {
      setBusy(false);
    }
  }

  return (
    // `noValidate`: `handleSubmit` is this form's only path to `error`/`setError`
    // (`materialRequired`, `formQuestionsRequired`, the generic server-round-trip
    // fallback below). Without it, the browser's own check on `title`'s `required`
    // blocks the native submit event before `handleSubmit` ever runs, so an empty
    // title shows nothing at all — the same failure mode `profile-form.tsx` had.
    <Panel className="mt-4">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label={t("kindLabel")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
            {FORM_KIND.map((k) => (
              <option key={k} value={k}>
                {tList(`kind.${k}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("titleLabel")} required>
          <Input name="title" required maxLength={200} />
        </Field>

        <Field label={t("descriptionLabel")}>
          <Textarea name="description" maxLength={2000} />
        </Field>

        {kind === "read_material" ? (
          materials.length === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("noMaterials")}</p>
          ) : (
            <Field label={t("materialLabel")} required>
              <Select name="materialId" required>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </Select>
            </Field>
          )
        ) : null}

        {kind === "external" ? (
          <Field label={t("externalUrlLabel")} required>
            <Input name="externalUrl" type="url" required placeholder="https://" dir="ltr" />
          </Field>
        ) : null}

        {kind === "form" ? (
          <Field label={t("formQuestionsLabel")}>
            <Textarea name="formQuestions" rows={4} />
          </Field>
        ) : null}

        {error ? <p className="text-body-sm text-fg-heading">{error}</p> : null}

        <Button type="submit" variant="secondary" size="md" disabled={busy || (kind === "read_material" && materials.length === 0)} className="self-start">
          {t("submit")}
        </Button>
      </form>
    </Panel>
  );
}
