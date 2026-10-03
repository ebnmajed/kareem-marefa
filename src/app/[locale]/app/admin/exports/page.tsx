import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { listRecentExports, type ExportType } from "@/lib/dal/admin-exports";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { ExportsTable } from "./exports-table";

// SCR-061 · /app/admin/exports (`REQ-ADM-017`, `REQ-UIX-098`), written for wave 22 from `AdminExports.dc.html`
// (`DEC-208`: deleted first). The job: an admin presses «CSV» on the row they need; the file opens in Excel in Arabic —
// UTF-8 with a BOM, Arabic headers and values, Western numerals, sortable dates — and the row then names them and the
// time, read back from the audit row the download wrote.
//
// Admin only, decided at the data (`listRecentExports` → null → the streamed not-found, `DEC-134`); every export's
// Route Handler answers 404 on its own (`REQ-ADM-020`: an export is an admin capability). The download is a Route
// Handler; the audit write happens there, on the download, never on opening this screen.
//
// ★ The rows are the artboard's order, and `REQ-ADM-017`'s RSVPs are kept though the artboard drops them (D11): eight.

const ORDER: ExportType[] = ["sessions", "rsvps", "attendance", "members", "points", "ratings", "certificates", "audit"];

export default async function ExportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [recent, prefs, t] = await Promise.all([listRecentExports(locale), getOrgPrefs(locale), getTranslations("admin.exports")]);
  if (recent === null) notFound();

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          // «كل تصدير مسجَّل» — shown, not only said: it opens the export rows in the audit log.
          <p className="text-caption text-fg-muted">
            {t("caption")}{" "}
            <Link href="/app/admin/audit?action=export.created" className="text-fg-heading underline underline-offset-4">
              {t("captionLink")}
            </Link>
          </p>
        }
      />
      <div className="mt-6">
        <ExportsTable rows={ORDER.map((type) => ({ type, last: recent[type] ?? null }))} timeZone={prefs.timeZone} locale={locale} />
      </div>
    </>
  );
}
