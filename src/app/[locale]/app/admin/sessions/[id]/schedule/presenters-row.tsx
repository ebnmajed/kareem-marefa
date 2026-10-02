"use client";

import { useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { ScheduleReadPresenter } from "@/lib/dal/sessions";
import { PresentersSection } from "./presenters-section";

// SCR-043's «المُقدِّمون» row — REQ-SES-019, DEC-228 §4.4. The faces and names as the read card draws them, and
// «غيّر», which opens a `sheet` holding `PresentersSection` unchanged. ★ Outside «عدّل» on purpose: the section is two
// forms of its own, which cannot nest inside the schedule's, and each add or remove is an immediate, audited RPC —
// not something the schedule's «إلغاء» could undo. Without `section`, the row is the names alone (edit mode).

export function PresentersRow({
  presenters,
  section,
}: {
  presenters: ScheduleReadPresenter[];
  /** The sheet's content's props — bound actions only, no closures (DEC-159). */
  section?: ComponentProps<typeof PresentersSection>;
}) {
  const t = useTranslations("schedule.read");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {presenters.map((p) => (
          <li key={p.memberId} className="flex items-center gap-2">
            <Avatar memberId={p.memberId} displayName={p.displayName} src={p.avatarUrl} teamColor={p.teamColor} size={32} decorative />
            <bdi>{p.displayName}</bdi>
            {p.accepted ? null : <Badge tone="neutral">{t("pendingPresenter")}</Badge>}
          </li>
        ))}
      </ul>
      {section ? (
        <>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
            {t("changePresenters")}
          </Button>
          <Sheet open={open} onOpenChange={setOpen} title={t("presentersSheet")} side="inline-end">
            <PresentersSection {...section} />
          </Sheet>
        </>
      ) : null}
    </div>
  );
}
