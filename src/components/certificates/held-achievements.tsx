import { HeldCertificates } from "@/components/scoring/held-certificates";
import type { HeldCertificateRow } from "@/lib/dal/certificates";

// The `HeldAchievements` slot — REQ-CRT-012.
//
// «Leaderboard certificates go to the top 3 monthly and top 3 annual,
// issued from the frozen snapshot and RELEASED BY AN ADMIN.» SCR-045 is
// per session and an achievement certificate has no session, so `09` gives
// this nowhere to live; the recognition screen (SCR-054) hosts it.
//
// ★ PRESENTATION ONLY — `scoring`'s for wave 22, as it was `console`'s for wave 8. The data and the writes are
// `designer`'s — `listHeldAchievements()`, `releaseAchievements`, `release_certificates()`, `revoke_certificate()` —
// and are unchanged. What changed is the presentation, rebuilt with SCR-054 from `AdminRecognition.dc.html`: the member
// with their face, the achievement, how long it has waited, and «أصدر» / «أوقف» on the row (`scoring/held-certificates`).
// The host page reads `listHeldAchievements()` and gates the section (`16` §5.4.1a(b)); this renders the list.
export function HeldAchievements({
  certificates,
  avatars,
  locale,
  now,
  release,
}: {
  certificates: HeldCertificateRow[];
  /** memberId → the one resolver's href (`DEC-099`), or null for initials. */
  avatars: Record<string, string | null>;
  locale: string;
  now: string;
  release: (certificateId: string) => Promise<{ ok: boolean }>;
}) {
  return (
    <HeldCertificates
      rows={certificates.map((c) => ({
        id: c.id,
        memberId: c.memberId,
        avatarUrl: avatars[c.memberId] ?? null,
        recipientName: c.recipientName,
        serial: c.serial,
        badgeName: c.badgeName ?? null,
        period: c.period ?? null,
        createdAt: c.createdAt,
      }))}
      locale={locale}
      now={now}
      release={release}
    />
  );
}
