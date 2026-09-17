import { getTranslations, setRequestLocale } from "next-intl/server";
import { ImpersonationBanner } from "@/components/platform/impersonation-banner";
import { PlatformNav } from "@/components/platform/platform-nav";
import { requirePlatformAdmin } from "@/lib/dal/platform";

// The platform console's shell — `app/platform/**`'s one shared layout, onto
// the system for wave 8 (SCR-080 … 085, REQ-ADM-001, REQ-UIX-017, DEC-147;
// `docs/plan/notes/platform.md` W8.1).
//
// The gate lives in the DAL (`requirePlatformAdmin`), which is called here AND
// again at the data in every page: a layout does not re-render on navigation
// under Partial Rendering [v16], so this is the boundary for "reaches the
// console's chrome at all" and never the boundary for a given screen.
//
// It answers **not found**, not forbidden, for an org admin who guesses the
// URL — streamed, so a 200 with `noindex` and the not-found page (DEC-134). A
// 403 would confirm the console exists and that this account is not on it.
//
// The nav carries no org-scoped link: a super admin has no org.
//
// ★ Order, top to bottom: the break-glass banner (in flow, never sticky — a
// second sticky layer is `16` §3.1's focus hazard), the console's own skip
// link past the rail (the shell's skip link lands on `main`, which is above
// the rail), then the rail beside the content. Nothing in this file knows
// which screen is current; `PlatformNav` reads that on the client, because a
// layout that decides it is wrong from the second screen on.

export default async function PlatformLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin(locale, `/${locale}/app/platform`);
  const t = await getTranslations("platform.shell");

  return (
    <div>
      <ImpersonationBanner locale={locale} />
      <a href="#platform-content" className="skip-link rounded-field bg-navy-950 px-4 py-2 text-label text-white">
        {t("skipToContent")}
      </a>
      <div className="md:grid md:grid-cols-[auto_1fr] md:items-start md:gap-10">
        <PlatformNav />
        {/* `tabIndex={-1}` so the skip link MOVES focus rather than only the
            scroll position (the admin console's own reasoning). */}
        <div id="platform-content" tabIndex={-1} className="mt-6 min-w-0 outline-none md:mt-0">
          {children}
        </div>
      </div>
    </div>
  );
}
