import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import type { EventSession } from "@/lib/dal/sessions";
import type { SessionPhase } from "@/lib/session-status";

// The event page's phone top row — `Event.dc.html`, `EventLive.dc.html`, `EventDone.dc.html` (REQ-UIX-061).
// Below `lg` the page owns this row and the shell's bar gives way (`ownsTopRow()`, the lead's 330c872e); from
// `lg` the shell's bar is there and this row is not drawn (the desktop breadcrumb is the hero's).
//
// back · the breadcrumb — or, while the session runs, the story's state · bookmark · share.
//
// ★ «شاهد القصة» SHOWS ITS STATE AND OPENS NOTHING (DEC-205 §1, DEC-209 §2): it is text beside the live dot,
// never a link or a button — the viewer is wave 19's.
export async function EventTopRow({ session, phase, bookmark, share }: { session: EventSession; phase: SessionPhase; bookmark: ReactNode; share: ReactNode }) {
  const [t, tUi] = await Promise.all([getTranslations("sessions.event"), getTranslations("ui.pageHeader")]);
  return (
    <div className="flex items-center gap-2.5 py-3 lg:hidden">
      <Link
        href="/app/sessions"
        aria-label={t("back")}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-edge bg-surface text-fg-heading"
      >
        <ArrowIcon direction="back" aria-hidden="true" className="text-[1.125rem]" />
      </Link>
      <div className="flex min-w-0 flex-1 justify-center">
        {phase === "live" ? (
          <p className="inline-flex items-center gap-2 text-caption font-bold text-fg-heading">
            <Badge tone="live" size="sm">
              {t("storyLive")}
            </Badge>
            <span>{t("storyWatch")}</span>
          </p>
        ) : (
          <nav aria-label={tUi("breadcrumb")} className="min-w-0">
            <ol className="flex flex-wrap items-center justify-center gap-x-1.5 text-caption text-fg-muted">
              <li>
                <Link href="/app/sessions" quiet className="hover:text-fg-heading">
                  {t("breadcrumbRoot")}
                </Link>
              </li>
              {session.categoryId && session.categoryName ? (
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true">›</span>
                  <Link href={`/app/sessions?category=${session.categoryId}`} quiet className="hover:text-fg-heading">
                    <bdi>{session.categoryName}</bdi>
                  </Link>
                </li>
              ) : null}
            </ol>
          </nav>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {bookmark}
        {share}
      </div>
    </div>
  );
}
