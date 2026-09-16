"use client";

import { useTranslations } from "next-intl";
import { Tabs } from "@/components/ui/tabs";
import type { ModerationQueueCounts } from "@/lib/dal/admin-moderation";

// The shared sub-nav across `/app/admin/moderation/{comments,photos,reports}`
// — wave 7 (`DEC-137`), `docs/plan/notes/console.md`'s "Wave 7 plan" §3.
// `tabs.tsx`'s own header comment already names this exact use ("the admin
// sub-nav... uses this"); this is its first real caller.
//
// ★ Three separate ROUTES, not three panels of one page — `href` mode, so
// `Tabs` never receives `children` (each destination renders its own list
// below this strip, outside `Tabs` entirely; `TabsProps.children` stays
// unset, which is fine — it's optional, and there is nothing to switch
// between in-page). This does NOT merge the takedown queue and the report
// queue into one list — DEC-005's actual rule, untouched — it only lets a
// moderator move between three still-separate lists without a rail
// round-trip, matching `16` §6.7's own «الإشراف» grouping of all three.
export function ModerationTabs({ current, counts }: { current: "comments" | "photos" | "reports"; counts: ModerationQueueCounts }) {
  const t = useTranslations("admin.moderation");
  return (
    <Tabs
      label={t("tabsLabel")}
      value={current}
      items={[
        { value: "comments", label: t("tabComments"), count: counts.comments, href: "/app/admin/moderation/comments" },
        { value: "photos", label: t("tabPhotos"), count: counts.photos, href: "/app/admin/moderation/photos" },
        { value: "reports", label: t("tabReports"), count: counts.reports, href: "/app/admin/moderation/reports" },
      ]}
    />
  );
}
