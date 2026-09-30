import { getTranslations } from "next-intl/server";
import type { SessionPost } from "@/components/browse/session-post";
import { LikeButton } from "@/components/feed/like-button";
import { timeAgo } from "@/components/feed/relative";
import { formatNumber } from "@/components/sessions/numerals";
import { FeedItem } from "@/components/ui/feed-item";
import type { RecapExtra } from "@/lib/dal/feed";

// A completed session's recap — `Home.dc.html:107-118`, REQ-UIX-055, DEC-206 §4.54 – §4.55.
// Who presented, how many attended (a COUNT, the lead's function through `sessions'` post — never who), how many
// photographs; the newest three; the like; «المواد» as a link to the session's materials, drawn only when a
// material the viewer may open exists — never a download.

export async function RecapPost({ post, extra, locale, now, today }: { post: SessionPost; extra: RecapExtra; locale: string; now: Date; today: string }) {
  const [t, tBrowse] = await Promise.all([getTranslations("feed"), getTranslations("browse")]);
  const lead = post.presenters[0] ?? null;
  // A co-presented session is not one person's: the lead's name, then browse's «وآخر» / «وآخران» / «و3 آخرون».
  const others = Math.max(0, post.presenters.length - 1);
  const name = lead?.displayName ? (others > 0 ? `${lead.displayName} ${tBrowse("card.others", { count: others, value: formatNumber(others) })}` : lead.displayName) : null;
  const who = lead ? [name, lead.company?.name].filter(Boolean).join(" · ") : null;
  const counts = [
    post.attendedCount !== null ? t("recap.attended", { count: post.attendedCount, value: formatNumber(post.attendedCount) }) : null,
    extra.count > 0 ? t("recap.photos", { count: extra.count, value: formatNumber(extra.count) }) : null,
  ].filter(Boolean);
  const ended = post.endsAt ?? post.startsAt ?? now.toISOString();

  return (
    <FeedItem
      variant="recap"
      title={post.title}
      href={post.href}
      doneLabel={t("recap.done")}
      time={timeAgo(ended, now, post.day ?? today, today, t, locale)}
      meta={
        <>
          {who ? <bdi>{who}</bdi> : null}
          {who && counts.length > 0 ? " · " : null}
          {counts.join(" · ")}
        </>
      }
      photos={extra.photos.map((p) => ({ src: p.url, alt: t("recap.photoAlt", { title: post.title }), width: p.width, height: p.height }))}
      reactions={<LikeButton locale={locale} sessionId={post.id} liked={post.likedByMe} count={post.likeCount} groupLabel={t("post.reactions")} likeLabel={t("post.like")} />}
      materials={extra.hasMaterials ? { href: `${post.href}#materials`, label: t("recap.materials") } : null}
    />
  );
}
