import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { listPhotoQueue } from "@/lib/dal/admin-moderation";
import { QueueView } from "./_components/queue-view";

// SCR-051 · الصور — REQ-UIX-104, REQ-ADM-010, REQ-EVT-008, REQ-EVT-012, REQ-EVT-014. Written from
// `AdminModerationPhotos.dc.html` in wave 22 (DEC-208: deleted first; the kept-behaviour table is
// `docs/plan/notes/content.md` W22.4).
//
// ★ THE JOB (DEC-231 §0.2): a photo is decided without leaving the queue. The queue is this layout's, so it stays mounted
// while the detail beside it changes — ↑ ↓ walk it, Enter opens, and after a decision focus lands on the next row.
// Takedown requests (already hidden) and photo reports (not hidden) are two chips, never one list (DEC-005).
//
// ★ THE LAYOUT NEVER GATES. `listPhotoQueue()` is `null` for a member; this then renders the page alone, and every page
// answers its own streamed not-found (DEC-134) — a layout's `notFound()` streams a 200.

export default async function PhotoModerationLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [queue, t] = await Promise.all([listPhotoQueue(locale), getTranslations("photos.moderation")]);
  if (!queue) return children;
  return (
    <>
      <PageHeader title={t("title")} className="mb-4" />
      <QueueView queue={queue}>{children}</QueueView>
    </>
  );
}
