import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  estimateNextSerial,
  getCertificateDesign,
  getOrgTimeZone,
  getSessionCertificateFaces,
  getSessionCertificatesWithRender,
  listEligibleRecipients,
  type CertificateDesignData,
  type SessionCertificateKind,
} from "@/lib/dal/certificates";
import { listEditorFaces } from "@/lib/dal/fonts";
import { EditorSurface } from "@/components/admin/editor-surface";
import { formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { EligibleTable } from "./eligible-table";
import { Issuance } from "./issuance";
import { CertificateModeControl } from "./mode-control";
import { RevokeForm } from "./revoke-form";
import { TemplateControl } from "./template-control";

// SCR-045 الشهادات · `/app/admin/sessions/[id]/certificates` — rebuilt for wave 23 from `AdminCertificates.dc.html`
// (DEC-208: deleted first; the kept-behaviour table is `docs/plan/notes/console.md` §4.2). REQ-UIX-109, REQ-CRT-001,
// REQ-CRT-004, REQ-CRT-011, REQ-CRT-015, REQ-DSG-031, DEC-177, DEC-178, DEC-238.
//
// The job: before completion an admin sets the MODE and, per kind, the TEMPLATE here and nowhere else (the owner's C6
// ruling — DEC-178 stands); after completion they issue held certificates one at a time or in bulk, revoke one with a
// mandatory reason, and hand out a PDF only through the one audited route.
//
// The hub's header and tabs are above this page (wave 21); it renders nothing of them. In the board's order: the line
// «الوضع · … · القالب: …», then «محجوزة» and «صادرة». The board draws a completed session; before completion is built in
// the sober register — REQ-DSG-031's three meanings kept apart: the template per kind, the mode with its preflight, and
// who receives one. After completion the mode is a sentence (refused by the function); the template may still change
// while that kind has held certificates and none issued (DEC-238 §2), behind «غيّر» on the line, in a sheet.
//
// A moderator reads the line and «من يستحق» and no certificate (`certs_read_*` are admin-only, 03 §5.8). A member, or
// a session this org cannot see, gets the streamed not-found (DEC-134).

const ISSUED_SHOWN = 20;

export default async function SessionCertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [t, tc, tk, data, design, eligible, timeZone, faces, estimate, certFaces, headerList] = await Promise.all([
    getTranslations("certificates.session"),
    getTranslations("certificates"),
    getTranslations("certificates.kind"),
    getSessionCertificatesWithRender(locale, id),
    getCertificateDesign(locale, id),
    listEligibleRecipients(locale, id),
    getOrgTimeZone(locale),
    listEditorFaces(locale),
    estimateNextSerial(locale),
    getSessionCertificateFaces(locale, id),
    headers(),
  ]);
  if (!data || !design) notFound();

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const path = `/app/admin/sessions/${id}/certificates`;
  const isAdmin = design.canEdit;
  const completed = data.state === "completed" || data.state === "archived";
  const cancelled = data.state === "cancelled";
  const closed = completed || cancelled;
  const any = data.held.length + data.issued.length + data.revoked.length > 0;
  const bdi = (c: React.ReactNode) => <bdi>{c}</bdi>;

  // The preflight's name: the longest on the list, per kind — the one that breaks is never the sample's.
  const longestName: Partial<Record<SessionCertificateKind, string>> = {};
  for (const r of eligible) {
    const current = longestName[r.kind];
    if (r.name && (!current || r.name.length > current.length)) longestName[r.kind] = r.name;
  }
  const serial = estimate ? `${estimate.prefix}-${estimate.year}-${String(estimate.next).padStart(6, "0")}` : null;

  // The template line: what each kind was issued with, else what issuance would pick (DEC-238 §2.3).
  // ★ The tie guard (the owner, DEC-238): a kind with no template chosen and no default set names NOTHING — issuance would
  // take a template by version with no tiebreak — and says «لا قالب افتراضي», one move from SCR-055's set-default.
  const templateName = (kind: CertificateDesignData["kinds"][number]) =>
    kind.issuedWith?.templateName ?? (kind.noDefault ? null : (kind.options.find((o) => o.id === kind.effectiveTemplateId)?.name ?? null));
  type Line = { kind: CertificateDesignData["kinds"][number]; name: string | null };
  const named: Line[] = design.kinds
    .map((k) => ({ kind: k, name: templateName(k) }))
    .filter((l) => l.name !== null || (l.kind.noDefault && !l.kind.issuedWith));
  const sameTemplate = named.length > 0 && named.every((l) => l.name === named[0].name);
  const noDefaultLink = (
    <Link href="/app/admin/templates/certificates" className="text-fg-heading underline underline-offset-4">
      {t("noDefault")}
    </Link>
  );
  // After completion the template changes only while that kind has held certificates and none issued (DEC-238 §2).
  const changeable = (k: CertificateDesignData["kinds"][number]) => isAdmin && !cancelled && (!completed || (k.heldCount > 0 && !k.locked));
  const editingKind = completed && typeof sp.design === "string" ? (design.kinds.find((k) => k.kind === sp.design && changeable(k)) ?? null) : null;
  const revoking = isAdmin && typeof sp.revoke === "string" ? (data.issued.find((c) => c.id === sp.revoke) ?? null) : null;

  const control = (k: CertificateDesignData["kinds"][number]) => (
    <TemplateControl
      key={k.kind}
      locale={locale}
      sessionId={id}
      kind={k}
      brand={design.brand}
      sample={design.sample}
      longestName={longestName[k.kind] ?? null}
      faces={faces}
      origin={origin}
      offerApplyHeld={completed}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* The board's line: «الوضع تُراجع قبل الإطلاق · القالب: ورقي A4». */}
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-sm">
        <span className="text-fg-muted">{t("lineMode")}</span>
        <b className="text-fg-heading">{t(`modeBadge.${data.mode}`)}</b>
        {data.mode !== "off" && named.length ? (
          <span className="text-fg-muted">
            {"· "}
            {sameTemplate && named[0].name === null
              ? (
                  <>
                    {t("lineTemplatePrefix")} {noDefaultLink}
                  </>
                )
              : sameTemplate
              ? t.rich("lineTemplate", { name: named[0].name ?? "", bdi })
              : (
                  <>
                    {t("lineTemplatePrefix")}{" "}
                    {named.map((k, i) => (
                      <span key={k.kind.kind}>
                        {i > 0 ? " · " : null}
                        {k.name === null ? (
                          <>
                            <bdi>{tk(k.kind.kind)}</bdi> — {noDefaultLink}
                          </>
                        ) : (
                          t.rich("lineTemplateKind", { kind: tk(k.kind.kind), name: k.name, bdi })
                        )}
                      </span>
                    ))}
                  </>
                )}
          </span>
        ) : null}
        {completed
          ? design.kinds.filter(changeable).map((k) => (
              <Link key={k.kind} href={`${path}?design=${k.kind}#cert-design-editor`} className="text-body-sm text-fg-heading underline underline-offset-4">
                {design.kinds.filter(changeable).length > 1 ? `${t("change")} · ${t(`kindTitle.${k.kind}`)}` : t("change")}
              </Link>
            ))
          : null}
      </p>

      {sp.download === "failed" ? (
        <Panel tone="error">
          <p role="alert" className="text-body-sm text-fg-heading">
            {tc("download.failed")}
          </p>
        </Panel>
      ) : null}

      {editingKind ? (
        <EditorSurface id="cert-design-editor" title={`${t("templateLabel")} · ${t(`kindTitle.${editingKind.kind}`)}`} closeHref={path} closeLabel={t("closeEditor")}>
          {control(editingKind)}
        </EditorSurface>
      ) : null}

      {revoking ? (
        <EditorSurface id="cert-revoke" title={t("revokeConfirm")} closeHref={path} closeLabel={t("closeEditor")}>
          <p className="mb-4 text-body-sm text-fg-body">
            <bdi>{revoking.recipientName}</bdi>
            {" · "}
            <bdi dir="ltr">{revoking.serial}</bdi>
          </p>
          <RevokeForm locale={locale} sessionId={id} certificateId={revoking.id} closeHref={path} />
        </EditorSurface>
      ) : null}

      {!closed && isAdmin ? (
        <>
          <section aria-labelledby="cert-design" className="flex flex-col gap-4">
            <h2 id="cert-design" className="text-label text-fg-muted">
              {t("designHeading")}
            </h2>
            <div className="flex flex-col gap-6">{design.kinds.filter(changeable).map(control)}</div>
          </section>
          <section aria-labelledby="cert-mode-heading" className="flex flex-col gap-4 border-t border-edge pt-6">
            <h2 id="cert-mode-heading" className="sr-only">
              {t("lineMode")}
            </h2>
            <CertificateModeControl
              locale={locale}
              sessionId={id}
              mode={data.mode}
              preflight={{
                fontsLoaded: faces.length > 0,
                designs: design.kinds.map((k) => ({ kind: k.kind, saved: k.chosen !== null })),
                eligible: eligible.length,
                serial,
              }}
            />
          </section>
        </>
      ) : null}

      {!closed || !isAdmin ? (
        <section aria-labelledby="cert-who" className="flex flex-col gap-3">
          <h2 id="cert-who" className="text-label text-fg-muted">
            {t.rich("whoHeading", { value: formatNumber(eligible.length), bdi })}
          </h2>
          <EligibleTable rows={eligible} sessionId={id} label={t("eligibleLabel")} />
        </section>
      ) : null}

      {isAdmin && closed ? (
        (data.mode === "off" || cancelled) && !any ? (
          <p className="text-body-sm text-fg-muted">{cancelled ? t("modeControl.closedCancelled") : t("offLine")}</p>
        ) : (
          <>
            <Issuance
              locale={locale}
              sessionId={id}
              sessionTitle={data.sessionTitle}
              timeZone={timeZone}
              showHeld={data.mode === "review" || data.held.length > 0}
              held={data.held}
              issued={data.issued}
              revoked={data.revoked}
              faces={certFaces ?? {}}
              issuedLimit={sp.issued === "all" ? null : ISSUED_SHOWN}
              path={path}
            />
            {eligible.some((r) => r.revokedButPresent) ? (
              <section aria-labelledby="cert-without" className="flex flex-col gap-3">
                <h3 id="cert-without" className="text-label text-fg-muted">
                  {t.rich("withoutHeading", { value: formatNumber(eligible.filter((r) => r.revokedButPresent).length), bdi })}
                </h3>
                <EligibleTable rows={eligible} sessionId={id} label={t("eligibleLabel")} without />
              </section>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
