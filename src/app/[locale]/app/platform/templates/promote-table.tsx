"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import type { DataTableColumn } from "@/components/ui";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import type { PromotableVersion } from "@/lib/dal/platform-templates";
import { was } from "@/lib/form-state";
import { promoteAction } from "./actions";
import { emptyPromoteState, type PromoteState } from "./state";

// SCR-083's promotion candidates — REQ-DSG-008, wave 8 (`docs/plan/notes/platform.md` W8.6).
//
// Published org versions, BY IDENTITY ALONE: a name, an org, a family, a version
// number and a date. No preview and no document — `promote_template_to_platform()`
// copies the document server-side without handing it to anyone, which is what
// keeps «managed» from becoming «reads every org's designs».
//
// «رقِّ النسخة» opens a dialog per candidate: the optional new name belongs to
// THIS version (a shared field beside a picker is how the wrong one gets
// renamed), and the dialog says the copy-not-link consequence before the press.
// `noValidate`; the refusal stays in the dialog; success closes it and says so,
// in the action's own path.

const PLATFORM_TIME_ZONE = "Asia/Riyadh";

function PromoteControl({ candidate, locale }: { candidate: PromotableVersion; locale: Locale }) {
  const t = useTranslations("platform.templates");
  const tErr = useTranslations("platform.errors");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: PromoteState, formData: FormData) => {
    const next = await promoteAction(locale, candidate.versionId, prev, formData);
    if (next.promoted) {
      setOpen(false);
      toast.show({ title: t("promoted"), tone: "success" });
    }
    return next;
  }, emptyPromoteState());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("promote")}
      </Button>
      {open ? (
        <DialogContent
          title={t.rich("promoteConfirmTitle", { name: candidate.name, bdi: (c) => <bdi>{c}</bdi> })}
          description={t("promoteIntro")}
          closeLabel={t("closeDialog")}
        >
          <form action={formAction} noValidate className="space-y-5">
            {state.formError ? (
              <Panel tone="error">
                <p role="alert" className="text-body-sm text-fg-heading">
                  {tErr(state.formError)}
                </p>
              </Panel>
            ) : null}
            <Field id={`promote-name-${candidate.versionId}`} label={t("promoteNameLabel")} hint={t("promoteNameHint")} error={state.errors.name ? tErr(state.errors.name) : undefined}>
              <Input name="name" maxLength={120} defaultValue={was(state, "name")} />
            </Field>
            <div className="flex flex-wrap gap-3">
              <SubmitButton size="md" pending={pending}>
                {t("promote")}
              </SubmitButton>
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="md">
                  {t("cancel")}
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function PromoteTable({ candidates, locale }: { candidates: PromotableVersion[]; locale: Locale }) {
  const t = useTranslations("platform.templates");
  const tFamily = useTranslations("templates.family");

  const columns: DataTableColumn<PromotableVersion>[] = [
    { key: "name", header: t("nameColumn"), cell: (c) => <bdi>{c.name}</bdi> },
    { key: "org", header: t("orgColumn"), onCard: true, cell: (c) => <bdi>{c.orgName}</bdi> },
    { key: "family", header: t("familyColumn"), onCard: true, cell: (c) => tFamily(c.family) },
    { key: "version", header: t("versionColumn"), align: "end", cell: (c) => <bdi>{formatNumber(c.version)}</bdi> },
    { key: "published", header: t("publishedColumn"), cell: (c) => <bdi>{formatDate(c.publishedAt, PLATFORM_TIME_ZONE, locale)}</bdi> },
    {
      key: "actions",
      header: t("actionsColumn"),
      onCard: true,
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-2">
          {c.alreadyPromoted ? <Badge tone="neutral">{t("alreadyPromoted")}</Badge> : null}
          <PromoteControl candidate={c} locale={locale} />
        </span>
      ),
    },
  ];

  return (
    <DataTable
      label={t("promoteTitle")}
      columns={columns}
      rows={candidates}
      rowKey={(c) => c.versionId}
      empty={{ title: t("promoteEmpty"), action: { label: t("libraryTitle"), href: "#library" }, size: "sm" }}
    />
  );
}
