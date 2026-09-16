import { HeldAchievementsTable, type HeldAchievementRow } from "@/components/admin/held-achievements-table";
import type { CertificateRow } from "@/lib/dal/certificates";

// The `HeldAchievements` slot — REQ-CRT-012.
//
// «Leaderboard certificates go to the top 3 monthly and top 3 annual,
// issued from the frozen snapshot and RELEASED BY AN ADMIN.» SCR-045 is
// per session and an achievement certificate has no session, so `09` gives
// this nowhere to live; the recognition screen (SCR-054) hosts it.
//
// ★ Wave 8 (`DEC-147`): PRESENTATION ONLY, and `console`'s for the wave. The
// data and the write are `designer`'s — `listHeldAchievements()` and
// `releaseAchievements` — and are unchanged. What changed is who reads: the
// host page now reads `listHeldAchievements()` and passes the rows in, because
// a section that can be empty is gated by the PAGE (`16` §5.4.1a(b)) — the page
// used to render its h2 over a slot that returned nothing on most days, and
// the slot repeated the heading as an h3 with a different verb. The heading,
// the intro and the landmark are the page's; this renders the list.
export function HeldAchievements({ certificates, locale }: { certificates: CertificateRow[]; locale: string }) {
  const rows: HeldAchievementRow[] = certificates.map((c) => ({
    id: c.id,
    recipientName: c.recipientName,
    serial: c.serial,
    badgeName: c.badgeName ?? null,
    period: c.period ?? null,
  }));
  return <HeldAchievementsTable rows={rows} locale={locale} />;
}
