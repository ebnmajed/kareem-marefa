// The `ImpersonationBanner` slot — REQ-ADM-002, REQ-ADM-019, SCR-085, DEC-052.
//
// PLACEHOLDER. It renders nothing today, and it exists on day one so the lead
// can wire the import into the app shell (`src/app/[locale]/app/layout.tsx`)
// before the rest of M8 lands (TEAM.md §2). When it is real it will show
// «أنت تتصفح كـ …» with the org, the remaining time and a stop control, on
// every screen of an active break-glass session.
//
// The rules it will keep, stated now so the real version cannot quietly drop
// them:
//
//   1. **It reads its own data through this track's DAL**, never props. The
//      shell passes a locale and nothing else; ids never rows (TEAM.md §2).
//   2. **No heading of its own.** The shell owns the landmark, and a slot that
//      repeats it is announced twice.
//   3. **It renders nothing when there is no active session** — which is the
//      common case for every member of every org, forever. A banner that says
//      «لا توجد جلسة» on every page is noise the reader learns to skip, and
//      then does not see the one time it matters.
//   4. **The org sees the session in its own audit log whether or not this
//      banner renders** (`REQ-ADM-019`). The banner is for the super admin's
//      own honesty; the evidence is in the org's log.
//
// A `"use client"` stop control will sit inside it, because ending a session
// has to refresh the token — the claims are minted by the hook at issuance.

export interface ImpersonationBannerProps {
  locale: string;
}

// `locale` is the slot's contract (TEAM.md §2) and the placeholder body does
// not read it yet.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function ImpersonationBanner(props: ImpersonationBannerProps) {
  // TODO(platform, M8): read my_impersonation() through src/lib/dal/platform.ts
  // and render the banner of SCR-085. Placeholder until then.
  return null;
}
