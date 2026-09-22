import { Suspense, type ReactNode } from "react";
import { SessionSettingsNav, SessionSettingsNavSkeleton } from "@/components/sessions/session-settings-nav";

// The session settings hub — REQ-SES-020, DEC-176, DEC-178. Every admin screen
// of one session — the schedule (with its presenters and poster), attendance,
// certificates (with the certificate mode), the survey — sits under one strip,
// and the event page, where materials, tasks and photos are managed, is its
// last item.
//
// ★ THE LAYOUT RENDERS THE STRIP AND NOTHING ELSE, AND DECIDES NOTHING. No
// `notFound()`, no `redirect()`, no header: each page keeps its own breadcrumb
// and title, and its own check at the data. The strip streams behind its own
// boundary, so its one query never holds up the page — and, sitting above
// `[id]/loading.tsx`, it stays on screen while a sibling page streams in.

export default async function SessionSettingsLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return (
    <>
      <Suspense fallback={<SessionSettingsNavSkeleton />}>
        <SessionSettingsNav locale={locale} sessionId={id} />
      </Suspense>
      {children}
    </>
  );
}
