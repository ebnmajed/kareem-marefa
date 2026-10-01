import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { dayShortLabel } from "@/components/sessions/day-label";
import { formatNumber } from "@/components/sessions/numerals";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerRow } from "@/components/ui/ledger-row";
import { Link } from "@/components/ui/link";
import { SectionHeader } from "@/components/ui/section-header";
import { orgMonthOf, type LedgerEntry, type LedgerItem } from "@/lib/dal/points";
import { PointsTable, type PointsTableRow } from "@/components/scoring/points-table";

// SCR-022's ledger — `Points.dc.html` (phone) and `HubDesktop.dc.html` (desktop, a table), `M10c.md` §2 (wave 20,
// REQ-UIX-072, REQ-PTS-003, DEC-216 §5.5, §5.9). scoring's file.
//
// ★ REQ-PTS-003 is the specification: a member explains every point without asking anyone. So every ledger row is
// drawn — once — with ITS OWN reason, never a label in its place, and a link to the session that caused it; and the
// two absences the ledger cannot hold are explained where they happened:
//   · the cap — ★ an EXPLANATION, never a ledger row, view or table: drawn as `0`, «الحد: …» (`capped_award_explanations()`);
//   · the missed day of a multi-day session (REQ-SES-017) — no figure at all, the absence of a number being the fact.
//
// ★ The reversal pair is one row (DEC-216 §5.9): the compensating row with its FIXED system reason — never the
// admin's free text, which lives on `check_ins.removal_reason` and `audit_log` only (wave 7, contract 3) — and the
// row it reverses, struck, beneath it. A loss is coral AND carries its minus (REQ-NFR-007).
//
// The phone list keeps `id="history"` (two suites scope to it); the desktop table is `id="history-table"`, outside
// it, so no phone locator ever meets two copies. Both are in the document; CSS shows one.

type T = Awaited<ReturnType<typeof getTranslations>>;

const MINUS = "−";

/** «+50», «−50», «0» — the figure drawn, sign first. */
export function signedFigure(amount: number): string {
  if (amount > 0) return `+${formatNumber(amount)}`;
  if (amount < 0) return `${MINUS}${formatNumber(Math.abs(amount))}`;
  return "0";
}

function when(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

function monthTitle(key: string, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
}

function figureLabel(amount: number, t: T): string {
  const value = formatNumber(Math.abs(amount));
  return amount < 0 ? t("ledger.loss", { count: Math.abs(amount), value }) : t("ledger.gain", { count: amount, value });
}

function sessionLink(entry: { sessionId: string | null; sessionTitle: string | null }): ReactNode {
  if (!entry.sessionId || !entry.sessionTitle) return null;
  return (
    <Link href={`/app/sessions/${entry.sessionId}`} className="underline-offset-4 hover:underline">
      <bdi>{entry.sessionTitle}</bdi>
    </Link>
  );
}

function joinMeta(parts: ReactNode[]): ReactNode {
  const present = parts.filter((p) => p !== null && p !== undefined && p !== false);
  return present.map((p, i) => (
    <span key={i}>
      {i > 0 ? " · " : null}
      {p}
    </span>
  ));
}

/** The title and the quiet line of a ledger row — the row's own reason, always. */
function entryText(entry: LedgerEntry, t: T, timeZone: string, locale: string): { title: ReactNode; meta: ReactNode } {
  const time = when(entry.occurredAt, timeZone, locale);
  if (entry.isManualAdjustment) {
    const reason = entry.actorName
      ? t.rich("ledger.manualBy", { reason: entry.reason, name: entry.actorName, bdi: (c) => <bdi>{c}</bdi> })
      : t.rich("ledger.manualReason", { reason: entry.reason, bdi: (c) => <bdi>{c}</bdi> });
    return { title: t("row.manual"), meta: joinMeta([reason, sessionLink(entry), time]) };
  }
  return { title: <bdi>{entry.reason}</bdi>, meta: joinMeta([sessionLink(entry), time]) };
}

async function rowFor(item: LedgerItem, t: T, td: T, timeZone: string, locale: string, joiner: Intl.ListFormat): Promise<ReactNode> {
  if (item.kind === "missed") {
    const { notice } = item;
    const days = joiner.format(notice.days.map((day) => dayShortLabel(day, td)));
    return (
      <LedgerRow
        key={`missed-${notice.sessionId}`}
        kind="notice"
        title={t("row.missed.title")}
        meta={joinMeta([t("row.missed.days", { count: notice.days.length, days }), t("row.missed.rule"), sessionLink({ sessionId: notice.sessionId, sessionTitle: notice.sessionTitle }), when(notice.completedAt, timeZone, locale)])}
      />
    );
  }
  if (item.kind === "cap") {
    const { cap } = item;
    return (
      <LedgerRow
        key={`cap-${cap.sessionId}-${cap.ruleKey}`}
        kind="cap"
        value={0}
        figure="0"
        figureLabel={t("ledger.gain", { count: 0, value: "0" })}
        title={<bdi>{cap.reason}</bdi>}
        meta={joinMeta([
          t("ledger.capComment", { count: cap.capPerSession, value: formatNumber(cap.capPerSession) }),
          sessionLink({ sessionId: cap.sessionId, sessionTitle: cap.sessionTitle }),
          when(cap.at, timeZone, locale),
        ])}
      />
    );
  }
  if (item.kind === "reversal") {
    const { entry, reversed } = item;
    const own = entryText(reversed ?? entry, t, timeZone, locale);
    return (
      <LedgerRow
        key={entry.id}
        kind="reversal"
        value={entry.amount}
        figure={signedFigure(entry.amount)}
        figureLabel={figureLabel(entry.amount, t)}
        title={t("row.reversal")}
        meta={joinMeta([<bdi key="r">{entry.reason}</bdi>, reversed ? null : sessionLink(entry), when(entry.occurredAt, timeZone, locale)])}
        reversed={reversed ? { figure: signedFigure(reversed.amount), figureLabel: figureLabel(reversed.amount, t), title: own.title, meta: own.meta } : null}
      />
    );
  }
  const { entry } = item;
  const text = entryText(entry, t, timeZone, locale);
  return <LedgerRow key={entry.id} value={entry.amount} figure={signedFigure(entry.amount)} figureLabel={figureLabel(entry.amount, t)} title={text.title} meta={text.meta} />;
}

/** The desktop table's rows — the same items, a reversal as two rows. Plain data: the table is a client component. */
function tableRows(items: LedgerItem[], t: T, td: T, timeZone: string, locale: string, joiner: Intl.ListFormat): PointsTableRow[] {
  const out: PointsTableRow[] = [];
  const base = (entry: LedgerEntry) => ({
    date: when(entry.occurredAt, timeZone, locale),
    figure: signedFigure(entry.amount),
    figureLabel: figureLabel(entry.amount, t),
    tone: entry.amount > 0 ? ("gain" as const) : entry.amount < 0 ? ("loss" as const) : ("none" as const),
    session: entry.sessionId && entry.sessionTitle ? { href: `/app/sessions/${entry.sessionId}`, title: entry.sessionTitle } : null,
  });
  const manualReason = (entry: LedgerEntry) =>
    entry.actorName ? `${t("row.manual")}: «${entry.reason}» — ${entry.actorName}` : `${t("row.manual")}: «${entry.reason}»`;
  for (const item of items) {
    if (item.kind === "entry") {
      out.push({ key: item.entry.id, ...base(item.entry), reason: item.entry.isManualAdjustment ? manualReason(item.entry) : item.entry.reason, look: "plain" });
    } else if (item.kind === "reversal") {
      const { entry, reversed } = item;
      const note = reversed ? ` ${t.markup("ledger.reverses", { date: when(reversed.occurredAt, timeZone, locale), bdi: (c) => c })}` : "";
      out.push({ key: entry.id, ...base(entry), reason: `${t("row.reversal")}: ${entry.reason}${note}`, look: "plain" });
      if (reversed) out.push({ key: reversed.id, ...base(reversed), reason: reversed.isManualAdjustment ? manualReason(reversed) : reversed.reason, look: "struck" });
    } else if (item.kind === "cap") {
      const { cap } = item;
      out.push({
        key: `cap-${cap.sessionId}-${cap.ruleKey}`,
        date: when(cap.at, timeZone, locale),
        figure: "0",
        figureLabel: t("ledger.gain", { count: 0, value: "0" }),
        tone: "none",
        reason: `${cap.reason} · ${t("ledger.capComment", { count: cap.capPerSession, value: formatNumber(cap.capPerSession) })}`,
        session: cap.sessionTitle ? { href: `/app/sessions/${cap.sessionId}`, title: cap.sessionTitle } : null,
        look: "muted",
      });
    } else {
      const { notice } = item;
      const days = joiner.format(notice.days.map((day) => dayShortLabel(day, td)));
      out.push({
        key: `missed-${notice.sessionId}`,
        date: when(notice.completedAt, timeZone, locale),
        figure: "",
        figureLabel: "",
        tone: "none",
        reason: `${t("row.missed.title")} · ${t("row.missed.days", { count: notice.days.length, days })}`,
        session: { href: `/app/sessions/${notice.sessionId}`, title: notice.sessionTitle },
        look: "muted",
      });
    }
  }
  return out;
}

export async function PointsLedger({
  items,
  rowCount,
  shown,
  moreHref,
  filtered,
  timeZone,
  locale,
}: {
  items: LedgerItem[];
  rowCount: number;
  shown: number;
  /** The same URL with more rows — null when every row is shown. */
  moreHref: string | null;
  filtered: boolean;
  timeZone: string;
  locale: string;
}) {
  const [t, td] = await Promise.all([getTranslations("scoring.points"), getTranslations("sessions.days")]);
  const joiner = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });

  if (items.length === 0) {
    // ★ REQ-UIX-012: an empty state names its next action. Filtered empty offers to drop the filter.
    return filtered ? (
      <EmptyState size="sm" title={t("ledger.filteredEmpty")} action={{ label: t("filters.clear"), href: "/app/me/points" }} />
    ) : (
      <EmptyState size="sm" title={t("empty")} action={{ label: t("browseAction"), href: "/app/sessions" }} />
    );
  }

  // Month groups, in the ORG's zone, newest first — the items arrive sorted.
  const groups: Array<{ key: string; items: LedgerItem[] }> = [];
  for (const item of items) {
    const key = orgMonthOf(item.at, timeZone);
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  const rendered = await Promise.all(groups.map(async (g) => ({ key: g.key, rows: await Promise.all(g.items.map((item) => rowFor(item, t, td, timeZone, locale, joiner))) })));

  return (
    <>
      <div id="history" className="flex flex-col gap-4 lg:hidden">
        {rendered.map((g) => (
          <section key={g.key} aria-labelledby={`month-${g.key}`} className="flex flex-col gap-1.5">
            <SectionHeader id={`month-${g.key}`} title={monthTitle(g.key, locale)} />
            <ul className="flex flex-col gap-1.5">{g.rows}</ul>
          </section>
        ))}
        {moreHref ? (
          <Link href={moreHref} className="self-center py-1.5 text-caption text-fg-muted underline-offset-4 hover:underline">
            {t("ledger.more")}
          </Link>
        ) : null}
      </div>

      <div className="hidden flex-col gap-3 lg:flex">
        <PointsTable
          id="history-table"
          label={t("title")}
          rows={tableRows(items, t, td, timeZone, locale, joiner)}
          headers={{ date: t("table.date"), amount: t("table.amount"), reason: t("table.reason"), session: t("table.session"), noSession: t("ledger.noSession") }}
        />
        <div className="flex items-center justify-between text-caption text-fg-muted">
          <span>{t.rich("ledger.shownOf", { shown: formatNumber(shown), count: rowCount, value: formatNumber(rowCount), bdi: (c) => <bdi>{c}</bdi> })}</span>
          {moreHref ? (
            <Link href={moreHref} className="underline-offset-4 hover:underline">
              {t("ledger.older")}
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
