import { getTranslations, setRequestLocale } from "next-intl/server";
import { getOrgTimeZone, listMyCertificates } from "@/lib/dal/certificates";
import { CertificateList } from "@/components/me/certificate-list";
import { HubStrip } from "@/components/shell/hub-strip";
import { HubTopRow } from "@/components/shell/hub-top-row";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";

// SCR-023 · «شهاداتي» — `Certificates.dc.html`, `M10c.md` §3, REQ-UIX-073, REQ-CRT-013, REQ-CRT-014, OQ-015, with
// `DEC-218` §4.1. Written from the artboard in wave 20 after the old page was deleted (DEC-208); its kept-behaviour
// table is C1 – C15 in `docs/plan/notes/content.md`.
//
// In the artboard's order: the page's own top row (back to `/app/me`, the `h1`), the phone strip, then one list.
//
// ★ `listMyCertificates()` is `designer`'s, read only: the member's own, `held` excluded — a held certificate is
// invisible until an admin releases it (REQ-CRT-004), the DAL filters it and `certs_read_self_or_admin` refuses it.
//
// ★ A REFUSED OR FAILED DOWNLOAD (C3, DEC-177): the audited route sends the member back here with
// `?download=failed`, and the page says so above the list.
export default async function MyCertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ download?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, { certificates }, timeZone, query] = await Promise.all([
    getTranslations("certificates"),
    listMyCertificates(locale),
    getOrgTimeZone(locale),
    searchParams ?? Promise.resolve({}),
  ]);
  const downloadFailed = (query as { download?: string | string[] }).download === "failed";

  return (
    <div className="flex flex-col gap-4">
      <HubTopRow title={t("mine.title")} />
      <HubStrip />

      {downloadFailed ? (
        <Panel tone="error" className="p-3">
          <p role="alert" className="text-body-sm text-fg-heading">
            {t("download.failed")}
          </p>
        </Panel>
      ) : null}

      {certificates.length === 0 ? (
        <EmptyState title={t("mine.empty")} action={{ label: t("mine.browseAction"), href: "/app/sessions" }} />
      ) : (
        <CertificateList certificates={certificates} timeZone={timeZone} locale={locale} t={t} />
      )}
    </div>
  );
}
