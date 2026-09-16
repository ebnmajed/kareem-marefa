import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MeTabStrip } from "@/components/me/tab-strip";

// The `/app/me` hub's shell — `16` §6.5, SCR-021 … 026, `REQ-PRF-006`/`007`.
//
// `16` §6.5 names six tabs (القادمة · الحاضرة · المقترحات · المحفوظات ·
// الشهادات · النقاط); the tree has seven routes under `/me`, three of them
// absent from that list (calendar, notifications, privacy), and three of the
// six (القادمة/الحاضرة/المقترحات) read another track's data this wave does
// not have — the timeline `/app` already IS "القادمة" (DEC-112) and
// "المقترحات" is `sessions`' `/app/propose`. Raised, not silently built or
// dropped (docs/plan/notes/content.md's wave-7 plan §1); the lead's ruling:
// seven tabs, one per real route, profile first — the promotion of the
// six-item chip nav `me/page.tsx` already rendered, plus the profile form
// itself as the seventh, first tab (§6.5's own "chips → tabs" framing).
//
// ★ NO AUTH AND NO DATA GATE HERE (`CLAUDE.md`'s Data access §3). A layout
// renders on navigation without re-executing (Partial Rendering), so a check
// here would not even run again on every visit — every check stays in each
// page's own DAL call, at `requireSession()`. This file renders chrome only.
export default async function MeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile.nav");

  const items = [
    { href: "/app/me", label: t("profile") },
    { href: "/app/me/points", label: t("points") },
    { href: "/app/me/certificates", label: t("certificates") },
    { href: "/app/me/bookmarks", label: t("bookmarks") },
    { href: "/app/me/calendar", label: t("calendar") },
    { href: "/app/me/notifications", label: t("notifications") },
    { href: "/app/me/privacy", label: t("privacy") },
  ];

  return (
    <>
      <MeTabStrip label={t("label")} items={items} />
      <div className="mt-6">{children}</div>
    </>
  );
}
