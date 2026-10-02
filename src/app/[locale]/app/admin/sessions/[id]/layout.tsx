import { Suspense, type ReactNode } from "react";
import { AttendanceHeaderAction } from "@/components/checkin/attendance-header-action";
import { SessionSettingsNav, SessionSettingsNavSkeleton } from "@/components/sessions/session-settings-nav";
import { HubHeader, HubHeaderSkeleton } from "./_hub/hub-header";

// The session hub — REQ-UIX-089, REQ-SES-020, DEC-178, contract 4. Rebuilt in wave 21 from `AdminSessionHub.dc.html`:
// deleted first, then written (`DEC-208`; the table is `notes/sessions.md` W21.4).
//
// ★ ONE HEADER ABOVE FIVE TABS, AND A TAB'S PAGE DRAWS NONE OF IT. The header — breadcrumb, `h1`, status, the tab's
// primary, «صفحة الجلسة», the lifecycle action — and the strip are the layout's; every tab's first heading is an `h2`.
// A tab's own primary travels in `tabActions`, keyed by its segment (`_hub/hub-tab-action.tsx`): the owning track
// exports a server component that returns one action or `null` and never throws, and it is imported here by path.
//
// ★ THE LAYOUT STILL DECIDES NOTHING. No `notFound()`, no `redirect()`: the header and the strip each render nothing
// for a viewer their DAL does not answer for, and each page keeps its own check at the data. Both stream behind their
// own boundaries, so neither holds up the tab, and both stay on screen while a sibling tab streams in.

export default async function SessionHubLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return (
    <>
      <Suspense fallback={<HubHeaderSkeleton />}>
        <HubHeader locale={locale} sessionId={id} tabActions={{ attendance: <AttendanceHeaderAction locale={locale} sessionId={id} /> }} />
      </Suspense>
      <Suspense fallback={<SessionSettingsNavSkeleton />}>
        <SessionSettingsNav locale={locale} sessionId={id} />
      </Suspense>
      {children}
    </>
  );
}
