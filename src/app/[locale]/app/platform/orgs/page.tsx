import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { listOrgs } from "@/lib/dal/platform";
import { OrgsTable } from "./orgs-table";

// SCR-080 · /app/platform/orgs — REQ-ADM-001, REQ-TEN-001, REQ-TEN-002,
// REQ-TEN-006, REQ-NFR-014, onto the system for wave 8
// (`docs/plan/notes/platform.md` W8.3).
//
// ★ Every figure on this screen is a COUNT. There is no query here that could
// return a member, a session or a comment: `platform_metrics_by_org()` reads a
// view whose select list is counts plus the org's own metadata, and a test pins
// that column list (REQ-ADM-003).
//
// «Set the first admin» (`09` §6) lives on SCR-082, one press from the row: a
// form per card is not a list at 390 px (DEC-148, C3).

export default async function PlatformOrgsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [orgs, t] = await Promise.all([listOrgs(locale), getTranslations("platform.orgs")]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("intro")}
        meta={<p className="text-body-sm text-fg-muted">{t("count", { count: orgs.length, value: formatNumber(orgs.length) })}</p>}
        actions={
          <ButtonLink href="/app/platform/orgs/new" size="md">
            {t("newLink")}
          </ButtonLink>
        }
      />
      <div className="mt-8">
        <OrgsTable orgs={orgs} locale={locale as Locale} />
      </div>
    </>
  );
}
