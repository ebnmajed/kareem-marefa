"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { DraftOffer as Offer } from "@/components/designer/draft";

// SCR-057 — a local draft, offered back (REQ-DSG-036, STORY-DSG-020, DEC-258 §2.3, DEC-259 §2.6).
//
// Non-modal, above the canvas: the server's document stays visible while the person decides, and nothing steals focus
// on load. ★ Until they answer, the editor is read-only — an edit made meanwhile could be lost to Back or a crash,
// which is the loss the draft exists to prevent. ★ A STALE draft (the server's document moved after the edits were
// made) is never applied silently and never dropped silently: it says so, and says what restoring it means. Its
// staleness is its own state, in its own words — `conflict` keeps its one meaning, a 409 from the server.

export function DraftOffer({ offer, onRestore, onDelete }: { offer: Offer; onRestore: () => void; onDelete: () => void }) {
  const t = useTranslations("designer.draft");
  return (
    <Panel tone="info" className="m-4 flex flex-col gap-3">
      <section aria-label={t("label")} className="flex flex-col gap-3">
        <p className="text-label text-fg-heading">{offer.stale ? t("stale") : t("fresh")}</p>
        {offer.stale ? <p className="text-body-sm text-fg-body">{t("staleConsequence")}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={onRestore}>
            {t("restore")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            {t("delete")}
          </Button>
        </div>
      </section>
    </Panel>
  );
}
