import { setRequestLocale } from "next-intl/server";
import { TemplateLibraryPage } from "@/components/designer/template-library-page";

// SCR-055 · /app/admin/templates/posters — REQ-ADM-013, REQ-DSG-004, REQ-DSG-007,
// REQ-DSG-008, REQ-DSG-024, REQ-DSG-026, D67, DEC-148. The screen is shared
// with its twin; see `components/designer/template-library-page.tsx`. A poster
// previews dark and offers no scheme (DEC-125).

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TemplateLibraryPage locale={locale} purpose="poster" />;
}
