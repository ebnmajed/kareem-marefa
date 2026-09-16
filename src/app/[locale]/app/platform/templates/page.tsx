import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { listPlatformTemplates, listPromotableVersions } from "@/lib/dal/platform-templates";
import { LibraryTable } from "./library-table";
import { PromoteTable } from "./promote-table";

// SCR-083 · /app/platform/templates — REQ-DSG-008, REQ-DSG-026, DEC-052,
// onto the system for wave 8 with DEC-148's contract 3
// (`docs/plan/notes/platform.md` W8.6, W8.10).
//
// ★ MANAGED, NOT AUTHORED, and the screen says so rather than leaving an operator
// hunting for an editor that does not exist here. A super admin has no org and
// the designer's editor is org-scoped (SCR-057), so the two ways a platform
// template comes into being are a migration and a promotion.
//
// ★ The baseline is present for every org from creation and depends on no org
// publishing first (DEC-052): five poster families and three certificate
// families in both orientations, each rendering light and dark (DEC-148). A
// purpose never falls below one default; the tables do not offer the retirement
// the floor would refuse.
//
// No preview, and no document anywhere on this page.

export default async function PlatformTemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [library, candidates, t] = await Promise.all([
    listPlatformTemplates(locale),
    listPromotableVersions(locale),
    getTranslations("platform.templates"),
  ]);
  const loc = locale as Locale;

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      <Panel tone="info" className="mt-6 max-w-3xl">
        <ul className="space-y-2 text-body-sm text-fg-body">
          {(["baselineNote", "schemesNote", "floorNote"] as const).map((key) => (
            <li key={key} className="flex items-start gap-2">
              <InfoIcon className="mt-1 text-fg-muted" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <section aria-labelledby="library" className="mt-10">
        <SectionHeader as="h2" id="library" title={t("libraryTitle")} count={library.length} />
        {(["poster", "certificate"] as const).map((purpose) => {
          const rows = library.filter((tpl) => tpl.purpose === purpose);
          return (
            <section key={purpose} aria-labelledby={`purpose-${purpose}`} className="mt-8">
              <SectionHeader
                as="h3"
                id={`purpose-${purpose}`}
                title={purpose === "poster" ? t("purposePoster") : t("purposeCertificate")}
                count={rows.length}
              />
              <div className="mt-3">
                <LibraryTable purpose={purpose} templates={rows} locale={loc} />
              </div>
            </section>
          );
        })}
      </section>

      <section aria-labelledby="promote" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="promote" title={t("promoteTitle")} description={t("promoteNote")} count={candidates.length} />
        <div className="mt-4">
          <PromoteTable candidates={candidates} locale={loc} />
        </div>
      </section>
    </>
  );
}
