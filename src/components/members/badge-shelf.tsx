import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { BadgeMedallion } from "@/components/ui/badge-medallion";
import { BadgeGlyph } from "@/components/members/badge-glyph";
import { badgeLook } from "@/components/members/badge-look";
import type { MemberProfileView } from "@/lib/dal/members";

// «الشارات» — `Profile.dc.html:52-61`, `ProfileDesktop.dc.html:67-76`, REQ-REC-001, DEC-213 §5.121, §5.126.
//
// «N من M»: N the held badges the org has not retired, M the org's badges not retired — a held retired badge is
// still drawn (it was earned) and counted in neither. Each medallion's fill and glyph come from what the badge
// rewards (`badge-look.ts`, DEC-214 §3 N1); its description is read, never drawn. On the phone a scrolling row of
// 64 px discs with their glyphs; from `lg` a card of 52 px plain discs, as drawn — each list `display: none` at the
// other width.
export async function BadgeShelf({ view }: { view: MemberProfileView }) {
  const t = await getTranslations("members.profile");
  const badges = view.recognition.badges;
  const held = badges.filter((b) => !b.retired).length;
  const count = t("badgesOf", { held: formatNumber(held), total: formatNumber(view.badgeCatalogue) });
  return (
    <section aria-labelledby="badges" className="flex flex-col gap-2.5 lg:[grid-area:badges] lg:rounded-panel lg:border lg:border-edge lg:bg-surface lg:p-4">
      <div className="flex items-baseline justify-between gap-3 px-1 lg:px-0">
        <h2 id="badges" className="font-display text-play-sm font-extrabold text-fg-heading">
          {t("badges")}
        </h2>
        <span className="text-caption text-fg-muted">{count}</span>
      </div>
      {badges.length === 0 ? (
        <p className="text-body text-fg-muted">{t("noBadges")}</p>
      ) : (
        <>
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {badges.map((badge) => {
              const look = badgeLook(badge.metric);
              return (
                <li key={badge.id} className="shrink-0">
                  <BadgeMedallion name={badge.name} fill={look.fill} glyph={<BadgeGlyph glyph={look.glyph} />} description={badge.description ?? undefined} />
                </li>
              );
            })}
          </ul>
          <ul className="hidden grid-cols-5 gap-2 lg:grid">
            {badges.map((badge) => (
              <li key={badge.id} className="flex justify-center">
                <BadgeMedallion name={badge.name} fill={badgeLook(badge.metric).fill} size="sm" description={badge.description ?? undefined} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
