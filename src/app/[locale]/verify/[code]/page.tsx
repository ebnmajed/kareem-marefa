import { headers } from "next/headers";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { verifyCertificate } from "@/lib/dal/certificates";

// SCR-006 · `/verify/[code]` — REQ-CRT-007, REQ-CRT-009, REQ-CRT-010,
// REQ-CRT-011, A13. PUBLIC and unauthenticated.
//
// «A statement, not a form.» There is no input on this page: the realistic
// reader is holding a phone over a printed sheet, having followed the QR on
// it, and the only thing they want is large enough to read at arm's length.
//
// ★ IT SHOWS SIX FIELDS AND NOTHING ELSE (A13). Not the org's logo, not a
// link into the product, not how many certificates the org has issued. The
// allowlist is enforced by `verify_certificate()`'s RETURN TYPE rather than
// by this component, so a column added to `certificates` next year cannot
// leak through here by being selected accidentally.
//
// ★ THE REVOCATION REASON IS NEVER HERE (OQ-015, REQ-CRT-011). It is not in
// the function's return type either. The member sees it on SCR-023; a
// stranger with the code does not.
//
// ★ UNKNOWN AND REVOKED-NONEXISTENT ARE THE SAME PAGE (REQ-CRT-007). The
// function returns an empty set for both, and this renders one message for
// both — «لم نعثر على شهادة بهذا الرمز.» A page that said «this code was
// revoked» for one and «no such code» for the other would confirm the
// existence of certificates to anyone walking the space.
//
// ★ A SERIAL RETURNS NOT-FOUND (REQ-CRT-009). `KM-2026-000001` fails the
// code's shape in the DAL before the database is touched, and the SQL
// function matches only on `verification_code` even if it were reached.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VerifyPage({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("certificates.verify");

  // REQ-NFR-005. The forwarded address is the key — it is the only thing
  // that identifies a caller on a page with no session at all.
  const h = await headers();
  const clientKey = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const outcome = await verifyCertificate(decodeURIComponent(code), clientKey);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
      <h1 className="text-body-sm text-fg-muted">{t("title")}</h1>

      {outcome.status === "rate_limited" ? (
        <p className="mt-6 text-h2 text-fg-heading">{t("rateLimited")}</p>
      ) : outcome.status === "not_found" ? (
        <>
          <p className="mt-6 text-h2 text-fg-heading">{t("notFound")}</p>
          <p className="mt-3 text-body text-fg-body">{t("notFoundHint")}</p>
        </>
      ) : (
        <Result certificate={outcome.certificate} locale={locale} />
      )}
    </main>
  );
}

type Certificate = Extract<Awaited<ReturnType<typeof verifyCertificate>>, { status: "found" }>["certificate"];

async function Result({ certificate: c, locale }: { certificate: Certificate; locale: string }) {
  const t = await getTranslations("certificates");
  const revoked = c.state === "revoked";

  // The numeral system is the ORG's everywhere else in the product. Here
  // there is no session and no org setting a stranger may read, so the
  // locale's own default is the honest choice — and the date is the only
  // number on the page.
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));

  const rows: Array<[string, React.ReactNode]> = [
    [t("verify.recipient"), <bdi key="n">{c.recipientName}</bdi>],
    [t("verify.kind"), t(`kind.${c.kind}`)],
  ];
  if (c.sessionTitle) rows.push([t("verify.session"), <bdi key="s">{c.sessionTitle}</bdi>]);
  if (c.sessionDate) rows.push([t("verify.sessionDate"), <bdi key="sd">{date(c.sessionDate)}</bdi>]);
  if (c.achievementName) rows.push([t("verify.achievement"), <bdi key="a">{c.achievementName}</bdi>]);
  rows.push([t("verify.org"), <bdi key="o">{c.orgName}</bdi>]);
  if (c.issuedAt) rows.push([t("verify.issuedAt"), <bdi key="i">{date(c.issuedAt)}</bdi>]);

  return (
    <>
      {/* The status first and largest: it is the answer to the only question
          the reader has. `role="status"` because on a revoked certificate it
          is the whole point of the page. */}
      <p
        role="status"
        className={
          revoked
            ? "mt-6 rounded-card border border-edge-strong bg-silver-100 px-4 py-3 text-h2 text-fg-heading"
            : "mt-6 rounded-card border border-success bg-success-bg px-4 py-3 text-h2 text-success"
        }
      >
        {revoked ? t("verify.revoked") : t("verify.valid")}
      </p>

      {/* The name is the biggest element after the status — it is what a
          person holding the sheet is checking. */}
      <p className="mt-8 text-h1 text-fg-heading">
        <bdi>{c.recipientName}</bdi>
      </p>

      <dl className="mt-6 flex flex-col gap-3 border-t border-edge pt-6 text-body">
        {rows.slice(1).map(([label, value]) => (
          <div key={label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <dt className="text-body-sm text-fg-muted">{label}</dt>
            <dd className="text-fg-heading">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
