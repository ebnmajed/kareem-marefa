import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireSession } from "@/lib/dal/session";
import { getBrandKit } from "@/lib/brand/kit";
import { listSelectableFonts } from "@/lib/brand/fonts";
import { signDesignAssetUrl } from "@/lib/dal/posters";
import { BrandKitForm } from "@/components/branding/brand-kit-form";
import { saveBrandKitAction, resetBrandKitAction, signLogoPreview } from "./actions";

// SCR-059 · /app/admin/branding — REQ-ADM-015, REQ-DSG-021. Admin only:
// `save_brand_kit()`/`reset_brand_kit()` are an admin act (DEC-014), and the
// screen that offers them has no reason to be reachable by anyone else —
// `getBrandKit()` itself stays P1-read for legitimate non-admin consumers
// (the theme layer, the editor preview), so the gate is here, not there.
export default async function BrandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireSession(locale);
  if (session.role !== "admin") notFound();

  const [kit, fonts, t] = await Promise.all([
    getBrandKit(locale, session.orgId),
    listSelectableFonts(locale),
    getTranslations("branding"),
  ]);

  const logoPreviewUrl = kit.logo ? await signDesignAssetUrl(locale, kit.logo.assetId) : null;

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>
      <BrandKitForm
        locale={locale as Locale}
        kit={kit}
        fonts={fonts}
        logoPreviewUrl={logoPreviewUrl}
        saveAction={saveBrandKitAction.bind(null, locale as Locale)}
        resetAction={resetBrandKitAction.bind(null, locale as Locale)}
        signPreview={signLogoPreview}
      />
    </>
  );
}
