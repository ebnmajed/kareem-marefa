import { getTranslations } from "next-intl/server";
import { dayHeading } from "@/components/feed/relative";
import { orgDay } from "@/components/browse/session-post";
import { parseTimelineQuery } from "@/components/browse/timeline-query";
import { formatTime } from "@/components/sessions/numerals";
import { Card, CardBody, CardMedia } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/components/ui/link";
import { SectionHeader } from "@/components/ui/section-header";
import { getTimeline } from "@/lib/dal/search";

// An empty feed — a new org's home (DEC-206 §4.60, not drawn). Nothing is live, coming within two weeks, ended
// this week, announced or awarded. So the home shows what there is further out, grouped by day as the feed is,
// and asks for a proposal. The list is `sessions'` timeline read, unfiltered; nothing is reserved from it.

const SHOWN = 6;

export async function EmptyFeed({ locale, today }: { locale: string; today: string }) {
  const [t, data] = await Promise.all([getTranslations("feed.empty"), getTimeline(locale, parseTimelineQuery({}))]);
  const tDays = await getTranslations("feed");
  const coming = [...(data.pinned ? [data.pinned] : []), ...data.items].filter((s) => s.startsAt && (s.phase === "open" || s.phase === "live")).slice(0, SHOWN);
  const byDay = new Map<string, typeof coming>();
  for (const s of coming) {
    const day = orgDay(new Date(s.startsAt!), data.orgTimeZone);
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }

  return (
    <div className="flex flex-col gap-4">
      <EmptyState title={t("title")} description={t("body")} action={{ label: t("action"), href: "/app/propose" }} />
      {coming.length > 0 ? (
        <section aria-labelledby="feed-coming" className="flex flex-col gap-3">
          <SectionHeader id="feed-coming" title={t("coming")} actions={<Link href="/app/sessions">{t("browse")}</Link>} />
          {[...byDay.entries()].map(([day, sessions]) => (
            <div key={day} className="flex flex-col gap-2">
              <h3 className="text-label font-bold text-fg-muted">{dayHeading(day, today, tDays, locale)}</h3>
              {sessions.map((s) => (
                <Card key={s.id} density="row" href={`/app/sessions/${s.id}`}>
                  <CardMedia src={s.posterUrl} placeholderFrom={s.title} />
                  <CardBody>
                    <p className="text-label font-bold text-fg-heading">
                      <bdi>{s.title}</bdi>
                    </p>
                    <p className="text-caption text-fg-muted">{formatTime(s.startsAt!, s.timeZone, locale)}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
