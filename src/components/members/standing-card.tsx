import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { StarIcon } from "@/components/ui/icons";
import { LevelCard } from "@/components/ui/level-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Stat } from "@/components/ui/stat";
import type { MemberProfileView } from "@/lib/dal/members";

// The standing card — `Profile.dc.html:38-50`, `ProfileDesktop.dc.html:77-85`, REQ-UIX-069, A33 tier 1.
//
// ★ IT DRAWS WHAT THE DAL WITHHELD AS «—». An opted-out member seen by a colleague arrives with `standing`,
// `monthRank` and `progress` null (DEC-141 r5, DEC-213 §5.116): the balance and both ranks read «—» and there is no
// progress line — the line «بقي N لـ…» would give the balance back. The level, its medallion and the streak still
// show. An admin reads «—» for an opted-out member's ranks because the DATABASE withholds them (DEC-214 §1, N8).
//
// ★ THE MONTH AND ALL TIME — no week (DEC-213 §5.114). ★ STATIC: `level-card`'s standing layout has no reached face
// and no flip, so the level-up moment cannot play here; it is `SCR-022`'s alone (§5.117).
//
// On the phone the card is `level-card`'s standing layout — the medallion, «المستوى», the name, the balance — with the
// line and the stats under it. From `lg` the level and the balance move to the header's summary, as drawn, and the
// card is «النقاط والمستوى» with the line and the stats; each is `display: none` at the other width.
export async function StandingSection({ view }: { view: MemberProfileView }) {
  const t = await getTranslations("members.profile");
  const dash = t("none");
  const points = view.standing ? formatNumber(view.standing.totalPoints) : dash;
  const unit = t("pointsUnit", { count: view.standing?.totalPoints ?? 0 });
  const rank = (value: number | null) => (value !== null ? t("rankValue", { value: formatNumber(value) }) : dash);
  const streak = view.recognition.streakMonths;

  const progress = view.progress ? (
    <div className="flex items-center gap-2.5 text-caption text-fg-muted">
      <ProgressBar value={view.progress.value} max={view.progress.max} decorative className="flex-1" />
      <span className="shrink-0">
        {view.progress.next
          ? t.rich("remaining", { count: view.progress.remaining, value: formatNumber(view.progress.remaining), level: view.progress.next, bdi: (chunks) => <bdi>{chunks}</bdi> })
          : t("topLevel")}
      </span>
    </div>
  ) : null;

  const stats = (
    <div className="grid grid-cols-3 gap-2">
      <Stat label={t("monthRank")} value={rank(view.monthRank)} className="bg-raised! p-2.5!" />
      <Stat label={t("allTimeRank")} value={rank(view.standing?.rank ?? null)} className="bg-raised! p-2.5!" />
      <Stat label={t("streakLabel")} value={streak > 0 ? t("streakFigure", { value: formatNumber(streak) }) : dash} className="bg-raised! p-2.5!" />
      <span className="sr-only">{t("streakSr", { count: streak, value: formatNumber(streak) })}</span>
    </div>
  );

  return (
    <section aria-labelledby="standing" className="flex flex-col gap-2 lg:[grid-area:standing]">
      <h2 id="standing" className="sr-only font-display text-play-sm font-extrabold text-fg-heading lg:not-sr-only">
        {t("standing")}
      </h2>
      <div className="lg:hidden">
        {view.level ? (
          <LevelCard
            layout="standing"
            level={{ tier: view.level.tier, name: view.level.name, caption: t("levelCaption"), unlocks: [] }}
            unlocksLabel=""
            noUnlocksLabel=""
            standing={{ figure: points, unit, glyph: <StarIcon filled />, children: <>{progress}{stats}</> }}
          />
        ) : (
          <div className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body font-bold text-fg-muted">{t("noLevel")}</p>
              <p className="text-end leading-tight">
                <span className="block font-display text-play-sm font-extrabold text-fg-heading">
                  <bdi>{points}</bdi>
                </span>
                <span className="text-caption text-fg-muted">{unit}</span>
              </p>
            </div>
            {stats}
          </div>
        )}
      </div>
      <div className="hidden flex-col gap-3 rounded-panel border border-edge bg-surface p-4 lg:flex">
        {progress}
        {stats}
      </div>
    </section>
  );
}
