import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { familiesFor, getTemplateLibrary, type TemplatePurpose } from "@/lib/dal/templates";
import { listEditorFaces } from "@/lib/dal/fonts";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { CreateTemplateDialog } from "@/components/designer/template-actions";
import { TemplateLibrary } from "@/components/designer/template-library";

// SCR-055 and SCR-056 are one screen over two purposes (D54), so the two
// `page.tsx` files are one line each and this is the page.
//
// ★ The scheme. A poster is generated dark (DEC-125), so the poster library
// previews dark. A certificate carries no scheme of its own — a scheme is
// chosen per session and is never a row (DEC-148) — so its library offers
// both, as links: the brand is composed on the server at request time, the
// same path an export takes (DEC-053).

export async function TemplateLibraryPage({ locale, purpose, scheme }: { locale: string; purpose: TemplatePurpose; scheme?: string }) {
  const [t, data, faces, headerList] = await Promise.all([
    getTranslations("templates"),
    getTemplateLibrary(locale, purpose, { scheme: scheme ?? null }),
    listEditorFaces(locale),
    headers(),
  ]);
  if (!data) notFound();

  // Absolute, so a `srcdoc` frame resolves the font URLs the same way in
  // every browser rather than depending on how it inherits a base URL.
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const path = `/app/admin/templates/${purpose === "poster" ? "posters" : "certificates"}`;

  return (
    <>
      <PageHeader
        title={t(purpose === "poster" ? "library.titlePoster" : "library.titleCertificate")}
        description={t("library.intro")}
        meta={<p className="text-body-sm text-fg-muted">{purpose === "poster" ? t("library.posterScheme") : t("library.schemeHint")}</p>}
        actions={
          <>
            {purpose === "certificate" ? (
              <nav aria-label={t("library.schemeLegend")} className="flex items-center gap-1">
                {(["light", "dark"] as const).map((value) => (
                  <Link
                    key={value}
                    href={`${path}?scheme=${value}`}
                    aria-current={data.scheme === value ? "true" : undefined}
                    className={buttonClass(data.scheme === value ? "primary" : "secondary", "sm")}
                  >
                    {t(value === "light" ? "library.schemeLight" : "library.schemeDark")}
                  </Link>
                ))}
              </nav>
            ) : null}
            {data.canManage ? (
              <CreateTemplateDialog locale={locale} purpose={purpose} families={familiesFor(purpose).map((f) => ({ value: f, label: t(`family.${f}`) }))} />
            ) : null}
          </>
        }
      />
      <div className="mt-8">
        <TemplateLibrary data={data} locale={locale} origin={origin} faces={faces} />
      </div>
    </>
  );
}
