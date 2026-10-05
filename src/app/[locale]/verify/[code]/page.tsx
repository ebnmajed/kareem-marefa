import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { CheckIcon } from "@/components/ui/icons";
import { platformConfigured } from "@/lib/supabase/env";
import { verifyCertificate } from "@/lib/dal/certificates";

// SCR-006 · `/verify/[code]` — REQ-UIX-115, REQ-CRT-007, REQ-CRT-009, REQ-CRT-010, REQ-CRT-011, A13.
// PUBLIC and unauthenticated. Rebuilt in wave 26 from `docs/design/screens/m13/Verify.dc.html`: deleted first, then
// written (`DEC-208`); the table of what it kept is in `docs/plan/notes/wave-26-lead.md` (V1 – V12).
//
// «A statement, not a form.» The reader is holding a phone over a printed sheet, having followed the QR on it. The
// regions, in the artboard's order: the mark and the page's name · the answer, as a mark and two words · the facts,
// in one card · the address they came by.
//
// ★ IT SHOWS WHAT THE LOOKUP RETURNS AND NOTHING ELSE (A13, V8). Not a link into the product, not the org's logo, not
// how many certificates exist — and not the SERIAL the artboard lists as a sixth fact: `verify_certificate()`'s
// return type does not carry it, and that return type, not this component, is the allowlist.
//
// ★ THE REVOCATION REASON IS NEVER HERE (OQ-015, REQ-CRT-011, V7). It is not in the function's return type either.
//
// ★ UNKNOWN, MALFORMED AND «THAT IS A SERIAL» ARE ONE PAGE (REQ-CRT-007, REQ-CRT-009, V5). One sentence for all
// three, so nothing here confirms that a certificate exists to someone walking the space.
//
// The scope is the layout's (`verify/layout.tsx`); the mark is still (`REQ-UIX-119`) — the reveal is the landing's
// and sign-in's, never a document's.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VerifyPage({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  setRequestLocale(locale);

  // ★ DEC-038 (V3). The proxy answers 404 for /verify on an unconfigured platform before this page runs (DEC-051);
  // this line stays as defence in depth — the page must never reach `supabaseEnv()` unconfigured.
  if (!platformConfigured()) notFound();

  const t = await getTranslations("certificates");

  // REQ-NFR-005 (V4). The forwarded address is the key — the only thing that identifies a caller with no session.
  const h = await headers();
  const clientKey = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const raw = decodeURIComponent(code);
  const outcome = await verifyCertificate(raw, clientKey);
  const host = h.get("x-forwarded-host") ?? h.get("host");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-6">
      <div className="flex items-center justify-between gap-4">
        <Logo height={33} />
        <h1 className="text-caption text-fg-muted">{t("verify.title")}</h1>
      </div>

      {outcome.status === "found" ? (
        <Found certificate={outcome.certificate} locale={locale} t={t} />
      ) : (
        <p className="mt-10 text-center font-display text-[1.75rem] leading-[1.4] font-extrabold text-fg-heading">
          {outcome.status === "rate_limited" ? t("verify.rateLimited") : t("verify.notFound")}
        </p>
      )}

      {/* The address they came by — for a certificate that exists; an unknown code is not echoed back. */}
      {outcome.status === "found" && host ? (
        <p className="mt-auto pt-10 text-center text-[0.75rem] leading-[1.7] break-all text-fg-muted">
          <bdi dir="ltr">
            {host}/verify/{raw}
          </bdi>
        </p>
      ) : null}
    </main>
  );
}

type Certificate = Extract<Awaited<ReturnType<typeof verifyCertificate>>, { status: "found" }>["certificate"];
type T = Awaited<ReturnType<typeof getTranslations<"certificates">>>;

function Found({ certificate: c, locale, t }: { certificate: Certificate; locale: string; t: T }) {
  const revoked = c.state === "revoked";

  // There is no session and no org setting a stranger may read, so the date takes the page's locale — in Western
  // numerals, always (DEC-124, V10).
  const date = (iso: string) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: "long" }).format(new Date(iso));

  // V8 — exactly what the lookup returned, each only when it is there.
  const facts: Array<[string, ReactNode]> = [
    [t("verify.recipient"), c.recipientName],
    [t("verify.kind"), t(`kind.${c.kind}`)],
  ];
  if (c.sessionTitle) facts.push([t("verify.session"), c.sessionTitle]);
  if (c.sessionDate) facts.push([t("verify.sessionDate"), date(c.sessionDate)]);
  if (c.achievementName) facts.push([t("verify.achievement"), c.achievementName]);
  facts.push([t("verify.org"), c.orgName]);
  if (c.issuedAt) facts.push([t("verify.issuedAt"), date(c.issuedAt)]);

  return (
    <>
      {/* The answer first and largest (V6). The mark beside it repeats it for the eye; the words carry it, so colour
          is never the only channel (REQ-NFR-007). */}
      <div className="mt-10 flex flex-col items-center gap-3.5 text-center">
        <span
          aria-hidden
          className={`inline-flex size-16 items-center justify-center rounded-pill text-[1.875rem] font-extrabold leading-none ${
            revoked ? "bg-signal text-on-signal" : "bg-accent text-on-accent"
          }`}
        >
          {revoked ? "!" : <CheckIcon />}
        </span>
        <p role="status" className="font-display text-[1.75rem] leading-[1.4] font-extrabold text-fg-heading">
          {revoked ? t("verify.revoked") : t("verify.valid")}
        </p>
      </div>

      <dl className="mt-7 rounded-panel border border-edge bg-surface px-4">
        {facts.map(([label, value], index) => (
          <div key={label} className={`flex gap-4 py-3 text-body-sm ${index > 0 ? "border-t border-edge" : ""}`}>
            <dt className="w-[6.875rem] shrink-0 font-bold text-fg-muted">{label}</dt>
            <dd className="min-w-0 flex-1 font-bold text-fg-heading">
              <bdi>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
