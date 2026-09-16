"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import type { DataTableColumn, MenuItem } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import type { PlatformTemplate } from "@/lib/dal/platform-templates";
import { retireAction, setDefaultAction } from "./actions";

// SCR-083's library, one table per purpose — REQ-DSG-008, REQ-DSG-026, DEC-052,
// DEC-148 (contract 3), wave 8 (`docs/plan/notes/platform.md` W8.6, W8.10).
//
// A row is a COMPOSITION: a family, and for a certificate its orientation. The
// scheme is not a row and the screen says so once, above the tables.
//
// ★ SHOW WHAT EXISTS; HIDE WHAT CANNOT BE DONE (`16` §3 principle 7). The last
// non-retired default of a purpose offers no retirement — `retirable` is
// computed in SQL beside `retire_platform_template()`'s own floor, so this file
// holds no copy of the rule, and the page says why in one line. If the guard
// refuses anyway (a race with another operator), the refusal is toasted in
// words, never swallowed (F4, F5).
//
// Retiring confirms in `ui/dialog` NAMING the template and saying what the
// automatic paths lose (`REQ-UIX-013`); making a default and returning to
// service are restorative, one press, and answered.

const isolate = (value: string) => `⁨${value}⁩`;

function TemplateActions({ template, locale }: { template: PlatformTemplate; locale: Locale }) {
  const t = useTranslations("platform.templates");
  const tErr = useTranslations("platform.errors");
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const name = isolate(template.name);

  const act = (run: () => Promise<{ error: string | null }>, done: string) =>
    start(async () => {
      const { error } = await run();
      setConfirming(false);
      toast.show(error ? { title: tErr(error), tone: "error" } : { title: done, tone: "success" });
    });

  const items: MenuItem[] = [];
  if (template.retiredAt === null && !template.isDefault) {
    items.push({ label: t("setDefault"), onSelect: () => act(() => setDefaultAction(locale, template.id), t("defaultSet", { name })) });
  }
  if (template.retiredAt !== null) {
    items.push({ label: t("unretire"), onSelect: () => act(() => retireAction(locale, template.id, false), t("unretiredDone", { name })) });
  } else if (template.retirable) {
    items.push({ label: t("retire"), onSelect: () => setConfirming(true), tone: "error", startsGroup: items.length > 0 });
  }
  if (items.length === 0) return null;

  return (
    <Dialog open={confirming} onOpenChange={setConfirming}>
      <Menu
        align="end"
        trigger={
          <IconButton label={t("actionsFor", { name: template.name })} size="sm" pending={pending}>
            <MoreIcon />
          </IconButton>
        }
        items={items}
      />
      {confirming ? (
        <DialogContent
          title={t.rich("retireConfirmTitle", { name: template.name, bdi: (c) => <bdi>{c}</bdi> })}
          description={t("retireConfirmBody")}
          closeLabel={t("closeDialog")}
        >
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="danger"
              size="md"
              pending={pending}
              onClick={() => act(() => retireAction(locale, template.id, true), t("retiredDone", { name }))}
            >
              {t("retire")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function LibraryTable({ purpose, templates, locale }: { purpose: "poster" | "certificate"; templates: PlatformTemplate[]; locale: Locale }) {
  const t = useTranslations("platform.templates");
  const tFamily = useTranslations("templates.family");
  const withOrientation = purpose === "certificate";

  const columns: DataTableColumn<PlatformTemplate>[] = [
    {
      key: "name",
      header: t("nameColumn"),
      cell: (tpl) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-label text-fg-heading">
            <bdi>{tpl.name}</bdi>
          </span>
          {/* The baseline names each template after its family (`0061`), so the
              label earns its place only when it says something the name does
              not — wave 4's «إعلان إعلان» capture. */}
          {tFamily(tpl.family) === tpl.name ? null : <span className="text-caption text-fg-muted">{tFamily(tpl.family)}</span>}
        </span>
      ),
    },
    ...(withOrientation
      ? [
          {
            key: "orientation",
            header: t("orientationColumn"),
            onCard: true,
            cell: (tpl: PlatformTemplate) => (tpl.orientation ? t(tpl.orientation) : "—"),
          } satisfies DataTableColumn<PlatformTemplate>,
        ]
      : []),
    {
      key: "state",
      header: t("stateColumn"),
      onCard: true,
      cell: (tpl) => (
        <span className="flex flex-wrap gap-1.5">
          {tpl.isBaseline ? <Badge tone="neutral">{t("baseline")}</Badge> : <Badge tone="info">{t("promotedBadge")}</Badge>}
          {tpl.isDefault && tpl.retiredAt === null ? <Badge tone="success">{t("isDefault")}</Badge> : null}
          {tpl.retiredAt !== null ? (
            <Badge tone="ended" outline>
              {t("retired")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "versions",
      header: t("versionsColumn"),
      align: "end",
      cell: (tpl) => <bdi>{t("versions", { count: tpl.versions, value: formatNumber(tpl.versions) })}</bdi>,
    },
    { key: "actions", header: t("actionsColumn"), onCard: true, cell: (tpl) => <TemplateActions template={tpl} locale={locale} /> },
  ];

  const sorted = [...templates].sort(
    (a, b) => a.family.localeCompare(b.family) || (a.orientation ?? "").localeCompare(b.orientation ?? "") || a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <DataTable
      label={purpose === "poster" ? t("purposePoster") : t("purposeCertificate")}
      columns={columns}
      rows={sorted}
      rowKey={(tpl) => tpl.id}
      empty={{ title: t("empty"), action: { label: t("promoteTitle"), href: "#promote" }, size: "sm" }}
    />
  );
}
