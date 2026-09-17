import { getTranslations } from "next-intl/server";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getMaterialsPageData, type MaterialSummary } from "@/lib/dal/materials";
import type { SessionDay } from "@/lib/dal/sessions";
import { dayLabel, dayShortLabel, type DayLabelT } from "@/components/sessions/day-label";
import { formatNumber } from "@/components/sessions/numerals";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Link } from "@/components/ui/link";
import { LinkIcon } from "@/components/ui/icons";
import { SettingsForm } from "@/components/materials/settings-form";
import { UploadForm } from "@/components/materials/upload-form";
import { RescopeChip, type RescopeOption } from "@/components/materials/rescope-chip";
import { phaseLabelKey } from "@/components/materials/phase-label";
import { GroupDisclosure } from "@/components/materials/group-disclosure";

// The `Materials` slot — `id="materials"`, «المواد» (`sessions.md` §22.2) —
// the session's materials list, phase-gated entirely by `materials_read`
// (03 §5.5a): this component never adds its own phase filter, so what it
// receives from the DAL is already exactly what the viewer is allowed to
// see.
//
// No <section>/<h2> of its own — the event page owns the landmark and the
// heading. `materialsSummary()` below shares this same cache()d read
// (`sessions.md` §22.4 R-C3) and its `visible` mirrors this component's own
// `null` return exactly (`16` §5.4.1a(b)).
//
// A `pdf` material links to SCR-013 (the viewer) once it has finished
// rendering; links never get a viewer link (REQ-MAT-007) — they render their
// own affordance instead. Uploads are PDF-only for the document kind
// (DEC-058); the uploader states the org's per-kind size limit before a
// file is chosen (REQ-UIX-024).
//
// ★ REQ-SES-018/DEC-121, contract 7. The branch below is `days.length <= 1`,
// never "every group happens to be empty right now" — at one day (or none)
// EVERY item renders flat, in exactly today's markup, whatever its own
// `sessionDayId`: a session cut back from two days to one may still hold
// content scoped to the day that remains (its `session_day_id` is untouched
// by that edit), and a bucket-count check would wrongly hide it. Only with
// more than one day does the grouped branch exist at all — the rule the
// sync-1 review caught before this shipped once already, and the reason it
// is spelled out here rather than left to be re-derived by the next reader.
export async function Materials({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("materials.list");
  const tDays = await getTranslations("sessions.days");
  const { materials, canManageAll, presenterOfSession, uploadLimits, days: rawDays, timeZone } = await getMaterialsPageData(locale, sessionId);
  const days = rawDays ?? [];
  const canManage = canManageAll || presenterOfSession;

  // ★ visible === false exactly when this returns null (sessions.md §22.4):
  // nothing to show and no manage right, so there is genuinely no next
  // action `EmptyState` could offer this viewer (REQ-UIX-012's own limit).
  if (materials.length === 0 && !canManage) return null;

  if (materials.length === 0) {
    const uploader = canManage ? (
      <div id="materials-upload-form" className="scroll-mt-4">
        <UploadForm locale={locale} sessionId={sessionId} uploadLimits={uploadLimits} />
      </div>
    ) : null;
    return (
      <div>
        <EmptyState title={t("empty")} action={{ label: t("addAction"), href: "#materials-upload-form" }} size="sm" />
        {uploader}
      </div>
    );
  }

  // ★ At n <= 1 there is no scope concept anywhere (REQ-SES-018's first acceptance bullet) — the
  // flat branch never imports RescopeChip's props and never renders a group heading, so this is
  // byte-for-byte what materials-schema's own e2e/component suites already assert.
  if (days.length <= 1) {
    return (
      <div>
        <p className="text-body-sm text-fg-muted">{t("count", { count: materials.length, value: formatNumber(materials.length) })}</p>
        <ul className="mt-4 flex flex-col gap-3">
          {materials.map((m) => (
            <li key={m.id}>
              <MaterialCard m={m} sessionId={sessionId} locale={locale} canManage={canManage} t={t} scope={null} />
            </li>
          ))}
        </ul>
        {canManage ? (
          <div id="materials-upload-form" className="mt-4 scroll-mt-4">
            <UploadForm locale={locale} sessionId={sessionId} uploadLimits={uploadLimits} />
          </div>
        ) : null}
      </div>
    );
  }

  const sessionScopeLabel = tDays("sessionScope");
  const groups = groupByDay(materials, days, sessionScopeLabel, timeZone ?? "Asia/Riyadh", tDays);
  const options: RescopeOption[] = [
    { id: null, label: sessionScopeLabel },
    ...days.map((d) => ({ id: d.id, label: dayShortLabel(d, tDays) })),
  ];

  return (
    <div>
      {groups
        .filter((g) => g.items.length > 0 || canManage)
        .map((g) => (
          <div key={g.dayId ?? "session"} className="mt-6 first:mt-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-body font-medium text-fg-heading">{g.heading}</h3>
              {/* ★ The lead's finding against the real build: mounting every group's form OPEN
                  made a three-day presenter page 9,000 CSS px tall. The form now sits behind
                  this native disclosure, closed by default — `GroupDisclosure`'s own header
                  explains the mechanics. */}
              {canManage ? (
                <GroupDisclosure summary={t("addAction")} summaryAriaLabel={t.markup("group.addAria", { scope: g.shortLabel, bdi: (chunks) => chunks })}>
                  <UploadForm locale={locale} sessionId={sessionId} uploadLimits={uploadLimits} sessionDayId={g.dayId} />
                </GroupDisclosure>
              ) : null}
            </div>
            {g.items.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-3">
                {g.items.map((m) => (
                  <li key={m.id}>
                    <MaterialCard m={m} sessionId={sessionId} locale={locale} canManage={canManage} t={t} scope={{ currentLabel: g.shortLabel, options }} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
    </div>
  );
}

interface MaterialGroup {
  dayId: string | null;
  heading: string;
  shortLabel: string;
  items: MaterialSummary[];
}

/** The session's own content first, then days in order (REQ-SES-018). An empty group is filtered
 *  by the caller for a plain member and kept for a manager, whose own «أضف» needs it. */
function groupByDay(materials: MaterialSummary[], days: SessionDay[], sessionScopeLabel: string, timeZone: string, tDays: DayLabelT): MaterialGroup[] {
  return [
    { dayId: null, heading: sessionScopeLabel, shortLabel: sessionScopeLabel, items: materials.filter((m) => (m.sessionDayId ?? null) === null) },
    ...days.map((d) => ({
      dayId: d.id,
      heading: dayLabel(d, timeZone, tDays),
      shortLabel: dayShortLabel(d, tDays),
      items: materials.filter((m) => m.sessionDayId === d.id),
    })),
  ];
}

interface MaterialCardProps {
  m: MaterialSummary;
  sessionId: string;
  locale: string;
  canManage: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"materials.list">>>;
  /** `null` at n <= 1 (REQ-SES-018: no scope concept at all); populated at n > 1, where every
   *  viewer sees the current scope and only a manager gets the interactive chip. */
  scope: { currentLabel: string; options: RescopeOption[] } | null;
}

/** One `<Card>`, shared by the flat and grouped branches so they can never drift apart — the
 *  flat branch always passes `scope={null}`, which renders nothing extra, so its output is
 *  identical to what this file rendered before REQ-SES-018. */
function MaterialCard({ m, sessionId, locale, canManage, t, scope }: MaterialCardProps) {
  return (
    <Card density="row">
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-body font-medium text-fg-heading">
              <bdi>{m.title}</bdi>
            </p>
            <p className="text-body-sm text-fg-muted">{t(`kind.${m.kind}`)}</p>
          </div>
          {/* قبل/بعد — never colour alone: the two phases keep
              distinct Arabic text on top of the distinct tone. REQ-MAT-006 as amended (DEC-121):
              phase is relative to the item's own SCOPE, never to the session, so a day-scoped
              material reads «قبل اليوم»/«بعد اليوم», never «…الجلسة» — the lead's own finding
              against the real build (the day-scoped chip still said «بعد الجلسة» while the
              workshop had two more days to run). */}
          <Badge tone={m.phase === "before" ? "info" : "neutral"} outline size="sm" className="shrink-0">
            {t(phaseLabelKey(m.phase, m.sessionDayId))}
          </Badge>
        </div>

        {/* The group heading already says which day/scope this card is under — a plain member
            gets no repeated label here, only a manager gets the chip that can move it. */}
        {scope && canManage ? (
          <RescopeChip
            locale={locale}
            sessionId={sessionId}
            materialId={m.id}
            currentLabel={scope.currentLabel}
            options={scope.options}
            triggerAriaLabel={t.markup("rescope.trigger", { label: scope.currentLabel, bdi: (chunks) => chunks })}
            failedLabel={t("rescope.failed")}
          />
        ) : null}

        {m.renderStatus === "pending" || m.renderStatus === "rendering" ? (
          <div className="mt-2 max-w-xs">
            <Progress label={t("renderStatus.pending")} />
          </div>
        ) : null}
        {m.renderStatus === "failed" ? (
          <Badge tone="error" size="sm" className="mt-2">
            {t("renderStatus.failed")}
          </Badge>
        ) : null}

        {m.fontSubstitutionWarning ? (
          <Panel tone="info" className="mt-2 p-3">
            <p className="text-body-sm text-fg-heading">
              {t.rich("substitutionWarning.body", { family: m.fontSubstitutionWarning, bdi: (chunks) => <bdi>{chunks}</bdi> })}
            </p>
          </Panel>
        ) : null}

        {m.kind === "pdf" && m.renderStatus === "ready" ? (
          // ★ `ui/link` prefixes the locale itself (`/app/…` arrives
          // at `/ar/app/…`) — the old raw `next/link` import needed
          // the manual `/${locale}` prefix this file used to carry;
          // keeping it here would have doubled it.
          <Link href={`/app/sessions/${sessionId}/materials/${m.id}`} className="mt-2 inline-block text-body-sm text-fg-body hover:text-fg-heading">
            {t("openViewer")}
          </Link>
        ) : null}

        {m.externalUrl ? (
          <a
            href={m.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-body-sm text-fg-body hover:text-fg-heading"
          >
            <LinkIcon aria-hidden className="text-[0.85em]" />
            {t("openExternal")}
          </a>
        ) : null}

        {canManage ? <SettingsForm locale={locale} materialId={m.id} phase={m.phase} allowDownload={m.allowDownload} sessionDayId={m.sessionDayId} /> : null}
      </CardBody>
    </Card>
  );
}

/**
 * `sessions.md` §22.3's `SlotSummaryReader` — the page ANDs this with its
 * own `can.materials !== "none"` gate (§22.2) before rendering the
 * `<section>`/`<h2>` at all. Shares `getMaterialsPageData`'s `cache()`d
 * read.
 */
export async function materialsSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { materials, canManageAll, presenterOfSession } = await getMaterialsPageData(locale, sessionId);
  const canManage = canManageAll || presenterOfSession;
  return { visible: materials.length > 0 || canManage, count: materials.length, outstanding: null };
}
