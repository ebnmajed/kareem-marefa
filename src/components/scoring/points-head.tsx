import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { MomentPointsHead } from "@/components/scoring/moment-points-head";
import { LevelCard } from "@/components/ui/level-card";
import { ProgressBar } from "@/components/ui/progress-bar";
// ★ Wave 17 (DEC-199 §1.3.4): the shell's layout is the scope now and scopes do not nest, so this is a plain element.
import { FlameObject } from "@/components/ui/objects/flame";
import type { HeadLevel, PointsHead as PointsHeadData } from "@/lib/dal/points";

// The head of SCR-022 — the balance, the streak, the level bar and the level card
// (wave 16, REQ-UIX-047, DEC-195 §1.1). scoring's file.
//
// ★ THE ONLY PART OF THE POINTS SCREEN THAT WEARS THE PLAYGROUND, and the only
// part that moves. `PlayScope` wraps exactly this head, as a direct child of the
// screen's content, and is never itself transformed, filtered or clipped (DEC-195
// §1.3, DEC-188 §5): every moving element sits inside it. The filter form, the
// history and the catalogue below stay as they were, and do not animate.
//
// Everything here is the STATIC state, whole: what reduced motion shows, what a
// reload shows, what another phone shows. `MomentPointsHead` moves it once.
//
// ★ What a level or a streak IS is not decided here. The level is the one the
// nightly evaluation stored; the streak is `streak_awards`, counted in MONTHS
// (DEC-197 §7, D-30). The bar is the member's true progress toward the next
// level (D-26): full only at the top, or while a level is being reached.

export async function PointsHead({
  head,
  acknowledge,
  documentLoad = false,
}: {
  head: PointsHeadData;
  acknowledge: () => Promise<void>;
  /** From `isDocumentLoad()`: rendered for a hard load, so no moment plays on it. */
  documentLoad?: boolean;
}) {
  const [t, perks] = await Promise.all([getTranslations("scoring.points.head"), getTranslations("recognition.admin.perks")]);

  const perkName = (key: string) => (perks.has(key) ? perks(key) : key);
  const face = (level: HeadLevel, caption: string) => ({ tier: level.tier, name: level.name, caption, unlocks: level.unlocks.map(perkName) });

  const streak =
    head.streak.enabled && head.streak.months > 0 ? (
      <div className="flex items-center gap-3">
        <span data-slot="flame" className="inline-flex origin-bottom">
          <span className="moment-flicker inline-flex origin-bottom">
            <FlameObject size={56} shadow={false} />
          </span>
        </span>
        <p className="text-body font-bold text-fg-heading">
          {t.rich("streak", { count: head.streak.months, value: formatNumber(head.streak.months), bdi: (chunks) => <bdi>{chunks}</bdi> })}
        </p>
      </div>
    ) : head.streak.enabled ? (
      <p className="text-body font-semibold text-fg-muted">{t("streakNone")}</p>
    ) : null;

  const bar =
    head.level && head.progress ? (
      <div data-slot="level-bar" className="flex flex-col gap-2">
        {/* Decorative: its value is the line beneath, which a screen reader reads once. */}
        <ProgressBar value={head.progress.value} max={head.progress.max} fill="accent" decorative />
        <p className="text-caption font-semibold text-fg-muted">
          {head.next
            ? t.rich("level.toNext", {
                points: formatNumber(head.totalPoints),
                threshold: formatNumber(head.next.threshold),
                level: head.next.name,
                bdi: (chunks) => <bdi>{chunks}</bdi>,
              })
            : t("level.top")}
        </p>
      </div>
    ) : head.level ? null : (
      <p className="text-caption font-semibold text-fg-muted">{t("level.none")}</p>
    );

  const card = head.level ? (
    head.levelUp ? (
      <LevelCard
        flip
        level={face(head.levelUp.held, t("level.caption"))}
        reached={face(head.level, t("level.reachedCaption"))}
        shown="reached"
        unlocksLabel={t("level.unlocks")}
        noUnlocksLabel={t("level.noUnlocks")}
      />
    ) : (
      <LevelCard level={face(head.level, t("level.caption"))} unlocksLabel={t("level.unlocks")} noUnlocksLabel={t("level.noUnlocks")} />
    )
  ) : null;

  const completion = head.completion;
  return (
    <div className="mt-6 rounded-panel bg-canvas p-5">
      <section>
        <MomentPointsHead
          heading={t("heading")}
          balanceLabel={t("balanceLabel")}
          total={head.totalPoints}
          completion={completion ? { occurrenceId: completion.occurrenceId, from: completion.from, fromProgress: completion.fromProgress } : null}
          delta={completion ? t.rich("delta", { value: formatNumber(completion.delta), bdi: (chunks) => <bdi>{chunks}</bdi> }) : null}
          deltaLabel={completion ? t("deltaLabel", { count: completion.delta, value: formatNumber(completion.delta) }) : null}
          levelUp={head.levelUp ? { occurrenceId: head.levelUp.occurrenceId } : null}
          streak={streak}
          bar={bar}
          card={card}
          needsMark={head.needsMark}
          acknowledge={acknowledge}
          documentLoad={documentLoad}
        />
      </section>
    </div>
  );
}
