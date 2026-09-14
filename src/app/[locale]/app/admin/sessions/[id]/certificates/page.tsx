import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSessionCertificates, getOrgTimeZone, type CertificateRow } from "@/lib/dal/certificates";
import { formatDateTime, formatNumber, type NumeralSystem } from "@/components/sessions/numerals";
import { release, revoke } from "./actions";

// SCR-045 · `/app/admin/sessions/[id]/certificates` — REQ-CRT-004,
// REQ-CRT-011, D50.
//
// Review and release, individually or in bulk; revoke with a mandatory
// reason. Admin-only: `release_certificates()` and `revoke_certificate()`
// both check `is_org_admin()` themselves, so a moderator reaching this URL
// sees the lists (their read policy allows it) and no controls.
//
// ★ THE MODE NOTICE IS THE FIRST THING ON THE SCREEN, and it is not
// decoration. In `automatic` there is nothing to do here and the held list
// is permanently empty — an admin who does not know that will wait for
// certificates to appear for review. In `off` there will never be a
// certificate at all. Saying which of the three is in force is the
// difference between an empty screen that is correct and an empty screen
// that looks broken.
//
// ★ RELEASE IS A PLAIN FORM WITH CHECKBOXES, not a client-side selection
// model. The whole interaction is «tick some rows, press one button», which
// a form does natively, keeps working without JavaScript, and cannot
// desynchronise from the list it was rendered against.

export default async function SessionCertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  const query = await searchParams;
  const t = await getTranslations("certificates");

  const [data, timeZone] = await Promise.all([getSessionCertificates(locale, id), getOrgTimeZone(locale)]);
  if (!data) notFound();

  const released = typeof query.released === "string" ? Number(query.released) : null;
  const error = typeof query.error === "string" ? query.error : null;
  const done = typeof query.done === "string" ? query.done : null;

  const modeNotice = data.mode === "off" ? t("review.modeOff") : data.mode === "automatic" ? t("review.modeAutomatic") : t("review.modeReview");

  return (
    <div>
      <h1 className="text-h1 text-fg-heading">{t("review.title")}</h1>
      <p className="mt-2 max-w-2xl text-body text-fg-body">{t.rich("review.session", { title: data.sessionTitle, bdi: (c) => <bdi>{c}</bdi> })}</p>

      <p className="mt-4 max-w-2xl rounded-field border border-edge bg-silver-100 p-3 text-body-sm text-fg-body">{modeNotice}</p>
      {data.state !== "completed" && data.mode !== "off" ? <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("review.notCompleted")}</p> : null}
      {!data.canRelease ? <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("review.notAuthorized")}</p> : null}

      {released !== null && Number.isFinite(released) ? (
        <p role="status" className="mt-4 text-body-sm text-fg-heading">
          {t("review.released", { count: released, value: formatNumber(released, data.numerals) })}
        </p>
      ) : null}
      {done === "revoked" ? (
        <p role="status" className="mt-4 text-body-sm text-fg-heading">
          {t("review.revokeDone")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-body-sm text-error">
          {error === "reason_required" ? t("review.reasonRequired") : error === "not_authorized" ? t("review.notAuthorized") : t("review.failed")}
        </p>
      ) : null}

      {/* ── held ─────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-h2 text-fg-heading">{t("review.heldHeading")}</h2>
        {data.held.length === 0 ? (
          <p className="mt-3 text-body-sm text-fg-muted">{t("review.heldEmpty")}</p>
        ) : (
          <form action={release} className="mt-4">
            <input type="hidden" name="sessionId" value={data.sessionId} />
            <ul className="flex flex-col gap-2">
              {data.held.map((c) => (
                <li key={c.id} className="rounded-field border border-edge p-3">
                  <label className="flex flex-wrap items-baseline gap-3">
                    {data.canRelease ? <input type="checkbox" name="id" value={c.id} className="size-4" /> : null}
                    <span className="text-body text-fg-heading">
                      <bdi>{c.recipientName}</bdi>
                    </span>
                    <span className="text-body-sm text-fg-muted">{t(`kind.${c.kind}`)}</span>
                    <span className="text-body-sm text-fg-muted">
                      {t("review.serial")} <bdi dir="ltr">{c.serial}</bdi>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {data.canRelease ? (
              <button type="submit" className="mt-4 inline-flex h-11 items-center rounded-field bg-navy-900 px-4 text-label text-canvas">
                {t("review.release")}
              </button>
            ) : null}
          </form>
        )}
      </section>

      {/* ── issued ───────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-h2 text-fg-heading">{t("review.issuedHeading")}</h2>
        {data.issued.length === 0 ? (
          <p className="mt-3 text-body-sm text-fg-muted">{t("review.issuedEmpty")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {data.issued.map((c) => (
              <li key={c.id} className="rounded-field border border-edge p-3">
                <Row certificate={c} numerals={data.numerals} timeZone={timeZone} locale={locale} />
                {data.canRelease ? <RevokeForm certificate={c} sessionId={data.sessionId} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── revoked ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-h2 text-fg-heading">{t("review.revokedHeading")}</h2>
        {data.revoked.length === 0 ? (
          <p className="mt-3 text-body-sm text-fg-muted">{t("review.revokedEmpty")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {data.revoked.map((c) => (
              <li key={c.id} className="rounded-field border border-edge p-3">
                <Row certificate={c} numerals={data.numerals} timeZone={timeZone} locale={locale} />
                {/* The reason IS shown here — this screen is the org's own.
                    /verify never shows it (OQ-015, REQ-CRT-011). */}
                {c.revocationReason ? (
                  <p className="mt-2 text-body-sm text-fg-body">
                    <bdi>{c.revocationReason}</bdi>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function Row({
  certificate: c,
  numerals,
  timeZone,
  locale,
}: {
  certificate: CertificateRow;
  numerals: NumeralSystem;
  timeZone: string;
  locale: string;
}) {
  const t = await getTranslations("certificates");
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-body text-fg-heading">
        <bdi>{c.recipientName}</bdi>
      </span>
      <span className="text-body-sm text-fg-muted">{t(`kind.${c.kind}`)}</span>
      {/* `dir="ltr"` inside `<bdi>`: a serial is a Latin-and-digit string
          and reorders against its Arabic neighbours without both. */}
      <span className="text-body-sm text-fg-muted">
        {t("review.serial")} <bdi dir="ltr">{c.serial}</bdi>
      </span>
      {c.revokedAt ? (
        <span className="text-body-sm text-fg-muted">
          {t.rich("review.revokedAt", { date: formatDateTime(c.revokedAt, numerals, timeZone, locale), bdi: (x) => <bdi>{x}</bdi> })}
        </span>
      ) : c.issuedAt ? (
        <span className="text-body-sm text-fg-muted">
          <bdi>{formatDateTime(c.issuedAt, numerals, timeZone, locale)}</bdi>
        </span>
      ) : null}
    </p>
  );
}

async function RevokeForm({ certificate: c, sessionId }: { certificate: CertificateRow; sessionId: string }) {
  const t = await getTranslations("certificates.review");
  const reasonId = `reason-${c.id}`;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-body-sm text-fg-heading underline">{t("revoke")}</summary>
      <form action={revoke} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="id" value={c.id} />
        <label htmlFor={reasonId} className="text-body-sm text-fg-body">
          {t("reason")}
        </label>
        <p className="text-body-sm text-fg-muted">{t("reasonHint")}</p>
        {/* `required` and `minLength` are the browser's half. The RPC raises
            22023 on a blank reason and the table's own check constraint is
            the last word (REQ-CRT-011). */}
        <input
          id={reasonId}
          name="reason"
          type="text"
          required
          minLength={3}
          maxLength={500}
          className="h-11 w-full max-w-lg rounded-field border border-edge px-3 text-body"
        />
        <button type="submit" className="inline-flex h-11 w-fit items-center rounded-field border border-edge-strong px-4 text-label text-fg-heading">
          {t("confirmRevoke")}
        </button>
      </form>
    </details>
  );
}
