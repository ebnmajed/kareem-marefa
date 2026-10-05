"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardMedia } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import type { MenuItem } from "@/components/ui";
import { TagChip } from "@/components/ui/tag-chip";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/routing";
import type { PlatformTemplate } from "@/lib/dal/platform-templates";
import { retireAction, setDefaultAction } from "./actions";

// SCR-083's library as `PlatformTemplates.dc.html` draws it: a grid of cards, each with its family, its purpose and
// its «⋯» — REQ-DSG-008, REQ-DSG-026, DEC-052, DEC-148 (contract 3). Kept (W26.2.4, T1 – T4):
//
// · ★ NO DOCUMENT ON THIS PAGE (DEC-251, Q6). `platform_template_library()` returns none and the card's media is the
//   family's generated swatch — `CardMedia`'s placeholder, as `055` draws a template with no preview — never a live
//   render. A row is a COMPOSITION: a family, and for a certificate its orientation; the scheme is never a card.
// · The badges: baseline or promoted, the default, retired (a retired card is dimmed).
// · ★ SHOW WHAT EXISTS; HIDE WHAT CANNOT BE DONE (`16` §3 principle 7). «اجعله الافتراضي» on a live non-default, «أعده
//   إلى الخدمة» on a retired one, «أحِله إلى التقاعد» only where `retirable` (computed in SQL beside the guard, so this
//   file holds no copy of the floor). Retiring confirms in `ui/dialog` NAMING the template; every act answers, a
//   refusal in words (wave 8 F4/F5).
// · The family's word appears only where the name does not already say it (wave 4's «إعلان إعلان»).

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

function TemplateCard({ template, locale }: { template: PlatformTemplate; locale: Locale }) {
  const t = useTranslations("platform.templates");
  const tFamily = useTranslations("templates.family");
  const family = tFamily(template.family);
  // The board's two rows under the swatch: the name, the purpose chip and «⋯»; then the composition's chips —
  // the family where the name does not already say it, a certificate's orientation — and the state badges.
  const chips = [...(family === template.name ? [] : [family]), ...(template.orientation ? [t(template.orientation)] : [])];

  return (
    <Card density="grid" className="h-full">
      <div className="p-2.5 pb-0">
        {/* One short, even swatch per card, as the board draws its thumbnails — the family's generated placeholder,
            never a render (DEC-251, Q6). A purpose's own aspect would make a poster card twice a certificate's. */}
        <CardMedia aspect="16/9" placeholderFrom={template.name} placeholderTone="dark" dimmed={template.retiredAt !== null} className="rounded-lg" />
      </div>
      <CardBody>
        <div className="flex items-center gap-1.5">
          <h3 className="min-w-0 flex-1 text-label text-fg-heading">
            <bdi>{template.name}</bdi>
          </h3>
          <TagChip label={template.purpose === "poster" ? t("purposePosterOne") : t("purposeCertificateOne")} />
          <TemplateActions template={template} locale={locale} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.length ? (
            <ul aria-label={t("chipsLabel")} className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <li key={chip}>
                  <TagChip label={chip} />
                </li>
              ))}
            </ul>
          ) : null}
          {template.isBaseline ? <Badge size="sm">{t("baseline")}</Badge> : <Badge size="sm" tone="info">{t("promotedBadge")}</Badge>}
          {template.isDefault && template.retiredAt === null ? (
            <Badge size="sm" tone="success">
              {t("isDefault")}
            </Badge>
          ) : null}
          {template.retiredAt !== null ? (
            <Badge size="sm" tone="ended" outline>
              {t("retired")}
            </Badge>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

/** One purpose's cards, in the roster's order: family, then orientation, then age. */
export function LibraryGrid({ purpose, templates, locale }: { purpose: "poster" | "certificate"; templates: PlatformTemplate[]; locale: Locale }) {
  const t = useTranslations("platform.templates");
  const sorted = [...templates].sort(
    (a, b) => a.family.localeCompare(b.family) || (a.orientation ?? "").localeCompare(b.orientation ?? "") || a.createdAt.localeCompare(b.createdAt),
  );

  if (sorted.length === 0) {
    return <EmptyState title={t("empty")} action={{ label: t("promoteTitle"), href: "#promote" }} size="sm" />;
  }

  return (
    <ul aria-label={purpose === "poster" ? t("purposePoster") : t("purposeCertificate")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sorted.map((template) => (
        <li key={template.id} className="min-w-0">
          <TemplateCard template={template} locale={locale} />
        </li>
      ))}
    </ul>
  );
}
