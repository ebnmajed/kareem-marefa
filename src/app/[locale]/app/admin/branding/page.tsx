import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireSession } from "@/lib/dal/session";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { signDesignAssetUrl } from "@/lib/dal/posters";
import { getBrandKit, getImageLimitMb, getOrgName } from "@/lib/brand/kit";
import { listSelectableFonts } from "@/lib/brand/fonts";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/components/sessions/numerals";
import { BrandKitEdit } from "@/components/branding/brand-kit-edit";
import { BrandKitRead } from "@/components/branding/brand-kit-read";
import { TEAM_COLOUR_HEX, TEAM_COLOUR_NAMES } from "@/app/[locale]/app/admin/companies/team-colours";
import { resetBrandKitAction, saveBrandKitAction, signLogoPreview } from "./actions";

// SCR-059 · /app/admin/branding — `AdminBranding.dc.html`, `M13.md` §059, REQ-UIX-116, REQ-ADM-015, REQ-DSG-021,
// DEC-251 §3. Rebuilt from the artboard (DEC-208): the kept-behaviour table is B1 – B30 and N1 – N8 in
// `docs/plan/notes/branding.md` W26.1.
//
// ★ READ FIRST, with one «عدّل» (a link to `?edit`); edit mode is the console's read-mode pattern (DEC-231 §3). The
// console frame is the lead's: this page renders its `h1` row and its content, nothing of the frame.
// ★ ADMIN ONLY (B1): `save_brand_kit()` / `reset_brand_kit()` are an admin's act (DEC-014); `getBrandKit()` stays
// readable to its other consumers, so the gate is here.
// ★ The kit feeds posters, certificates and email — NOT the app (DEC-201): nothing on this page reads it as a style.
// ★ The saved mark is the row's own `updated_at` (`brand_kit()`), the time the server wrote — never the client's clock.

export default async function BrandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireSession(locale);
  if (session.role !== "admin") notFound();

  const [kit, sp, t, tAdmin] = await Promise.all([
    getBrandKit(locale, session.orgId),
    searchParams,
    getTranslations("branding"),
    getTranslations("admin.companies"),
  ]);
  const logoPreviewUrl = kit.logo ? await signDesignAssetUrl(locale, kit.logo.assetId) : null;

  if (sp.edit !== undefined) {
    const [fonts, imageLimitMb, orgName] = await Promise.all([listSelectableFonts(locale), getImageLimitMb(locale), getOrgName(locale)]);
    return (
      <>
        <PageHeader inlineActions title={t("title")} />
        <BrandKitEdit
          locale={locale as Locale}
          kit={kit}
          fonts={fonts}
          logoPreviewUrl={logoPreviewUrl}
          imageLimitMb={imageLimitMb}
          orgName={orgName}
          saveAction={saveBrandKitAction.bind(null, locale as Locale)}
          resetAction={resetBrandKitAction.bind(null, locale as Locale)}
          signPreview={signLogoPreview}
        />
      </>
    );
  }

  // The org's time zone is read for the saved mark alone; if that read fails the mark is left out rather than drawn in
  // a guessed zone or taking the page to the error boundary — the kit itself is the page, the mark is a line under it.
  const timeZone = await getOrgPrefs(locale).then(
    (prefs) => prefs.timeZone,
    () => null,
  );
  const teamColours = TEAM_COLOUR_NAMES.map((name) => ({ hex: TEAM_COLOUR_HEX[name], name: tAdmin(`teamColourNames.${name}`) }));

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <ButtonLink href="/app/admin/branding?edit" size="md">
            {t("edit")}
          </ButtonLink>
        }
      />
      {kit.isOverridden && kit.updatedAt && timeZone ? (
        <p className="mt-2 text-caption text-fg-muted">
          {t.rich("savedMark", { time: formatDateTime(kit.updatedAt, timeZone, locale), bdi: (chunks) => <bdi>{chunks}</bdi> })}
        </p>
      ) : null}
      <BrandKitRead kit={kit} logoUrl={logoPreviewUrl} teamColours={teamColours} />
    </>
  );
}
