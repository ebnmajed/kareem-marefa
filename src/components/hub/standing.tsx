import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { isDocumentLoad } from "@/components/scoring/document-load";
import { MomentWeek, WeekFigure, type MomentWeekProps } from "@/components/scoring/moment-week";
import { acknowledgeWeekPoints, acknowledgeWeekRank } from "@/components/scoring/week-actions";
import { DisplayedOnly } from "@/components/hub/displayed-only";
import { Avatar } from "@/components/ui/avatar";
import { BadgeMedallion } from "@/components/ui/badge-medallion";
import { ArrowIcon, StarIcon } from "@/components/ui/icons";
import { LevelCard } from "@/components/ui/level-card";
import { Link } from "@/components/ui/link";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { getHubStanding, type HubStanding as HubStandingData } from "@/lib/dal/points";

// The hub's standing — contract 3 (wave 20, REQ-UIX-070, DEC-216 §5.10, DEC-218 §3.5, §3.7). scoring's file.
//
// ONE component, two forms: `card` is the phone's card on `/app/me` (`docs/design/screens/m10c/Me.dc.html`), placed
// by `content`'s page; `band` is the desktop band (`HubDesktop.dc.html`), placed by the lead's `me/layout.tsx`. It
// reads its own data (`getHubStanding()` → `requireSession()`), so whoever places it passes nothing but the form.
//
// ★ Every figure is read (contract 7): the balance, the level the nightly evaluation stored and `levelProgress()`'s
// fraction, this week's rank from the live week (contract 4), the streak in months, the badges held. An absence is
// words, never a zero.
//
// ★ Moments 3 and 5 through the EXISTING keying (`MomentWeek`, unchanged): the same occurrences `SCR-022`, the home
// and the boards decide, so whichever surface the member opens first plays and the rest are silent. ★ On `/app/me`
// both forms are in the document at every width; `MomentWeek` mounts its controller — the only code that claims,
// animates or acknowledges — in the DISPLAYED copy alone, so the `display:none` one plays nothing and writes no mark.
// The mark it acknowledges carries the level LAST SEEN (`weekPointsMark()`): the level-up is `SCR-022`'s (DEC-218 §3.1).
//
// ★ The band draws the member's name as text, never a heading: the page's `HubTopRow` holds the `h1` at every width
// (DEC-218 §3.5). A layout does not re-render on navigation, so the band keeps the figures of the hub page the member
// arrived on — a known property; the authoritative figures and the moments are the page's.

const TILE = "flex min-w-0 flex-col gap-0.5 rounded-tile bg-raised px-3 py-2.5";
const FIGURE = "font-display text-play-sm font-extrabold leading-none";

type T = Awaited<ReturnType<typeof getTranslations>>;

function Tile({ label, href, children }: { label: ReactNode; href?: string; children: ReactNode }) {
  const body = (
    <>
      <span className="text-caption font-semibold text-fg-muted">{label}</span>
      {children}
    </>
  );
  return href ? (
    <Link href={href} quiet className={`${TILE} text-fg-heading no-underline hover:bg-hover`}>
      {body}
    </Link>
  ) : (
    <div className={TILE}>{body}</div>
  );
}

/** The three figures: this week's rank (→ the boards), the streak, the badges. */
function Tiles({ s, t, seenRank }: { s: HubStandingData; t: T; seenRank: number | null }) {
  const week = s.week;
  const rankLabel = week.optedOut ? t("hub.week.labelHidden") : t("hub.week.label");
  return (
    <div className={`grid gap-2 ${s.streak ? "grid-cols-3" : "grid-cols-2"}`}>
      <Tile label={rankLabel} href="/app/leaderboards">
        {week.rank ? (
          <span className="flex items-baseline gap-1">
            <span className="sr-only">{t.markup("hub.week.valueLabel", { rank: formatNumber(week.rank.rank), total: formatNumber(week.rank.ranked), bdi: (c) => c })}</span>
            <span aria-hidden="true" data-slot="rank" className={`${FIGURE} text-accent pg-light:text-fg-heading`}>
              <bdi dir="ltr">
                <WeekFigure slot="rank" prefix="#" text={`#${formatNumber(week.rank.rank)}`} />
              </bdi>
            </span>
            {seenRank !== null ? (
              <span data-slot="rise" className="flex items-center text-accent pg-light:text-fg-heading">
                <ArrowIcon direction="up" />
                <span className="sr-only">{t("week.rank.rise", { count: seenRank - week.rank.rank, value: formatNumber(seenRank - week.rank.rank) })}</span>
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-body-sm font-bold text-fg-body">{t("hub.week.absent")}</span>
        )}
      </Tile>
      {s.streak ? (
        <Tile label={t("hub.streak.label")}>
          {s.streak.months > 0 ? (
            <span className={`${FIGURE} text-signal pg-light:text-signal-deep`}>
              <span className="sr-only">{t.markup("points.head.streak", { count: s.streak.months, value: formatNumber(s.streak.months), bdi: (c) => c })}</span>
              {/* «×8» is notation, not copy: the multiplication sign and the figure, the same in every language. */}
              <bdi dir="ltr" aria-hidden="true">{`×${formatNumber(s.streak.months)}`}</bdi>
            </span>
          ) : (
            <span className="text-body-sm font-bold text-fg-body">{t("week.streak.none")}</span>
          )}
        </Tile>
      ) : null}
      <Tile label={t("hub.badges.label")}>
        <span className={`${FIGURE} text-fg-heading`}>
          <span className="sr-only">{t("hub.badges.valueLabel", { count: s.badges, value: formatNumber(s.badges) })}</span>
          <bdi aria-hidden="true">{formatNumber(s.badges)}</bdi>
        </span>
      </Tile>
    </div>
  );
}

/** «"<next>" بعد N», the top, or no level — the bar's line, one fraction with the bar (`levelProgress()`). */
function levelLine(s: HubStandingData, t: T): ReactNode {
  if (!s.level) return t("hub.level.none");
  if (!s.next) return t("hub.level.top");
  return t.rich("hub.level.toNext", { level: s.next.name, value: formatNumber(s.next.remaining), bdi: (c) => <bdi>{c}</bdi> });
}

function delta(s: HubStandingData, t: T): ReactNode {
  const c = s.completion;
  if (!c) return null;
  // ★ Only in the copy on screen: the hidden form renders no «+N» node at all (DEC-218 §3.7, `displayed-only.tsx`).
  return (
    <DisplayedOnly>
      <span data-slot="delta" className="ms-1.5 font-bold text-accent pg-light:text-fg-heading">
        <span className="sr-only">{t("points.head.deltaLabel", { count: c.delta, value: formatNumber(c.delta) })}</span>
        <bdi dir="ltr" aria-hidden="true">{`+${formatNumber(c.delta)}`}</bdi>
      </span>
    </DisplayedOnly>
  );
}

function Card({ s, t, seenRank }: { s: HubStandingData; t: T; seenRank: number | null }) {
  const m = s.member;
  const bar =
    s.level && s.progress ? (
      <div data-slot="level-bar" className="flex items-center gap-2.5">
        <ProgressBar value={s.progress.value} max={s.progress.max} fill="accent" decorative className="flex-1" />
        <span className="shrink-0 text-caption text-fg-muted">{levelLine(s, t)}</span>
      </div>
    ) : (
      <p className="text-caption text-fg-muted">{levelLine(s, t)}</p>
    );

  return (
    <section aria-label={t("hub.label")} data-form="card" className="flex flex-col gap-3.5 rounded-panel border border-edge bg-surface p-4">
      <div className="flex items-center gap-3">
        <Avatar memberId={m.id} displayName={m.displayName} src={m.avatarUrl} size={64} decorative teamColor={m.company?.teamColor ?? null} />
        <div className="min-w-0 flex-1 leading-snug">
          <p className="font-display text-play-sm font-extrabold text-fg-heading">
            <bdi>{m.displayName}</bdi>
          </p>
          <p className="text-caption text-fg-muted">
            {[m.jobTitle, m.company?.name].filter(Boolean).map((part, i) => (
              <span key={i}>
                {i > 0 ? " · " : null}
                <bdi className={i > 0 ? "font-semibold text-fg-body" : undefined}>{part}</bdi>
              </span>
            ))}
          </p>
        </div>
        <Link href={`/app/members/${m.id}`} quiet className="shrink-0 rounded-pill border border-edge bg-raised px-3 py-2 text-caption font-bold text-fg-heading no-underline hover:bg-hover">
          {t("hub.seenBy")}
        </Link>
      </div>

      {s.level ? (
        <LevelCard
          layout="standing"
          level={{ tier: s.level.tier, name: s.level.name, caption: t("hub.level.caption"), unlocks: [] }}
          unlocksLabel=""
          noUnlocksLabel=""
          standing={{
            frame: "none",
            glyph: <StarIcon filled />,
            figure: <WeekFigure slot="points" text={formatNumber(s.points)} />,
            unit: (
              <>
                {t("week.points.unit", { count: s.points })}
                {delta(s, t)}
              </>
            ),
            children: bar,
          }}
        />
      ) : (
        bar
      )}

      <Tiles s={s} t={t} seenRank={seenRank} />
    </section>
  );
}

function Band({ s, t, seenRank, locale }: { s: HubStandingData; t: T; seenRank: number | null; locale: string }) {
  const m = s.member;
  const since = m.memberSince
    ? new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { month: "long", year: "numeric", timeZone: s.week.window.timeZone }).format(new Date(m.memberSince))
    : null;
  // The balance is always said — it is the band's one figure — and it is moment 3's counting figure, a node, so it is
  // handed in as a tag, never as text. The way to the next follows it when there is one.
  const pts = () => (
    <bdi dir="ltr">
      <WeekFigure slot="points" text={formatNumber(s.points)} />
    </bdi>
  );
  const balance = t.rich("hub.level.pointsOnly", { count: s.points, pts });
  const line = s.level ? (
    s.next ? (
      t.rich("hub.level.pointsLine", { count: s.points, level: s.next.name, remaining: formatNumber(s.next.remaining), pts, bdi: (c) => <bdi>{c}</bdi> })
    ) : (
      <>
        {balance} · {t("hub.level.top")}
      </>
    )
  ) : (
    <>
      {balance} · {t("hub.level.none")}
    </>
  );

  return (
    <section aria-label={t("hub.label")} data-form="band" className="flex flex-wrap items-center gap-5 rounded-panel border border-edge bg-surface px-5 py-4">
      <Avatar memberId={m.id} displayName={m.displayName} src={m.avatarUrl} size={84} decorative teamColor={m.company?.teamColor ?? null} />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="font-display text-play-md font-extrabold text-fg-heading">
          <bdi>{m.displayName}</bdi>
        </p>
        <p className="text-caption text-fg-muted">
          {[m.jobTitle, m.company?.name].filter(Boolean).map((part, i) => (
            <span key={i}>
              {i > 0 ? " · " : null}
              <bdi className={i > 0 ? "font-semibold text-fg-body" : undefined}>{part}</bdi>
            </span>
          ))}
          {since ? (
            <span>
              {m.jobTitle || m.company ? " · " : null}
              {t.rich("hub.since", { month: since, bdi: (c) => <bdi>{c}</bdi> })}
            </span>
          ) : null}
        </p>
      </div>
      {s.level ? (
        <div className="flex items-center gap-3 rounded-tile bg-raised px-3 py-2.5">
          <BadgeMedallion name={s.level.name} fill={{ level: s.level.tier }} glyph={<StarIcon filled />} size="sm" showName={false} />
          <div className="leading-tight">
            <p className="font-display text-play-sm font-extrabold text-accent pg-light:text-fg-heading">
              <bdi>{s.level.name}</bdi>
              {delta(s, t)}
            </p>
            <p className="text-caption text-fg-muted">{line}</p>
          </div>
        </div>
      ) : (
        <p className="text-caption text-fg-muted">{line}</p>
      )}
      <div className="w-full max-w-sm xl:w-80">
        <Tiles s={s} t={t} seenRank={seenRank} />
      </div>
    </section>
  );
}

export async function HubStanding({ locale, form, className = "" }: { locale: string; form: "card" | "band"; className?: string }) {
  const [s, t, documentLoad] = await Promise.all([getHubStanding(locale), getTranslations("scoring"), isDocumentLoad()]);
  const week = s.week;
  const seenRank = week.rank && week.moment.seenRank !== null && week.moment.seenRank > week.rank.rank ? week.moment.seenRank : null;
  const c = s.completion;

  const moment: Omit<MomentWeekProps, "children" | "className"> = {
    completion: c ? { occurrenceId: c.occurrenceId, from: c.from, to: c.to, fromProgress: c.fromProgress, moveBar: !s.levelUpPending } : null,
    rank: week.rank && week.moment.occurrenceId && seenRank !== null ? { occurrenceId: week.moment.occurrenceId, from: seenRank, to: week.rank.rank } : null,
    pointsNeedsMark: s.pointsNeedsMark,
    rankNeedsMark: week.rank !== null && week.moment.needsMark,
    acknowledgePoints: acknowledgeWeekPoints.bind(null, locale, s.pointsMark),
    acknowledgeRank: week.rank && week.moment.needsMark ? acknowledgeWeekRank.bind(null, locale, week.moment.mark) : null,
    documentLoad,
  };

  return (
    <MomentWeek {...moment} className={className}>
      {form === "card" ? <Card s={s} t={t} seenRank={seenRank} /> : <Band s={s} t={t} seenRank={seenRank} locale={locale} />}
    </MomentWeek>
  );
}

/** For `<Suspense>`: the form's geometry, `aria-hidden`, no text, no data, no catalogue. */
export function HubStandingSkeleton({ form, className = "" }: { form: "card" | "band"; className?: string }) {
  if (form === "band") {
    return (
      <div aria-hidden="true" className={`flex items-center gap-5 rounded-panel border border-edge bg-surface px-5 py-4 ${className}`}>
        <Skeleton variant="media" className="size-21 shrink-0 rounded-full" />
        <div className="flex-1">
          <Skeleton variant="title" width="40%" />
          <Skeleton variant="text" width="60%" className="mt-2" />
        </div>
        <Skeleton variant="card" className="h-16 w-80" />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className={`flex flex-col gap-3.5 rounded-panel border border-edge bg-surface p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton variant="media" className="size-16 shrink-0 rounded-full" />
        <div className="flex-1">
          <Skeleton variant="title" width="50%" />
          <Skeleton variant="text" width="70%" className="mt-2" />
        </div>
      </div>
      <Skeleton variant="text" count={2} />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton variant="card" className="h-16" />
        <Skeleton variant="card" className="h-16" />
        <Skeleton variant="card" className="h-16" />
      </div>
    </div>
  );
}
