"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { DataTable, DataTableSwatchCell } from "@/components/ui/data-table";
import { Link } from "@/components/ui/link";
import type { BadgeRule } from "@/lib/dal/scoring-admin";

// SCR-054 in READ mode — `AdminRecognition.dc.html`'s two tables, levels (المستوى · من · اللون) beside badges (الشارة ·
// القاعدة · مُنحت · مفعّلة), and the two the artboard does not draw and `REQ-ADM-012` keeps (`DEC-232` §5.2): perks and
// the monthly streak. ★ A read-mode value is TEXT with a glyph, never a control (`DEC-232` §3.4).
// ★ A level's colour is its RAMP STOP — `sort_order`, never the name, as `level-card` and `badge-medallion` key it — a
// swatch AND its word, read-only: levels have no colour column (D9).
// ★ «مُنحت» is a count, never who (`badge_holder_counts()`).

export interface LevelView {
  id: string;
  name: string;
  thresholdPoints: number;
  sortOrder: number;
}
export interface BadgeView {
  id: string;
  name: string;
  rule: BadgeRule;
  holders: number;
  retired: boolean;
}
export interface PerkView {
  id: string;
  key: "priority_rsvp" | "can_host";
  enabled: boolean;
  levelName: string | null;
  badgeName: string | null;
}
export interface StreakView {
  id: string;
  requiredCount: number;
  enabled: boolean;
}

const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
/** 042's surface card at `md`+ — the wave's ruling for every console table; the phone stays cards. */
const CARD = "md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1";
const RAMP = ["var(--color-level-1)", "var(--color-level-2)", "var(--color-level-3)", "var(--color-level-4)", "var(--color-level-5)"] as const;
/** `levels.sort_order` → a ramp stop, clamped to 1–5 — the rule `level-card` and `badge-medallion` keep. */
const stop = (sortOrder: number) => Math.min(5, Math.max(1, Math.round(sortOrder)));

function State({ on, onWord, offWord }: { on: boolean; onWord: string; offWord: string }) {
  return (
    <span className={`whitespace-nowrap ${on ? "text-fg-heading" : "text-fg-muted"}`}>
      <span aria-hidden="true">{on ? "✓ " : "— "}</span>
      {on ? onWord : offWord}
    </span>
  );
}

export function useBadgeRuleWords() {
  const t = useTranslations("recognition.admin.badges");
  return (rule: BadgeRule) => {
    if (rule.metric === "manual" || rule.gte === null) return t("rules.manual");
    if (rule.metric === "presenter_rating_avg") return t.rich("rules.presenter_rating_avg", { avg: formatNumber(rule.gte), count: rule.minSessions ?? 0, value: formatNumber(rule.minSessions ?? 0), bdi });
    return t.rich(`rules.${rule.metric}`, { count: rule.gte, value: formatNumber(rule.gte), bdi });
  };
}

export function LevelsTable({ rows }: { rows: LevelView[] }) {
  const t = useTranslations("recognition.admin");
  const columns: DataTableColumn<LevelView>[] = [
    { key: "level", header: t("read.colLevel"), onCard: true, cell: (r) => <bdi className="text-fg-heading">{r.name}</bdi> },
    {
      key: "from",
      header: t("read.colFrom"),
      onCard: true,
      cell: (r) => <bdi>{formatNumber(r.thresholdPoints)}</bdi>,
    },
    {
      key: "colour",
      header: t("read.colColour"),
      onCard: true,
      cell: (r) => <DataTableSwatchCell color={RAMP[stop(r.sortOrder) - 1]} colorName={t(`read.ramp.${stop(r.sortOrder)}`)} />,
    },
  ];
  return <DataTable className={CARD} label={t("levels.listLabel")} columns={columns} rows={rows} rowKey={(r) => r.id} empty={{ title: t("common.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }} />;
}

export function BadgesTable({ rows }: { rows: BadgeView[] }) {
  const t = useTranslations("recognition.admin");
  const ruleWords = useBadgeRuleWords();
  const columns: DataTableColumn<BadgeView>[] = [
    {
      key: "badge",
      header: t("read.colBadge"),
      onCard: true,
      // The badge's full record — description, rule, certificate — opens in its own sheet (D5).
      cell: (r) => (
        <Link href={`/app/admin/recognition?badge=${r.id}#badge-editor`} className="text-fg-heading">
          <bdi>{r.name}</bdi>
        </Link>
      ),
    },
    { key: "rule", header: t("read.colRule"), onCard: true, cell: (r) => <span>{ruleWords(r.rule)}</span> },
    { key: "holders", header: t("read.colHolders"), onCard: true, cell: (r) => <bdi>{formatNumber(r.holders)}</bdi> },
    { key: "enabled", header: t("read.colEnabled"), onCard: true, cell: (r) => <State on={!r.retired} onWord={t("read.on")} offWord={t("read.off")} /> },
  ];
  return <DataTable className={CARD} label={t("badges.listLabel")} columns={columns} rows={rows} rowKey={(r) => r.id} empty={{ title: t("common.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }} />;
}

export function PerksTable({ rows }: { rows: PerkView[] }) {
  const t = useTranslations("recognition.admin");
  const columns: DataTableColumn<PerkView>[] = [
    { key: "perk", header: t("perks.colPerk"), onCard: true, cell: (r) => <span className="text-fg-heading">{t(`perks.${r.key}`)}</span> },
    {
      key: "qualifier",
      header: t("perks.colQualifier"),
      onCard: true,
      cell: (r) => (r.levelName ? t.rich("perks.atLevel", { name: r.levelName, bdi }) : r.badgeName ? t.rich("perks.withBadge", { name: r.badgeName, bdi }) : "—"),
    },
    { key: "enabled", header: t("read.colEnabled"), onCard: true, cell: (r) => <State on={r.enabled} onWord={t("read.on")} offWord={t("read.off")} /> },
  ];
  return <DataTable className={CARD} label={t("perks.listLabel")} columns={columns} rows={rows} rowKey={(r) => r.id} empty={{ title: t("common.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }} />;
}

export function StreaksTable({ rows }: { rows: StreakView[] }) {
  const t = useTranslations("recognition.admin");
  const columns: DataTableColumn<StreakView>[] = [
    { key: "streak", header: t("streaks.colStreak"), onCard: true, cell: () => <span className="text-fg-heading">{t("streaks.name")}</span> },
    { key: "rule", header: t("read.colRule"), onCard: true, cell: (r) => t.rich("streaks.rule", { count: r.requiredCount, value: formatNumber(r.requiredCount), bdi }) },
    { key: "enabled", header: t("read.colEnabled"), onCard: true, cell: (r) => <State on={r.enabled} onWord={t("read.on")} offWord={t("read.off")} /> },
  ];
  return <DataTable className={CARD} label={t("streaks.listLabel")} columns={columns} rows={rows} rowKey={(r) => r.id} empty={{ title: t("common.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }} />;
}
