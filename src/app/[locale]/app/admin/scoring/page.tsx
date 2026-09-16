import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { splitDuration } from "@/components/admin/duration";
import { formatNumber } from "@/components/sessions/numerals";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import {
  PENALTY_ACTIONS,
  REWARD_ATTENDEE_ACTIONS,
  REWARD_PRESENTER_ACTIONS,
  getScoringAdminData,
  intervalToSeconds,
  listHostableSessions,
  type ConfigHistoryRow,
} from "@/lib/dal/scoring-admin";
import { saveCompanyHostingRule, saveCompanyPercentRule, saveManualAdjustment, saveScoringRule, saveSessionHostCompany } from "./actions";
import { CompanyRulesTable } from "./company-rules-table";
import { HistoryTable, type HistoryDisplayRow } from "./history-table";
import { HostCompanyForm } from "./host-company-form";
import { ManualAdjustmentForm } from "./manual-adjustment-form";
import { RulesTable } from "./rules-table";

// SCR-053 · /app/admin/scoring — REQ-PTS-004 … 010, REQ-ADM-011, on the M9
// system for wave 8 (K5). Admin only: `getScoringAdminData()` answers null for
// anyone else and the page answers with the streamed not-found (`DEC-134`).
//
// Every value here is read live by /app/me/points' catalogue section
// (REQ-PTS-014) — a save is visible to every member at once, and affects awards
// from that point forward only (REQ-PTS-004): a ledger row already written
// keeps the rule_version and amount it was written with.
//
// ★ THE CATALOGUE IS FIXED. An admin edits values and never adds an action:
// `action_key` and `actor` are outside the update grant (`0027`), and «الحجز»
// and «التفاعل» cannot appear because the check constraint does not admit them
// (`REQ-PTS-010`). The deductions are grouped apart, at 0, «مغلقة افتراضيًا»
// (SCR-053's own note, `REQ-PTS-008`).
//
// Each rule is edited in its own dialog rather than fourteen always-open forms,
// each with its own primary «حفظ» (`16` §3, principle 2). The history section
// keeps the id `history-heading`: the audit log links to it (K1).

export default async function ScoringAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, data, members, sessions] = await Promise.all([getTranslations("scoring.admin"), getScoringAdminData(locale), listMembersForAdmin(locale), listHostableSessions(locale)]);
  if (!data || !sessions) notFound();

  const byGroup = (keys: readonly string[]) => keys.map((key) => data.rules.find((r) => r.actionKey === key)).filter((r): r is NonNullable<typeof r> => r !== undefined);
  const bound = locale as Locale;

  // The history's values, in words: a boolean is on or off, a cooldown is a
  // duration, a number is a number, text is itself.
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
      <PageHeader title={t("title")} description={t("intro")} />

      <section aria-labelledby="catalogue-heading" className="mt-10">
        <SectionHeader as="h2" id="catalogue-heading" title={t("catalogue.heading")} description={t("catalogue.fixedNote")} />

        <div className="mt-6 space-y-8">
          <section aria-labelledby="attendee-heading">
            <SectionHeader as="h3" id="attendee-heading" title={t("catalogue.attendeeHeading")} />
            <div className="mt-3">
              <RulesTable rules={byGroup(REWARD_ATTENDEE_ACTIONS)} kind="reward" label={t("catalogue.listLabel.attendee")} action={saveScoringRule.bind(null, bound)} />
            </div>
          </section>
          <section aria-labelledby="presenter-heading">
            <SectionHeader as="h3" id="presenter-heading" title={t("catalogue.presenterHeading")} />
            <div className="mt-3">
              <RulesTable rules={byGroup(REWARD_PRESENTER_ACTIONS)} kind="reward" label={t("catalogue.listLabel.presenter")} action={saveScoringRule.bind(null, bound)} />
            </div>
          </section>
          <section aria-labelledby="penalty-heading">
            <SectionHeader as="h3" id="penalty-heading" title={t("catalogue.penaltyHeading")} description={t("catalogue.penaltyNote")} />
            <div className="mt-3">
              <RulesTable rules={byGroup(PENALTY_ACTIONS)} kind="penalty" label={t("catalogue.listLabel.penalty")} action={saveScoringRule.bind(null, bound)} />
            </div>
          </section>
        </div>
      </section>

      <section aria-labelledby="company-rules-heading" className="mt-12">
        <SectionHeader as="h2" id="company-rules-heading" title={t("companyRules.heading")} description={t("companyRules.intro")} />
        <div className="mt-4">
          <CompanyRulesTable rules={data.companyRules} hostingAction={saveCompanyHostingRule.bind(null, bound)} percentAction={saveCompanyPercentRule.bind(null, bound)} />
        </div>
        <section aria-labelledby="host-company-heading" className="mt-8">
          <SectionHeader as="h3" id="host-company-heading" title={t("hostCompany.heading")} description={t("hostCompany.intro")} />
          <div className="mt-4">
            <HostCompanyForm action={saveSessionHostCompany.bind(null, bound)} sessions={sessions} companies={data.companies} timeZone={data.timeZone} locale={locale} />
          </div>
        </section>
      </section>

      <section aria-labelledby="manual-heading" className="mt-12">
        <SectionHeader as="h2" id="manual-heading" title={t("manual.heading")} description={t("manual.intro")} />
        <div className="mt-4">
          <ManualAdjustmentForm action={saveManualAdjustment.bind(null, bound)} members={members ?? []} />
        </div>
      </section>

      <section aria-labelledby="history-heading" className="mt-12">
        <SectionHeader as="h2" id="history-heading" title={t("history.heading")} description={t("history.intro")} />
        <div className="mt-4">
          <HistoryTable rows={history} timeZone={data.timeZone} locale={locale} />
        </div>
      </section>
    </>
  );
}
