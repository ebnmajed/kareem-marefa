import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getMe, getMyInterests, listCompanies } from "@/lib/dal/members";
import { HubStanding, HubStandingSkeleton } from "@/components/hub/standing";
import { ProfileEdit } from "@/components/me/profile-edit";
import { ProfileRead } from "@/components/me/profile-read";
import { HubStrip } from "@/components/shell/hub-strip";
import { HubTopRow } from "@/components/shell/hub-top-row";
import { SettingsIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import type { Locale } from "@/i18n/routing";

// SCR-021 · «حسابي» — `/app/me`, the hub's landing and «ملفي». `Me.dc.html`, `MeEdit.dc.html`, `HubDesktop.dc.html`,
// `M10c.md` §1, REQ-UIX-071, REQ-PRF-001, REQ-PRF-002, with `DEC-218` §4.2 – §4.5. Written from the artboards in
// wave 20 after the old page and its form were deleted (DEC-208); the kept-behaviour table is P1 – P22 in
// `docs/plan/notes/content.md`.
//
// In the artboard's order: the page's own top row — the `h1` «حسابي» and, at the inline-end, the settings glyph —
// then the standing card (contract 3, `scoring`'s, the phone's form), the phone strip, then «ملفي»: read by default,
// edit on intent. From `lg` the hub's layout draws the band and the strip above this, so the card is the phone's alone.
//
// ★ EDIT MODE IS A URL, `/app/me?edit` (DEC-218 §4.3): «عدّل ملفك» and «إلغاء» are links, so both work before
// hydration and a reload keeps the mode.
//
// ★ THE SETTINGS GLYPH IS NAMED BY WHERE IT GOES (DEC-218 §4.5): it opens `/app/me/settings` and says «الإعدادات»
// (PR B; in PR A, before the route existed, it opened privacy under privacy's name).
//
// ★ wave 27 (`DEC-254` §2.5, `REQ-PRF-012`): the company is SHOWN, never chosen — no picker in edit mode, no
// «choose one» banner in read mode. `companies` is read for the name and the dot only.
//
// ★ The auth boundary is the DAL's (`sessionClient` → `requireSession`); the self tier is `me()`'s (REQ-PRF-004).
export default async function MePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ edit?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = ((await searchParams) ?? {}) as { edit?: string | string[] };
  const editing = query.edit !== undefined;

  const [t, tShell, tMembers, me, companies, interests] = await Promise.all([
    getTranslations("profile"),
    getTranslations("app.shell"),
    getTranslations("members.profile"),
    getMe(locale),
    listCompanies(locale),
    getMyInterests(locale),
  ]);
  const company = companies.find((c) => c.id === me.companyId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <HubTopRow
        title={t("hubTitle")}
        back={false}
        action={
          <Link
            href="/app/me/settings"
            aria-label={tShell("settings")}
            className="inline-flex size-10 items-center justify-center rounded-pill border border-edge bg-surface text-fg-heading"
          >
            <SettingsIcon />
          </Link>
        }
      />
      {/* Contract 3 — `scoring`'s standing, the phone's card; from `lg` the layout draws the band instead. */}
      <Suspense fallback={<HubStandingSkeleton form="card" className="lg:hidden" />}>
        <HubStanding locale={locale} form="card" className="lg:hidden" />
      </Suspense>
      <HubStrip />
      {editing ? (
        <ProfileEdit locale={locale as Locale} me={me} interests={interests} />
      ) : (
        <ProfileRead me={me} companyName={company?.name ?? null} companyTeamColor={company?.teamColor ?? null} interests={interests.chosen} t={t} noBio={tMembers("noBio")} />
      )}
    </div>
  );
}
