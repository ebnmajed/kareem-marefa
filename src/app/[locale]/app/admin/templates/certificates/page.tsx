import { setRequestLocale } from "next-intl/server";
import { TemplateLibraryPage } from "@/components/designer/template-library-page";

// SCR-056 · /app/admin/templates/certificates — REQ-ADM-013, REQ-DSG-004, REQ-DSG-007,
// REQ-DSG-008, REQ-DSG-024, REQ-DSG-026, D67, DEC-148. The screen is shared
// with its twin; see `components/designer/template-library-page.tsx`.

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ scheme?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scheme } = await searchParams;
  return <TemplateLibraryPage locale={locale} purpose="certificate" scheme={scheme} />;
}
