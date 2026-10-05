import { getTranslations } from "next-intl/server";
import { HubStripNav } from "@/components/shell/hub-strip-nav";

// The `/app/me` hub's strip — `M10c.md` §0, `REQ-UIX-070`, contract 1.
//
// ★ Rendered TWICE, at two widths, and never both visible (the lead's note, F1). On the phone a page places it under
// its own top row — on `/app/me` under the standing card — with `lg:hidden`, six links. From `lg` the hub's layout
// places it under the standing band, under a rule. ★ wave 26 (`DEC-NEXT-39`, `DEC-251` §3.5): privacy is a hub page
// reached from settings and no longer a seventh tab here — `M13.md` overrules `HubDesktop.dc.html` on that.
// One strip in the layout could not be in both places without reading out of order (SC 1.3.2, 2.4.3).
export async function HubStrip({ desktop = false }: { desktop?: boolean }) {
  const t = await getTranslations("profile.nav");
  const items = [
    { href: "/app/me", label: t("profile") },
    { href: "/app/me/points", label: t("points") },
    { href: "/app/me/certificates", label: t("certificates") },
    { href: "/app/me/bookmarks", label: t("bookmarks") },
    { href: "/app/me/calendar", label: t("calendar") },
    { href: "/app/me/notifications", label: t("notifications") },
  ];
  return <HubStripNav label={t("label")} items={items} className={desktop ? "border-b border-edge pb-4" : "lg:hidden"} />;
}
