import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { listPlatformTemplates, listPromotableVersions } from "@/lib/dal/platform-templates";
import { LibraryGrid } from "./library-table";
import { PromoteTable } from "./promote-table";

// SCR-083 · /app/platform/templates — REQ-DSG-008, REQ-DSG-026, DEC-052, REQ-UIX-118. Written for wave 26 from
// `PlatformTemplates.dc.html` (`DEC-208`: deleted first); what it kept is `docs/plan/notes/platform.md` W26.2.4.
//
// The board's `h1` and its one line — the library is read by every org and copied to be edited — then the grid, one
// group per purpose, and below it the promotion list the board does not draw (`REQ-DSG-008`, DEC-251 Q6).
//
// ★ MANAGED, NOT AUTHORED: there is no «قالب جديد». A super admin has no org and the editor is org-scoped (SCR-057),
// so a platform template comes from a migration (the A27 baseline, present for every org from creation, `DEC-052`)
// or a promotion. ★ No document and no preview anywhere on the page: the cards draw the family's swatch.

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
      <PageHeader inlineActions title={t("title")} />
      <p className="mt-2 text-body-sm text-fg-muted">{t("readOnlyLine")}</p>

      <div id="library" className="mt-6 space-y-8">
        {(["poster", "certificate"] as const).map((purpose) => {
          const rows = library.filter((tpl) => tpl.purpose === purpose);
          return (
            <section key={purpose} aria-labelledby={`purpose-${purpose}`}>
              <SectionHeader
                as="h2"
                id={`purpose-${purpose}`}
                title={purpose === "poster" ? t("purposePoster") : t("purposeCertificate")}
              />
              <div className="mt-3">
                <LibraryGrid purpose={purpose} templates={rows} locale={loc} />
              </div>
            </section>
          );
        })}
      </div>

      <section id="promote" aria-labelledby="promote-title" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="promote-title" title={t("promoteTitle")} />
        <div className="mt-4">
          <PromoteTable candidates={candidates} locale={loc} />
        </div>
      </section>
    </>
  );
}
