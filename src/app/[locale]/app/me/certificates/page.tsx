import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listMyCertificates, signCertificateUrl } from "@/lib/dal/certificates";
import { formatNumber, formatDateTime } from "@/components/sessions/numerals";
import { getOrgTimeZone } from "@/lib/dal/certificates";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

// SCR-023 · `/app/me/certificates` — REQ-CRT-013, REQ-CRT-014, OQ-015.
//
// A member's own certificates, and the ONE place the revocation reason is
// shown to them. The public page at /verify never shows it: a revocation is
// between the org and the person it concerns, and A13 fixes what a stranger
// holding the code may learn.
//
// A `held` certificate is not here. It is invisible until an admin releases
// it (REQ-CRT-004) — the DAL filters it and `certs_read_self_or_admin`
// refuses it, in that order of defence.
//
// The name shown is `recipient_name_snapshot`, frozen at issuance: a member
// who later changes their display name still sees the name that is PRINTED
// on the document they are holding (REQ-CRT-014).
export default async function MyCertificatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("certificates");
  const [{ certificates }, timeZone] = await Promise.all([listMyCertificates(locale), getOrgTimeZone(locale)]);

  const links = await Promise.all(certificates.map((c) => (c.pdfPath ? signCertificateUrl(locale, c.pdfPath) : Promise.resolve(null))));

  return (
    <div>
      <PageHeader title={t("mine.title")} />

      {certificates.length === 0 ? (
        // ★ REQ-UIX-012, the lead's sync-2 finding: an empty state always
        // names the next action, and "earned, not requested" is not an
        // exception to it — attending is the action, and browsing sessions
        // is how a member gets there. Reconsidered from the wave-6 photos
        // precedent this originally copied: that empty state sits beside an
        // uploader that is ALREADY the next action in view, which is not
        // true here.
        <EmptyState title={t("mine.empty")} action={{ label: t("mine.browseAction"), href: "/app/sessions" }} className="mt-4" />
      ) : (
        <>
          <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("mine.intro")}</p>
          <p className="mt-1 text-body-sm text-fg-muted">
            {t("mine.count", { count: certificates.length, value: formatNumber(certificates.length) })}
          </p>

          <ul className="mt-6 flex flex-col gap-4">
            {certificates.map((c, i) => (
              <li key={c.id}>
                <Panel className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-body font-medium text-fg-heading">
                        <bdi>{c.sessionTitle ?? c.achievementName ?? t(`kind.${c.kind}`)}</bdi>
                      </p>
                      <p className="mt-1 text-body-sm text-fg-body">{t(`kind.${c.kind}`)}</p>
                    </div>
                    <Badge tone={c.state === "revoked" ? "error" : "success"} outline size="sm">
                      {t(`state.${c.state}`)}
                    </Badge>
                  </div>

                  {/* ★ `dir="ltr"` INSIDE a `<bdi>`. The serial and the code are
                      Latin-and-digit strings; unisolated they reorder against
                      their Arabic label and print as nonsense (09 SCR-023). */}
                  {/* ★ `break-all` on the two codes, and `min-w-0` on their
                      rows. A verification code is 24 unbroken base64url
                      characters and a serial is 14 — neither has a break
                      opportunity, so at 390 px the flex item refuses to
                      shrink below its own min-content width and the page
                      scrolls sideways. The 390 px review caught it: 432 px
                      of content in a 390 px viewport with NO single element
                      wider than the screen, which is what a row of
                      unbreakable tokens looks like. Breaking a Latin code
                      mid-string is fine; the rule against clipping is about
                      Arabic text lines, and nothing here is clipped. */}
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-2">
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <dt className="text-fg-muted">{t("mine.serial")}</dt>
                      <dd className="min-w-0 break-all text-fg-heading">
                        <bdi dir="ltr">{c.serial}</bdi>
                      </dd>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <dt className="text-fg-muted">{t("mine.code")}</dt>
                      <dd className="min-w-0 break-all text-fg-heading">
                        <bdi dir="ltr">{c.verificationCode}</bdi>
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <dt className="text-fg-muted">{t("mine.issuedAt")}</dt>
                      <dd className="text-fg-heading">
                        {c.issuedAt ? <bdi>{formatDateTime(c.issuedAt, timeZone, locale)}</bdi> : t("mine.notIssued")}
                      </dd>
                    </div>
                  </dl>

                  {c.state === "revoked" && c.revocationReason ? (
                    <Panel tone="error" className="mt-3 p-3 text-body-sm text-fg-body">
                      {t.rich("mine.revokedReason", { reason: c.revocationReason, bdi: (chunk) => <bdi>{chunk}</bdi> })}
                    </Panel>
                  ) : null}

                  <p className="mt-3 flex flex-wrap items-center gap-4 text-body-sm">
                    {/* A revoked certificate keeps its PDF (REQ-CRT-011) — the
                        document exists, the claim it makes no longer holds, and
                        /verify is what says so. Not offering the download would
                        not un-print the copies already in the world. */}
                    {links[i] ? (
                      <a className="text-fg-heading underline" href={links[i] as string} download>
                        {t("mine.download")}
                      </a>
                    ) : (
                      <span className="text-fg-muted">{t("mine.preparing")}</span>
                    )}
                    <Link className="text-fg-heading underline" href={`/verify/${c.verificationCode}`}>
                      {t("mine.verify")}
                    </Link>
                  </p>
                </Panel>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
