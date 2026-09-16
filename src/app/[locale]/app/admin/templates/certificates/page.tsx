import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getTemplateLibrary } from "@/lib/dal/templates";
import { TemplateLibrary } from "@/components/designer/template-library";
import { TemplateResult } from "@/components/designer/template-result";

// SCR-056 · /app/admin/templates/certificates — REQ-ADM-013, REQ-DSG-007,
// REQ-DSG-008, REQ-DSG-024, REQ-DSG-026, D67.

export default async function CertificateTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ done?: string; error?: string; version?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const [t, data] = await Promise.all([getTranslations("templates.library"), getTemplateLibrary(locale, "certificate")]);
  if (!data) notFound();

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("titleCertificate")}</h1>
      <TemplateResult done={query.done} error={query.error} version={query.version} />
      <div className="mt-8">
        <TemplateLibrary data={data} />
      </div>
    </>
  );
}
