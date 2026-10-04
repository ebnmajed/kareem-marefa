import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { listOrgs } from "@/lib/dal/platform";
import { OrgsTable } from "./orgs-table";

// SCR-080 · /app/platform/orgs — REQ-ADM-001, REQ-TEN-001, REQ-TEN-002, REQ-TEN-006, REQ-NFR-014, REQ-UIX-118.
// Written for wave 26 from `PlatformOrgs.dc.html` (`DEC-208`: deleted first); what it kept is
// `docs/plan/notes/platform.md` W26.2.1.
//
// The page renders its `h1` row with its one primary and the table — nothing of the frame. Every figure is a COUNT:
// `platform_metrics_by_org()` reads a view whose select list `tests/rls/platform-schema.test.ts` pins (REQ-ADM-003),
// and the gate is that read's own `requirePlatformAdmin()`, at the data (F2).

export default async function PlatformOrgsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [orgs, t] = await Promise.all([listOrgs(locale), getTranslations("platform.orgs")]);

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        count={formatNumber(orgs.length)}
        actions={
          <ButtonLink href="/app/platform/orgs/new" size="md">
            {t("newLink")}
          </ButtonLink>
        }
      />
      <div className="mt-6">
        <OrgsTable orgs={orgs} locale={locale as Locale} />
      </div>
    </>
  );
}
