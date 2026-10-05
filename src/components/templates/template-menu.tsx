"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { TemplatePurpose } from "@/lib/dal/templates";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import type { MenuItem } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { duplicate, editTemplate, makeDefault, publishVersion, rename, setRetired } from "@/app/[locale]/app/admin/templates/actions";
import { initialTemplateActionState, type TemplateActionState } from "@/app/[locale]/app/admin/templates/state";

// SCR-055's card menu (wave 23, `AdminTemplates.dc.html`'s ⋯) — REQ-ADM-013, REQ-DSG-007, REQ-DSG-008, REQ-UIX-013.
//
// Every card is the org's own (DEC-254 §3 — there is no platform library): open, copy, set default, publish (while a
// draft exists — `designer`'s bar takes it in PR B, DEC-238 §3.6), rename, retire or restore. Every answer is a toast
// FROM THE ACTION'S RESULT, never from an effect (wave 6's trap); forms are `noValidate` so the name is refused at the
// field, by the action.

function useSay() {
  const t = useTranslations("templates.result");
  const toast = useToast();
  return (result: TemplateActionState) => {
    if (result.status === "ok") toast.show({ tone: "success", title: result.kind === "published" ? t("publishedToast") : t(result.kind) });
    else if (result.status === "not_authorized") toast.show({ tone: "error", title: t("notAuthorized") });
    else if (result.status === "invalid") toast.show({ tone: "error", title: t("invalidToast") });
    else if (result.status === "last_template") toast.show({ tone: "error", title: t("lastTemplate") });
  };
}

function useNameForm(action: (form: FormData) => Promise<TemplateActionState>, onDone: () => void) {
  const say = useSay();
  return useActionState(async (_previous: TemplateActionState, form: FormData) => {
    const result = await action(form);
    say(result);
    if (result.status === "ok") onDone();
    return result;
  }, initialTemplateActionState);
}

function NameDialog({
  open,
  onOpenChange,
  title,
  submit,
  defaultName,
  action,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  submit: string;
  defaultName: string;
  action: (form: FormData) => Promise<TemplateActionState>;
}) {
  const t = useTranslations("templates.create");
  const ui = useTranslations("ui");
  const [state, dispatch] = useNameForm(action, () => onOpenChange(false));
  const error = state.status === "invalid_field" ? t(state.error) : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} closeLabel={ui("dialog.close")}>
        <form action={dispatch} noValidate className="flex flex-col gap-4">
          <Field label={t("name")} required error={error}>
            <Input name="name" maxLength={120} defaultValue={state.status === "invalid_field" ? undefined : defaultName} autoComplete="off" />
          </Field>
          <div className="flex flex-wrap gap-3">
            <SubmitButton size="md">{submit}</SubmitButton>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const trigger = (label: string) => (
  <IconButton size="sm" variant="ghost" label={label}>
    <MoreIcon />
  </IconButton>
);

export function OrgTemplateMenu({
  locale,
  purpose,
  templateId,
  name,
  isDefault,
  retired,
  hasDraft,
  usageCount,
}: {
  locale: string;
  purpose: TemplatePurpose;
  templateId: string;
  name: string;
  isDefault: boolean;
  retired: boolean;
  hasDraft: boolean;
  usageCount: number;
}) {
  const t = useTranslations("templates");
  const ui = useTranslations("ui");
  const say = useSay();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"copy" | "rename" | "retire" | null>(null);
  const bdi = (c: React.ReactNode) => <bdi>{c}</bdi>;

  const run = (action: () => Promise<TemplateActionState>, after?: () => void) =>
    start(async () => {
      const result = await action();
      say(result);
      if (result.status === "ok") after?.();
    });

  const items: MenuItem[] = [
    // A navigation: the action redirects into the studio on success.
    ...(retired ? [] : [{ label: t("card.edit"), onSelect: () => run(() => editTemplate(locale, templateId)) }]),
    { label: t("card.copy"), onSelect: () => setDialog("copy") },
    ...(isDefault || retired ? [] : [{ label: t("card.setDefault"), onSelect: () => run(() => makeDefault(locale, purpose, templateId)) }]),
    ...(hasDraft && !retired ? [{ label: t("card.publish"), onSelect: () => run(() => publishVersion(locale, purpose, templateId)) }] : []),
    { label: t("card.rename"), onSelect: () => setDialog("rename") },
    retired
      ? { label: t("card.restore"), onSelect: () => run(() => setRetired(locale, purpose, templateId, false)) }
      : { label: t("card.retire"), onSelect: () => setDialog("retire"), tone: "error" as const },
  ];

  return (
    <>
      <Menu trigger={trigger(t("card.more"))} items={items} />
      <NameDialog
        open={dialog === "copy"}
        onOpenChange={(open) => setDialog(open ? "copy" : null)}
        title={t.rich("create.copyTitle", { name, bdi })}
        submit={t("card.copy")}
        defaultName={`${name} ${t("create.copySuffix")}`}
        action={(form) => duplicate(locale, purpose, templateId, form)}
      />
      <NameDialog
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : null)}
        title={t.rich("create.renameTitle", { name, bdi })}
        submit={t("create.save")}
        defaultName={name}
        action={(form) => rename(locale, purpose, templateId, form)}
      />
      {/* REQ-UIX-013: the confirm names the object and the consequence — how many sessions use it. */}
      <Dialog open={dialog === "retire"} onOpenChange={(open) => !pending && setDialog(open ? "retire" : null)}>
        <DialogContent title={t.rich("retire.title", { name, bdi })} closeLabel={ui("dialog.close")}>
          <p className="text-body text-fg-body">{t("retire.body")}</p>
          <p className="mt-2 text-body-sm text-fg-muted">{t("retire.usage", { count: usageCount, value: formatNumber(usageCount) })}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" variant="danger" size="md" pending={pending} onClick={() => run(() => setRetired(locale, purpose, templateId, true), () => setDialog(null))}>
              {t("retire.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md" disabled={pending}>
                {t("retire.cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
