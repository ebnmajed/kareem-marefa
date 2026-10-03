import { setRequestLocale } from "next-intl/server";
import { TemplatesScreen } from "@/components/templates/templates-screen";

// SCR-055 · /app/admin/templates/certificates — REQ-UIX-108, REQ-ADM-013, REQ-DSG-008, written for wave 23 from
// `AdminTemplatesCerts.dc.html` (DEC-208: deleted first). One screen over two purposes (D54): the screen is
// `components/templates/templates-screen.tsx`. `?new=1` opens «قالب جديد» — a link, so it works without JS.

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ new?: string | string[] }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { new: creating } = await searchParams;
  return <TemplatesScreen locale={locale} purpose="certificate" creating={creating === "1"} />;
}
