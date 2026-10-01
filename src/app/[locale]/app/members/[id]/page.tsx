import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AdminRecord } from "@/components/members/admin-record";
import { BadgeShelf } from "@/components/members/badge-shelf";
import { PresentedSessions } from "@/components/members/presented-sessions";
import { ProfileHeader } from "@/components/members/profile-header";
import { ProfileTopRow } from "@/components/members/profile-top-row";
import { SelfLinks, SelfNote } from "@/components/members/self-panel";
import { StandingSection } from "@/components/members/standing-card";
import { UploadedPhotos } from "@/components/members/uploaded-photos";
import { getMemberProfileForViewer } from "@/lib/dal/members";

// SCR-020 · /app/members/[id] — a profile at the viewer's tier, REBUILT in wave 19 from `Profile.dc.html` and
// `ProfileDesktop.dc.html` (`M10b.md` §6, REQ-UIX-069, REQ-PRF-004, STORY-UIX-058, DEC-213 §5.114 – §5.123, DEC-214).
// The old file was deleted first (DEC-208); what it had to keep is the table in `docs/plan/notes/scoring.md` W19.2.
//
// Regions, in the artboard's order: the top row (back, the breadcrumb, share — the page's own on the phone) · the
// header card · the standing card · the badges · the sessions presented · the photos uploaded. Then the self tier's
// links and the admin's record, which no artboard draws. From `lg` the page owns its width (the frame leaves it
// unconstrained, DEC-214 §4) and draws a 1fr / 380 body with no game rail: the sessions and the photos at the start,
// the badges and the standing at the end. ★ ONE DOM, the phone's order; the desktop places it with grid areas.
//
// ★ THIS FILE DOES NOT DECIDE WHAT A TIER SEES. `getMemberProfileForViewer()` does, in the DAL (A33, contract 7):
// a field the viewer may not see never reaches it — a colleague's average, an opted-out member's balance and ranks,
// the admin's record. ★ No level-up moment plays here (DEC-213 §5.117): nothing on this page reads or writes a mark.
//
// A missing, malformed, deactivated or other-org id is `notFound()` — one answer for all (REQ-TEN-003).
export default async function MemberPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const view = await getMemberProfileForViewer(locale, id);
  if (!view) notFound();

  return (
    <div className="flex flex-col gap-4">
      <ProfileTopRow name={view.profile.displayName ?? ""} company={view.company?.name ?? null} />
      <ProfileHeader view={view} locale={locale} />
      {view.tier === "self" ? <SelfNote /> : null}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-x-6 lg:gap-y-5 lg:[grid-template-areas:'presented_badges'_'presented_standing'_'photos_standing'_'self_self'_'admin_admin']">
        <StandingSection view={view} />
        <BadgeShelf view={view} />
        <PresentedSessions view={view} locale={locale} />
        <UploadedPhotos view={view} />
        {view.tier === "self" ? <SelfLinks /> : null}
        {view.adminRecord ? <AdminRecord record={view.adminRecord} timeZone={view.timeZone} locale={locale} /> : null}
      </div>
    </div>
  );
}
