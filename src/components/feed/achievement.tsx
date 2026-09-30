import { getTranslations } from "next-intl/server";
import { timeAgo } from "@/components/feed/relative";
import { monthName } from "@/components/scoring/week-format";
import { FlameIcon, StarIcon } from "@/components/ui/icons";
import { FeedItem } from "@/components/ui/feed-item";
import { Link } from "@/components/ui/link";
import type { AchievementItem } from "@/lib/dal/recognition";

// A colleague's badge or completed streak month — `Home.dc.html:95-99`, REQ-UIX-055, DEC-206 §4.52 – §4.53.
// The words are `scoring's` (`scoring.feed.*`); the member's name links to their profile. No reaction: an
// achievement is news, not a post. A level-up and a rank change are not items — neither leaves a row.
// Who appears was decided in `scoring's` DAL, where the opt-out is enforced.

export async function Achievement({ item, locale, now, day, today }: { item: AchievementItem; locale: string; now: Date; day: string; today: string }) {
  const [t, tScoring] = await Promise.all([getTranslations("feed"), getTranslations("scoring.feed")]);
  const name = () => (
    <Link href={`/app/members/${item.member.memberId}`} quiet className="font-bold text-fg-heading underline-offset-4 hover:underline">
      <bdi>{item.member.displayName}</bdi>
    </Link>
  );
  const rich = { name, b: (c: React.ReactNode) => <b className="text-fg-heading">{c}</b>, bdi: (c: React.ReactNode) => <bdi>{c}</bdi> };
  const sentence =
    item.kind === "badge"
      ? tScoring.rich(item.member.isSelf ? "badgeSelf" : "badge", { ...rich, badge: item.badge.name })
      : tScoring.rich(item.member.isSelf ? "streakSelf" : "streak", { ...rich, month: monthName(item.periodStart, locale) });

  return (
    <FeedItem variant="achievement" icon={item.kind === "badge" ? <StarIcon /> : <FlameIcon />} context={item.member.company} time={timeAgo(item.awardedAt, now, day, today, t, locale)}>
      {sentence}
    </FeedItem>
  );
}
