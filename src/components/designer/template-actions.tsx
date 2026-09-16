"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { TemplatePurpose } from "@/lib/dal/templates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon, PlusIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import {
  createTemplate,
  duplicateFromPlatform,
  editTemplate,
  makeDefault,
  publishVersion,
  rename,
  setRetired,
} from "@/app/[locale]/app/admin/templates/actions";
import { initialTemplateActionState, type TemplateActionState } from "@/app/[locale]/app/admin/templates/state";

// The libraries' controls — SCR-055/056, REQ-ADM-013, REQ-DSG-007,
// REQ-DSG-008, REQ-UIX-007, REQ-UIX-009 … 013.
//
// ★ Every answer is a toast shown FROM THE ACTION'S RESULT, never from an
// effect keyed on the state: a duplicate closes its dialog and a retire moves
// its card in the same commit as the action's return, and an effect in an
// unmounting component never runs (wave 6's trap).
//
// Forms carry `noValidate` (wave 7): the name is checked by the action, and a
// native `required` would block the submit before the app's own error could
// say what is wrong.

function useToastFor() {
  const t = useTranslations("templates.result");
  const toast = useToast();
  return (result: TemplateActionState) => {
    if (result.status === "ok") toast.show({ tone: "success", title: result.kind === "published" ? t("publishedToast") : t(result.kind) });
    else if (result.status === "not_authorized") toast.show({ tone: "error", title: t("notAuthorized") });
    else if (result.status === "invalid") toast.show({ tone: "error", title: t("invalidToast") });
  };
}

/** A name form in a dialog — duplicate, create and rename share it. */
function useNameForm(action: (form: FormData) => Promise<TemplateActionState>, onDone: () => void) {
  const say = useToastFor();
  return useActionState(async (_previous: TemplateActionState, form: FormData) => {
    const result = await action(form);
    say(result);
    if (result.status === "ok") onDone();
    return result;
  }, initialTemplateActionState);
}

function nameErrorOf(state: TemplateActionState, t: (key: "nameRequired" | "nameTooLong") => string): string | undefined {
  return state.status === "invalid_field" ? t(state.error) : undefined;
}

/* ── the header's «قالب فارغ» ──────────────────────────────────────────── */

export function CreateTemplateDialog({ locale, purpose, families }: { locale: string; purpose: TemplatePurpose; families: Array<{ value: string; label: string }> }) {
  const t = useTranslations("templates");
  const ui = useTranslations("ui");
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useNameForm((form) => createTemplate(locale, purpose, form), () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="md" iconStart={<PlusIcon />}>
          {t("create.open")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("create.heading")} description={t("create.createDescription")} closeLabel={ui("dialog.close")}>
        <form action={dispatch} noValidate className="flex flex-col gap-4">
          <Field label={t("create.name")} required error={nameErrorOf(state, (k) => t(`create.${k}`))}>
            <Input name="name" maxLength={120} autoComplete="off" />
          </Field>
          <Field label={t("create.family")}>
            <Select name="family" defaultValue={families[0]?.value}>
              {families.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          {purpose === "certificate" ? (
            <RadioGroup
              name="orientation"
              legend={t("create.orientation")}
              defaultValue="landscape"
              options={[
                { value: "landscape", label: t("card.orientation.landscape") },
                { value: "portrait", label: t("card.orientation.portrait") },
              ]}
            />
          ) : null}
          <div className="flex flex-wrap gap-3">
            <SubmitButton size="md">{t("create.submit")}</SubmitButton>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("create.cancel")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── a platform card: «انسخ إلى مؤسستي» ────────────────────────────────── */

export function DuplicateTemplateDialog({ locale, purpose, templateId, name }: { locale: string; purpose: TemplatePurpose; templateId: string; name: string }) {
  const t = useTranslations("templates");
  const ui = useTranslations("ui");
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useNameForm((form) => duplicateFromPlatform(locale, purpose, templateId, form), () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          {t("card.duplicate")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t.rich("create.duplicateTitle", { name, bdi: (c) => <bdi>{c}</bdi> })} description={t("create.duplicateDescription")} closeLabel={ui("dialog.close")}>
        <form action={dispatch} noValidate className="flex flex-col gap-4">
          <Field label={t("create.duplicateName")} required error={nameErrorOf(state, (k) => t(`create.${k}`))}>
            <Input name="name" maxLength={120} defaultValue={name} autoComplete="off" />
          </Field>
          <div className="flex flex-wrap gap-3">
            <SubmitButton size="md">{t("card.duplicate")}</SubmitButton>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("create.cancel")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── an org card: studio, publish, and the rest ────────────────────────── */

export function OrgTemplateActions({
  locale,
  purpose,
  templateId,
  name,
  isDefault,
  retired,
  hasDraft,
}: {
  locale: string;
  purpose: TemplatePurpose;
  templateId: string;
  name: string;
  isDefault: boolean;
  retired: boolean;
  hasDraft: boolean;
}) {
  const t = useTranslations("templates");
  const ui = useTranslations("ui");
  const say = useToastFor();
  const [pending, start] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [renameState, dispatchRename] = useNameForm((form) => rename(locale, purpose, templateId, form), () => setRenameOpen(false));

  const run = (action: () => Promise<TemplateActionState>, after?: () => void) =>
    start(async () => {
      const result = await action();
      say(result);
      if (result.status === "ok") after?.();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* A navigation: the action redirects into SCR-057 on success. */}
      <Button type="button" size="sm" disabled={pending} onClick={() => run(() => editTemplate(locale, templateId))}>
        {t("card.edit")}
      </Button>
      {hasDraft ? (
        <Button type="button" variant="secondary" size="sm" pending={pending} onClick={() => run(() => publishVersion(locale, purpose, templateId))}>
          {t("card.publish")}
        </Button>
      ) : null}
      <Menu
        trigger={
          <IconButton size="sm" variant="ghost" label={t("card.more")}>
            <MoreIcon />
          </IconButton>
        }
        items={[
          ...(isDefault || retired ? [] : [{ label: t("card.setDefault"), onSelect: () => run(() => makeDefault(locale, purpose, templateId)) }]),
          { label: t("card.rename"), onSelect: () => setRenameOpen(true) },
          retired
            ? { label: t("card.restore"), onSelect: () => run(() => setRetired(locale, purpose, templateId, false)) }
            : { label: t("card.retire"), onSelect: () => setRetireOpen(true), tone: "error" as const },
        ]}
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent title={t.rich("create.renameTitle", { name, bdi: (c) => <bdi>{c}</bdi> })} closeLabel={ui("dialog.close")}>
          <form action={dispatchRename} noValidate className="flex flex-col gap-4">
            <Field label={t("create.name")} required error={nameErrorOf(renameState, (k) => t(`create.${k}`))}>
              <Input name="name" maxLength={120} defaultValue={name} autoComplete="off" />
            </Field>
            <div className="flex flex-wrap gap-3">
              <SubmitButton size="md">{t("create.save")}</SubmitButton>
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="md">
                  {t("create.cancel")}
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* REQ-UIX-013: a confirm that names the object and says the consequence. */}
      <Dialog open={retireOpen} onOpenChange={setRetireOpen}>
        <DialogContent title={t.rich("retire.title", { name, bdi: (c) => <bdi>{c}</bdi> })} closeLabel={ui("dialog.close")}>
          <p className="text-body text-fg-body">{t("retire.body")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" variant="danger" size="md" pending={pending} onClick={() => run(() => setRetired(locale, purpose, templateId, true), () => setRetireOpen(false))}>
              {t("retire.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("retire.cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
