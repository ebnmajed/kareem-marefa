import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Achievement } from "@/components/feed/achievement";
import { Announcement } from "@/components/feed/announcement";
import { EmptyFeed } from "@/components/feed/empty-feed";
import { ProposeBand } from "@/components/feed/propose-band";
import { RecapPost } from "@/components/feed/recap-post";
import { dayHeading } from "@/components/feed/relative";
import { RingRow } from "@/components/feed/ring-row";
import { SessionPost } from "@/components/feed/session-post";
import { StaffStrip } from "@/components/feed/staff-strip";
import { CalendarConnectPrompt } from "@/components/calendar/calendar-connect-prompt";
import { AvatarImportPrompt } from "@/components/privacy/avatar-import-prompt";
import { CompanyRaceCard } from "@/components/scoring/company-race-card";
import { MemberWeekHud } from "@/components/scoring/member-week-hud";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getFeed } from "@/lib/dal/feed";

// The home's column — SCR-010, `Home.dc.html` (390) and `HomeDesktop.dc.html` (1280), REQ-UIX-055,
// STORY-UIX-044, DEC-206, DEC-207. REBUILT from the artboard: nothing of the timeline it replaces survives.
//
// The regions, in the artboard's order:
//   1. the ring row;
//   2. the member's own prompts — «نستخدم صورتك من Google؟», then «نضيف جلساتك إلى تقويم Google؟» (DEC-276) — above the week (DEC-207 §6.1). ★ wave 27 (DEC-255 §4,
//      REQ-PRF-012): the «choose your company» prompt is gone — a member no longer chooses, and one with none is
//      refused nothing;
//   3. the week (`scoring's` `MemberWeekHud`) — on the phone only: from `lg` the week is the game rail's;
//   4. «يحتاج انتباهك», staff only;
//   5. the feed by day — session posts, recaps, announcements, achievements — with the company race after the
//      first day (phone only; the rail carries it on desktop);
//   6. «عندك موضوع؟».
// An empty feed is the coming sessions by day, and an invitation to propose (§4.60).
//
// ★ The week and the race are in the HTML at every width and hidden by CSS at the other; `scoring's` gate
// keeps the hidden one from claiming a moment (DEC-207 §2). Each streams in its own boundary, so the feed
// never waits for the week.

export async function Feed({ locale }: { locale: string }) {
  const [feed, t] = await Promise.all([getFeed(locale), getTranslations("feed")]);
  const now = new Date(feed.now);

  return (
    <div className="flex flex-col gap-4">
      <RingRow />

      <Suspense fallback={null}>
        <AvatarImportPrompt locale={locale} />
      </Suspense>

      {/* DEC-276: calendar sync offered beside the photo prompt, so a member knows it exists. */}
      <Suspense fallback={null}>
        <CalendarConnectPrompt locale={locale} />
      </Suspense>

      {/* scoring's gate plays a moment only on the copy that is displayed: the HUD is hidden from `lg`. */}
      <Suspense fallback={<Skeleton variant="card" className="lg:hidden" />}>
        <MemberWeekHud locale={locale} className="lg:hidden" />
      </Suspense>

      <StaffStrip attention={feed.attention} />

      {feed.groups.length === 0 ? (
        <EmptyFeed locale={locale} today={feed.today} />
      ) : (
        <div className="flex flex-col gap-4">
          <p id="feed-share-hint" className="sr-only">
            {t("post.shareHint")}
          </p>
          {feed.groups.map((group, index) => (
            <section key={group.day} aria-labelledby={`feed-day-${group.day}`} className="flex flex-col gap-2.5">
              <SectionHeader id={`feed-day-${group.day}`} title={dayHeading(group.day, feed.today, t, locale)} />
              {group.entries.map((entry) => {
                switch (entry.kind) {
                  case "session":
                    return <SessionPost key={entry.key} post={entry.post} locale={locale} today={feed.today} />;
                  case "recap":
                    return <RecapPost key={entry.key} post={entry.post} extra={feed.recaps[entry.post.id] ?? { count: 0, photos: [], hasMaterials: false }} locale={locale} now={now} today={feed.today} />;
                  case "announcement":
                    return <Announcement key={entry.key} announcement={entry.announcement} locale={locale} now={now} day={entry.day} today={feed.today} />;
                  case "achievement":
                    return <Achievement key={entry.key} item={entry.item} locale={locale} now={now} day={entry.day} today={feed.today} />;
                }
              })}
              {index === 0 ? (
                <Suspense fallback={null}>
                  <CompanyRaceCard locale={locale} className="lg:hidden" />
                </Suspense>
              ) : null}
            </section>
          ))}
        </div>
      )}

      <ProposeBand />
    </div>
  );
}
