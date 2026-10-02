import type { getTranslations } from "next-intl/server";
import type { CertificateRow } from "@/lib/dal/certificates";
import { Card } from "@/components/ui/card";
import { DownloadIcon } from "@/components/ui/icons";

// SCR-023's list — `Certificates.dc.html`, `M10c.md` §3, REQ-UIX-073, with `DEC-218` §4.1.
//
// One list card. A row is the title, «kind · date», and a quiet serial line; at its end a download glyph, «قريبًا»
// or «ملغاة». ★ No status word on a certificate that is simply valid: nothing is shown when nothing needs doing
// (`DEC-216` §2.1).
//
// ★ A ROW IS ONE LINK, to `designer`'s audited download route — the certificate's `downloadHref`, never a signed URL
// in the page (DEC-177, DEC-178). The glyph is decorative, so the row is not two links to one place. A certificate
// whose PDF has not rendered has no `downloadHref`: its row is dimmed, says «قريبًا», and is not a link (C4, D6).
//
// ★ A REVOKED CERTIFICATE (C5, C6): struck and dimmed, «ملغاة» at the end, and — `REQ-CRT-013`, the one place a member
// reads it, since `/verify` never shows it (A13) — the reason as a quiet line. It keeps its download: the document
// exists, the claim it makes no longer holds, and `/verify` is what says so (REQ-CRT-011).
//
// ★ The serial is a Latin-and-digit string: `<bdi dir="ltr">`, `break-all`, so at 390 px an unbroken token never
// widens the page (C10, `REQ-CRT-013`).

/** The page's `certificates` translator, handed down so the list stays a plain (synchronous) component. */
type CertificatesT = Awaited<ReturnType<typeof getTranslations<"certificates">>>;

export function CertificateList({ certificates, timeZone, locale, t }: { certificates: CertificateRow[]; timeZone: string; locale: string; t: CertificatesT }) {
  const now = new Date();

  return (
    <Card density="row">
      <ul className="flex w-full min-w-0 flex-col divide-y divide-edge px-3">
        {certificates.map((c) => {
          const revoked = c.state === "revoked";
          const href = c.downloadHref ?? null;
          const dimmed = revoked || !href;
          const title = c.sessionTitle ?? c.achievementName ?? t(`kind.${c.kind}`);
          const end = revoked ? t("state.revoked") : href ? null : t("mine.soon");

          const body = (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`text-body font-bold leading-snug ${dimmed ? "text-fg-muted" : "text-fg-heading"} ${revoked ? "line-through" : ""}`}>
                  <bdi>{title}</bdi>
                </span>
                <span className="text-caption text-fg-muted">
                  {t(`kind.${c.kind}`)}
                  {c.issuedAt ? (
                    <>
                      {" · "}
                      <bdi>{dayMonth(c.issuedAt, timeZone, locale, now)}</bdi>
                    </>
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-wrap gap-x-1.5 text-caption text-fg-muted">
                  <span>{t("mine.serial")}</span>
                  <bdi dir="ltr" className="min-w-0 break-all">
                    {c.serial}
                  </bdi>
                </span>
                {revoked && c.revocationReason ? (
                  <span className="text-caption text-fg-muted">
                    {t.rich("mine.revokedReason", { reason: c.revocationReason, bdi: (chunk) => <bdi>{chunk}</bdi> })}
                  </span>
                ) : null}
              </span>
              {end ? (
                <span className="shrink-0 text-caption font-bold text-fg-muted">{end}</span>
              ) : (
                <DownloadIcon aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
              )}
            </>
          );

          return (
            <li key={c.id}>
              {href ? (
                // A plain anchor: the route is `/api/...`, outside the locale, and it is a download — never
                // `download=` (the route names the file, and a bare `download` writes no audit row, DEC-177).
                <a
                  href={href}
                  className="flex min-w-0 items-center gap-3 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  {body}
                </a>
              ) : (
                <div className="flex min-w-0 items-center gap-3 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** «1 أكتوبر» — the year only when it is not this year's; Western digits (DEC-124), the org's zone. */
function dayMonth(iso: string, timeZone: string, locale: string, now: Date): string {
  const year = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(d);
  const sameYear = year(new Date(iso)) === year(now);
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(new Date(iso));
}
