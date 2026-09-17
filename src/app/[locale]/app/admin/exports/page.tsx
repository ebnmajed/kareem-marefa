import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { EXPORT_TYPES, listRecentExports } from "@/lib/dal/admin-exports";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { ExportsTable } from "./exports-table";

// SCR-061 · /app/admin/exports (REQ-ADM-017), on the M9 system for wave 8
// (K2). Admin only — exports sit outside a moderator's scope (09 §5's
// coverage table): `listRecentExports()` answers null for anyone else and the
// page answers with the streamed not-found (`DEC-134`); the Route Handlers
// answer 404 on their own.
//
// «Every export is audited» is shown, not only said: each file carries who took
// it last and when, read from the `export.created` rows its own downloads
// write, and the note links to those rows in the audit log. The download stays
// a Route Handler (`src/app/api/admin/exports/[type]`); the audit write happens
// there, on the download, never on opening this screen.

export default async function ExportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [recent, prefs, t] = await Promise.all([listRecentExports(locale), getOrgPrefs(locale), getTranslations("admin.exports")]);
  if (recent === null) notFound();

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      <Panel tone="info" className="mt-6 max-w-3xl">
        <p className="text-body-sm text-fg-body">
          {t("auditNote")}{" "}
          <Link href="/app/admin/audit?action=export.created" className="text-fg-heading underline underline-offset-4">
            {t("auditLink")}
          </Link>
        </p>
      </Panel>
      <div className="mt-6">
        <ExportsTable rows={EXPORT_TYPES.map((type) => ({ type, last: recent[type] ?? null }))} timeZone={prefs.timeZone} locale={locale} />
      </div>
    </>
  );
}
