import { getTranslations } from "next-intl/server";
import { GroupDisclosure } from "@/components/materials/group-disclosure";
import { MaterialRow } from "@/components/materials/material-row";
import type { RescopeOption } from "@/components/materials/rescope-chip";
import { UploadForm } from "@/components/materials/upload-form";
import { EditOnly } from "@/components/sessions/edit-mode";
import { dayLabel, dayShortLabel } from "@/components/sessions/day-label";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getMaterialPlaybackUrl, getMaterialsPageData, type MaterialSummary } from "@/lib/dal/materials";

// The `Materials` slot — SCR-012's «المواد», written from `Event.dc.html:93-97`, `EventDone.dc.html:69-74` and
// `EventDesktop.dc.html:81-84` (DEC-208: this file was deleted and written anew; its kept-behaviour table is
// `docs/plan/notes/content.md` § PR B). REQ-MAT-002 … REQ-MAT-011, REQ-SES-018.
//
// ★ No `<section>`, no `<h2>`: the page owns the landmark and the heading (slot contract).
// ★ No phase filter of its own: `materials_read` (0116) is the gate, so what arrives is exactly what this
// viewer may see — a day-scoped «بعد» item appears when its own day ends (REQ-MAT-006, DEC-121).
// ★ `null` exactly when `materialsSummary()` says not visible: nothing to show and no right to add.
// ★ The dashed «يظهران هنا بعد انتهاء الجلسة» row is not drawn (DEC-206 §4.68): RLS returns no row to say so.
// ★ At one day (or none) every item is flat, whatever its own scope; groups exist only above one day.
// ★ The event page's edit mode (`sessions/edit-mode.tsx`): the uploader, each group's «أضف مادة» and a group that is
// empty for everyone but a manager are drawn in edit mode alone — read mode is what a member sees.

export async function Materials({ sessionId, locale }: SlotProps) {
  const [t, tUpload, tDays] = await Promise.all([getTranslations("materials.list"), getTranslations("materials.upload"), getTranslations("sessions.days")]);
  const { materials, canManageAll, presenterOfSession, uploadLimits, days: rawDays, timeZone } = await getMaterialsPageData(locale, sessionId);
  const days = rawDays ?? [];
  const canManage = canManageAll || presenterOfSession;
  if (materials.length === 0 && !canManage) return null;

  const playback = new Map(
    await Promise.all(materials.filter((m) => m.kind === "audio").map(async (m) => [m.id, await getMaterialPlaybackUrl(locale, m.id)] as const)),
  );

  const row = (m: MaterialSummary, scope: { currentLabel: string; options: RescopeOption[] } | null) => (
    <li key={m.id}>
      <MaterialRow m={m} sessionId={sessionId} locale={locale} canManage={canManage} scope={scope} playbackUrl={playback.get(m.id) ?? null} t={t} />
    </li>
  );

  if (days.length <= 1) {
    return (
      <div className="flex flex-col gap-3">
        {materials.length === 0 ? <p className="text-body text-fg-muted">{t("empty")}</p> : <ul className="flex flex-col gap-2">{materials.map((m) => row(m, null))}</ul>}
        {canManage ? (
          <EditOnly>
            <div id="materials-upload-form" className="scroll-mt-4">
              <p className="mb-2 text-caption text-fg-muted">{tUpload("notice")}</p>
              <UploadForm locale={locale} sessionId={sessionId} uploadLimits={uploadLimits} />
            </div>
          </EditOnly>
        ) : null}
      </div>
    );
  }

  const sessionScope = tDays("sessionScope");
  const options: RescopeOption[] = [{ id: null, label: sessionScope }, ...days.map((d) => ({ id: d.id, label: dayShortLabel(d, tDays) }))];
  const groups = [
    { dayId: null as string | null, heading: sessionScope, short: sessionScope, items: materials.filter((m) => (m.sessionDayId ?? null) === null) },
    ...days.map((d) => ({ dayId: d.id as string | null, heading: dayLabel(d, timeZone ?? "Asia/Riyadh", tDays, locale), short: dayShortLabel(d, tDays), items: materials.filter((m) => m.sessionDayId === d.id) })),
  ].filter((g) => g.items.length > 0 || canManage);

  return (
    <div className="flex flex-col gap-6">
      {materials.length === 0 ? <p className="text-body text-fg-muted">{t("empty")}</p> : null}
      {groups.map((g) => {
        const group = (
          <div key={g.dayId ?? "session"} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-label font-bold text-fg-heading">{g.heading}</h3>
              {canManage ? (
                <EditOnly>
                  <GroupDisclosure summary={t("addAction")} summaryAriaLabel={t.markup("group.addAria", { scope: g.short, bdi: (chunks) => chunks })}>
                    <UploadForm locale={locale} sessionId={sessionId} uploadLimits={uploadLimits} sessionDayId={g.dayId} />
                  </GroupDisclosure>
                </EditOnly>
              ) : null}
            </div>
            {g.items.length > 0 ? <ul className="flex flex-col gap-2">{g.items.map((m) => row(m, canManage ? { currentLabel: g.short, options } : null))}</ul> : null}
          </div>
        );
        // A group no member would see (empty, kept for its «أضف مادة») is drawn in edit mode alone.
        return g.items.length > 0 ? group : <EditOnly key={g.dayId ?? "session"}>{group}</EditOnly>;
      })}
    </div>
  );
}

/** The page's gate for the section and the sub-nav's count — the same `cache()`d read. */
export async function materialsSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { materials, canManageAll, presenterOfSession } = await getMaterialsPageData(locale, sessionId);
  const canManage = canManageAll || presenterOfSession;
  return { visible: materials.length > 0 || canManage, count: materials.length, outstanding: null, ...(materials.length === 0 && canManage ? { editOnly: true } : {}) };
}
