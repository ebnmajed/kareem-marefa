import { getTranslations } from "next-intl/server";
import type { FeedAnnouncement } from "@/components/feed/feed-merge";
import { timeAgo } from "@/components/feed/relative";
import { FeedItem } from "@/components/ui/feed-item";
import { ViewCount, type ViewCountData } from "@/components/views/view-count";

// An org's announcement — `Home.dc.html:101-104`, REQ-UIX-056. Its text whole, «إعلان من الإدارة» and when.
// No author, no action, no reaction; it notifies nobody.

// ★ Views (REQ-VEW-003): its count under the body — the primitive's `footer`; nothing when nobody has viewed it.
export async function Announcement({
  announcement,
  locale,
  now,
  day,
  today,
  views,
}: {
  announcement: FeedAnnouncement;
  locale: string;
  now: Date;
  day: string;
  today: string;
  views?: ViewCountData;
}) {
  const t = await getTranslations("feed");
  return (
    <FeedItem
      variant="announcement"
      sourceLabel={t("announcement.source")}
      body={announcement.body}
      time={timeAgo(announcement.publishedAt, now, day, today, t, locale)}
      footer={views && views.count > 0 ? <ViewCount kind="announcement" id={announcement.id} views={views} /> : undefined}
    />
  );
}
