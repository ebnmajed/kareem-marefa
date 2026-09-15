import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ImpersonationBanner } from "@/components/platform/impersonation-banner";
import { requirePlatformAdmin } from "@/lib/dal/platform";

// The platform console's shell — `app/platform/**`'s one shared layout.
// SCR-080 … 085, REQ-ADM-001.
//
// The gate lives in the DAL (`requirePlatformAdmin`), which is called here AND
// again in every page: a layout does not re-render on navigation under Partial
// Rendering [v16], so this is the boundary for "reaches the console at all"
// and never the boundary for a given screen. `requirePlatformAdmin` is
// `cache()`d, so the pair costs one round trip per request, not two.
//
// It answers **not found**, not forbidden, for an org admin who guesses the
// URL. A 403 confirms the console exists and that this account is not on it;
// a 404 says nothing at all, and there is nothing here an org admin should
// learn the shape of.
//
// The nav carries no org-scoped link. A super admin has no org, so there is
// nothing under `/app/admin` for them to reach and no reason to show it.

const NAV = [
  { key: "orgs", href: "/app/platform/orgs" },
  { key: "templates", href: "/app/platform/templates" },
  { key: "metrics", href: "/app/platform/metrics" },
  { key: "impersonate", href: "/app/platform/impersonate" },
] as const;

export default async function PlatformLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin(locale, `/${locale}/app/platform/orgs`);
  const t = await getTranslations("platform.shell");

  return (
    <div>
      {/* SCR-085's persistent banner, on the console's own shell. It renders
          nothing unless this operator is inside a live break-glass session,
          and it is the lead's to wire into `/no-access` — the other screen an
          impersonating super admin actually lands on under DEC-055. A layout
          does not re-render on navigation [v16], so the remaining-time figure
          is as of the last full request; the session expires on its own
          either way, which is what REQ-ADM-002 relies on. */}
      <ImpersonationBanner locale={locale} />
      <nav aria-label={t("brand")} className="border-b border-edge pb-3">
        {/* Wrapping, never an internally-scrollable strip: an item scrolled
            out of a horizontal scroller reads as "off the page" at 390 px,
            which is the same reasoning `admin/layout.tsx` records. */}
        <ul className="flex flex-wrap items-center gap-1">
          {NAV.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="inline-flex h-10 items-center rounded-field px-2 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading md:px-3"
              >
                {t(`nav.${item.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {/* Said once, at the top of the console, and not repeated on every
          screen: this is the property the whole design rests on, and a reader
          who sees it four times stops reading it. */}
      <p className="mt-4 max-w-3xl text-body-sm text-fg-muted">{t("note")}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}
