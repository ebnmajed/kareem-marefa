import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EditorSurface } from "@/components/admin/editor-surface";
import { splitDuration } from "@/components/admin/duration";
import { relativeWhen, whenWords } from "@/components/scoring/relative-when";
import { formatNumber } from "@/components/sessions/numerals";
import { ButtonLink } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import {
  PENALTY_ACTIONS,
  REWARD_ATTENDEE_ACTIONS,
  REWARD_PRESENTER_ACTIONS,
  getConfigLastSave,
  getScoringAdminData,
  intervalToSeconds,
  type ConfigHistoryRow,
  type ScoringRule,
} from "@/lib/dal/scoring-admin";
import { saveCatalogue, saveManualAdjustment } from "./actions";
import { CatalogueEdit, type EditableCompanyRule, type EditableRule } from "./catalogue-edit";
import { CatalogueTable } from "./catalogue-table";
import { HistoryTable, type HistoryDisplayRow } from "./history-table";
import { ManualAdjustment } from "./manual-adjustment";
import type { Opened } from "./state";

// SCR-053 · /app/admin/scoring — written from `AdminScoring.dc.html` (`REQ-UIX-100`, `STORY-UIX-090`) after the old page
// was deleted (`DEC-208`); the kept-behaviour table is `notes/scoring.md`'s «053», sixteen rows.
//
// ★ THE JOB (DEC-231 §0.3): the catalogue is editable WITHOUT BREAKING WHAT A MEMBER READS. Every value here is read
// live by SCR-022 (REQ-PTS-014); a save applies to the NEXT award only — a written ledger row keeps its amount, its
// reason and the rule_version it was written under (REQ-PTS-004, REQ-PTS-011) — and SCR-022's cap explanation is judged
// by the rule as it stood (`capped_award_explanations()`, DEC-232 §4). The reason each row shows under the action is
// what the member reads in their own history (REQ-PTS-003).
//
// ★ READ BY DEFAULT (REQ-UIX-091): the h1 row with «تعديل يدوي» and «عدّل», the saved mark — the history rows the last
// save wrote, with its time and author, never the client's clock — and the tables. «عدّل» is a link to `?edit`, so edit
// mode works before and without hydration; nothing is written until «احفظ», in one transaction.
// ★ THE CATALOGUE IS FIXED (REQ-PTS-010): an admin edits values and never adds an action; الحجز and التفاعل are absent,
// not zero — the check constraint does not admit them. The deductions are grouped apart, typed as a cost (REQ-PTS-008).
// ★ The company rules are one line, read; its «عدّل» enters the same edit mode at the company rules (DEC-230 §2: hosting
// follows the venue's owner — nothing on this page names a session's host any more).
// ★ The history stays (REQ-PTS-005, DEC-231 §4.3), keeping `id="history-heading"`: the audit log links to it.
//
// Admin only: `getScoringAdminData()` answers null for anyone else and the page answers with the streamed not-found
// (`DEC-134`); a moderator never reaches it (`REQ-ADM-020`), and the grants refuse the write regardless.

const PATH = "/app/admin/scoring";
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

export default async function ScoringAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string; adjust?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, data, sp] = await Promise.all([getTranslations("scoring.admin"), getScoringAdminData(locale), searchParams]);
  if (!data) notFound();
  const bound = locale as Locale;
  const editing = sp.edit !== undefined;
  const adjusting = !editing && sp.adjust === "1";
  const [members, mark] = await Promise.all([adjusting ? listMembersForAdmin(locale) : Promise.resolve(null), getConfigLastSave(locale, ["scoring", "company_scoring"])]);

  const byKeys = (keys: readonly string[]) => keys.map((key) => data.rules.find((r) => r.actionKey === key)).filter((r): r is ScoringRule => r !== undefined);
  const name = (actionKey: string) => (t.has(`actions.${actionKey}`) ? t(`actions.${actionKey}`) : actionKey);
  const row = (r: ScoringRule): EditableRule => ({
    id: r.id,
    actionKey: r.actionKey,
    name: name(r.actionKey),
    reason: r.reasonAr,
    points: r.points,
    capPerSession: r.capPerSession,
    cooldownSeconds: r.cooldownSeconds,
    enabled: r.enabled,
    penalty: (PENALTY_ACTIONS as readonly string[]).includes(r.actionKey),
    version: r.version,
  });
  const rewards = byKeys([...REWARD_ATTENDEE_ACTIONS, ...REWARD_PRESENTER_ACTIONS]).map(row);
  const penalties = byKeys(PENALTY_ACTIONS).map(row);
  const company: EditableCompanyRule[] = data.companyRules.map((r) => ({ ...r, name: name(r.actionKey) }));

  if (editing) {
    const opened: Opened = {
      rules: [...rewards, ...penalties].map((r) => ({ id: r.id, actionKey: r.actionKey, version: r.version, penalty: r.penalty })),
      company: company.map((r) => ({ id: r.id, actionKey: r.actionKey, version: r.version })),
    };
    return (
      <>
        <PageHeader inlineActions title={t("title")} />
        <CatalogueEdit
          action={saveCatalogue.bind(null, bound)}
          groups={[
            { id: "rewards", heading: null, rules: rewards },
            { id: "penalties", heading: t("read.penalties"), rules: penalties },
          ]}
          company={company}
          opened={opened}
        />
      </>
    );
  }

  // The company rules as one line, every value read.
  const companyPart = (r: EditableCompanyRule) => {
    const off = r.enabled ? null : <> ({t("read.off")})</>;
    if (r.actionKey === "company_hosting") {
      return (
        <>
          {t.rich("read.company.hosting", { value: formatNumber(r.points ?? 0), bdi })}
          {off}
        </>
      );
    }
    return (
      <>
        {t.rich(r.actionKey === "company_attendance_pct" ? "read.company.attendance" : "read.company.presenting", {
          per: formatNumber(r.pointsPerPercent ?? 0),
          cap: formatNumber(r.capPoints ?? 0),
          min: formatNumber(r.minActiveMembers ?? 0),
          bdi,
        })}
        {off}
      </>
    );
  };

  // The saved mark: a relative day and the time (the boards' dates), the instant on the element.
  const now = new Date().toISOString();
  const markWhen = mark ? whenWords((k, v) => t.markup(k as never, v as never), "read.when", relativeWhen(mark.at, now, mark.timeZone, locale)) : "";
  const markLine = mark
    ? mark.actor?.displayName
      ? t.rich("read.savedMarkBy", { time: markWhen, actor: mark.actor.displayName, bdi })
      : t.rich("read.savedMark", { time: markWhen, bdi })
    : null;

  // The history's values, in words: a boolean is on or off, a cooldown is a duration, a number is a number.
  const valueText = (field: string, value: unknown): string => {
    if (value === null || value === undefined) return t("history.none");
    if (typeof value === "boolean") return value ? t("history.on") : t("history.off");
    if (field === "cooldown" && typeof value === "string") {
      const seconds = intervalToSeconds(value);
      if (!seconds) return t("history.none");
      const { amount, unit } = splitDuration(seconds, "seconds", ["seconds", "minutes", "hours", "days"]);
      return t.markup(`catalogue.cooldown.${unit}`, { count: amount, value: formatNumber(amount), bdi: (chunks) => chunks });
    }
    if (typeof value === "number") return formatNumber(value);
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return formatNumber(Number(value));
    return String(value);
  };
  const history: HistoryDisplayRow[] = data.history.map((h: ConfigHistoryRow) => ({
    id: h.id,
    rule: h.actionKey && t.has(`actions.${h.actionKey}`) ? t(`actions.${h.actionKey}`) : t("history.unknownRule"),
    field: t.has(`history.fields.${h.field}`) ? t(`history.fields.${h.field}`) : h.field,
    from: valueText(h.field, h.oldValue),
    to: valueText(h.field, h.newValue),
    who: h.actorId ? (h.actorName ?? t("history.unknownActor")) : t("history.system"),
    changedAt: h.changedAt,
  }));

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`${PATH}?adjust=1#manual-adjustment`} variant="secondary" size="md">
              {t("manual.heading")}
            </ButtonLink>
            <ButtonLink href={`${PATH}?edit`} size="md">
              {t("read.edit")}
            </ButtonLink>
          </div>
        }
      />
      {markLine && mark ? (
        <p className="mt-2 text-caption text-fg-muted" data-saved-at={mark.at}>
          {markLine}
        </p>
      ) : null}

      <section aria-labelledby="catalogue-heading" className="mt-6">
        <h2 id="catalogue-heading" className="sr-only">
          {t("catalogue.heading")}
        </h2>
        <CatalogueTable label={t("catalogue.heading")} rows={rewards} />
      </section>

      <section aria-labelledby="penalty-heading" className="mt-8">
        <SectionHeader as="h2" id="penalty-heading" title={t("read.penalties")} />
        <div className="mt-3">
          <CatalogueTable label={t("read.penalties")} rows={penalties} />
        </div>
      </section>

      <p className="mt-6 text-body-sm text-fg-muted">
        {t("read.companies")}:{" "}
        {company.map((r, i) => (
          <span key={r.id}>
            {i > 0 ? " · " : null}
            {companyPart(r)}
          </span>
        ))}{" "}
        · <Link href={`${PATH}?edit#company-rules`}>{t("read.edit")}</Link>
      </p>

      <section aria-labelledby="history-heading" className="mt-12">
        <SectionHeader as="h2" id="history-heading" title={t("history.heading")} />
        <div className="mt-4">
          <HistoryTable rows={history} timeZone={data.timeZone} locale={locale} now={now} />
        </div>
      </section>

      {adjusting ? (
        <EditorSurface id="manual-adjustment" title={t("manual.heading")} closeHref={PATH} closeLabel={t("read.close")}>
          <ManualAdjustment action={saveManualAdjustment.bind(null, bound)} members={members ?? []} />
        </EditorSurface>
      ) : null}
    </>
  );
}
