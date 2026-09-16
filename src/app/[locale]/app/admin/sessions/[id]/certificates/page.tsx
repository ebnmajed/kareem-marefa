import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  estimateNextSerial,
  getCertificateDesign,
  getOrgTimeZone,
  getSessionCertificatesWithRender,
  listEligibleRecipients,
  type SessionCertificateKind,
} from "@/lib/dal/certificates";
import { listEditorFaces } from "@/lib/dal/fonts";
import { CertificateDesign } from "@/components/certificates/design-panel";
import { EligibleList } from "@/components/certificates/eligible-list";
import { CertificateIssuance } from "@/components/certificates/issuance";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { storedPhase, type SessionState } from "@/lib/session-status";

// SCR-045 · `/app/admin/sessions/[id]/certificates` — REQ-CRT-001,
// REQ-CRT-004, REQ-CRT-011, REQ-DSG-031, D50, DEC-128, DEC-148.
//
// ★ THREE SECTIONS FOR THE THREE MEANINGS OF «شهادة» (REQ-DSG-031): the
// DESIGN (which composition, which colours — chosen before completion), WHO
// receives one (exactly the fan-out's two groups, and the mode that decides
// whether it happens at all), and the ISSUANCE (held, issued, revoked, with
// each file's render). The mode is SHOWN here and CHANGED on the schedule
// (SCR-043, the lead's): one control for one setting, and this page links to
// it rather than growing a second.
//
// ★ THE MODE IS THE FIRST THING UNDER THE TITLE, and not decoration. In
// `automatic` there is nothing to release and the held table never appears;
// in `off` nothing will ever be issued. An empty screen that is correct and
// one that looks broken differ only by that sentence.
//
// Staff reach it; the certificates themselves are an admin's. A moderator
// reads the design and the list (`design_templates`, `check_ins`) and no
// certificate at all — `certs_read_*` are admin-only (03 §5.8) — so the
// issuance section says so rather than showing three empty tables that
// would read as «none were issued».
//
// ★ THE ORDER FOLLOWS THE JOB. Before completion the job is the design, so it
// comes first; once any certificate exists (or the session has completed) the
// job is releasing and revoking, so «الإصدار» comes first and each kind's
// design folds to one line — what it was issued with — behind «غيّر التصميم».
// An admin arriving to release three held certificates used to scroll four
// phone screens of template radios to reach them (the lead's capture review).
//
// ★ THE SERIAL LINE IS AN ESTIMATE, never a reservation (DEC-148, DEC-010):
// «الرقم التالي المتوقع … والعدد», shown only before completion, when it
// helps an admin who prints a register; the number is allocated at issue.

export default async function SessionCertificatesPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [t, ui, data, design, eligible, timeZone, faces, estimate, headerList] = await Promise.all([
    getTranslations("certificates.session"),
    getTranslations("ui"),
    getSessionCertificatesWithRender(locale, id),
    getCertificateDesign(locale, id),
    listEligibleRecipients(locale, id),
    getOrgTimeZone(locale),
    listEditorFaces(locale),
    estimateNextSerial(locale),
    headers(),
  ]);
  // `getCertificateDesign` is null for a plain member and for a session this
  // org cannot see: a 404, not a message (every admin screen's pattern).
  if (!data || !design) notFound();

  // Absolute, so a `srcdoc` frame resolves the font URLs the same way in
  // every browser rather than depending on how it inherits a base URL.
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const isAdmin = design.canEdit;
  const completed = data.state === "completed" || data.state === "archived";

  // The preflight's name: the longest on the list, per kind — the one that
  // breaks is never the sample's.
  const longestName: Partial<Record<SessionCertificateKind, string>> = {};
  for (const r of eligible) {
    const current = longestName[r.kind];
    if (r.name && (!current || r.name.length > current.length)) longestName[r.kind] = r.name;
  }

  // Any certificate at all, or a completed session: the job is issuance now.
  const afterIssue = completed || data.held.length + data.issued.length + data.revoked.length > 0;
  const showEstimate = isAdmin && estimate !== null && !completed && data.mode !== "off" && eligible.length > 0;
  const serial = estimate ? `${estimate.prefix}-${estimate.year}-${String(estimate.next).padStart(6, "0")}` : "";

  const designSection = (
    <section aria-labelledby="cert-design" className="flex flex-col gap-6">
      <SectionHeader id="cert-design" title={t("sections.design")} description={t(afterIssue ? "designIntroAfter" : "designIntro")} />
      <CertificateDesign locale={locale} sessionId={id} data={design} longestName={longestName} faces={faces} origin={origin} collapsed={afterIssue} />
    </section>
  );
  const whoSection = (
    <section aria-labelledby="cert-who" className="flex flex-col gap-4">
      <SectionHeader id="cert-who" title={t("sections.who")} description={t("whoIntro")} count={eligible.length} />
      {showEstimate ? (
        <Panel>
          <p className="text-body-sm text-fg-heading">
            {t.rich("serialEstimate", {
              serial,
              count: eligible.length,
              value: formatNumber(eligible.length),
              bdi: (c) => (
                <bdi dir="ltr" className="break-all">
                  {c}
                </bdi>
              ),
            })}
          </p>
          <p className="mt-1 text-caption text-fg-muted">{t("serialEstimateHint")}</p>
        </Panel>
      ) : null}
      <EligibleList rows={eligible} sessionId={id} />
    </section>
  );
  const issueSection = (
    <section aria-labelledby="cert-issue" className="flex flex-col gap-6">
      <SectionHeader id="cert-issue" title={t("sections.issue")} />
      {!completed && data.mode !== "off" ? <p className="text-body-sm text-fg-muted">{t("notCompleted")}</p> : null}
      {!isAdmin ? (
        <p className="text-body-sm text-fg-muted">{t("notAuthorized")}</p>
      ) : data.mode === "off" && data.held.length + data.issued.length + data.revoked.length === 0 ? (
        // Off, and never on: two empty tables would say «none yet», and the
        // truth is «none, ever» — the sentence under the title already says so.
        <p className="text-body-sm text-fg-muted">{t("modeExplain.off")}</p>
      ) : (
        <CertificateIssuance
          locale={locale}
          sessionId={id}
          sessionTitle={data.sessionTitle}
          timeZone={timeZone}
          mode={data.mode}
          held={data.held}
          issued={data.issued}
          revoked={data.revoked}
        />
      )}
    </section>
  );
  const ordered: Array<[string, React.ReactNode]> = afterIssue
    ? [
        ["issue", issueSection],
        ["who", whoSection],
        ["design", designSection],
      ]
    : [
        ["design", designSection],
        ["who", whoSection],
        ["issue", issueSection],
      ];

  return (
    <div className="space-y-12">
      <PageHeader
        title={t("title")}
        breadcrumb={[{ href: "/app/admin/sessions", label: t("breadcrumb") }]}
        breadcrumbLabel={ui("pageHeader.breadcrumb")}
        status={<SessionStatusBadge phase={storedPhase(data.state as SessionState)} />}
        meta={
          <div className="flex flex-col gap-3">
            <p className="text-body text-fg-body">{t.rich("sessionLine", { title: data.sessionTitle, bdi: (c) => <bdi>{c}</bdi> })}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-label text-fg-muted">{t("modeLabel")}</span>
              <Badge size="sm" tone={data.mode === "off" ? "ended" : data.mode === "review" ? "info" : "success"} outline={data.mode === "off"}>
                {t(`modeBadge.${data.mode}`)}
              </Badge>
              {isAdmin ? (
                <Link href={`/app/admin/sessions/${id}/schedule`} className="text-body-sm text-fg-heading underline underline-offset-4">
                  {t("modeLink")}
                </Link>
              ) : null}
            </div>
            <p className="max-w-prose text-body-sm text-fg-muted">{t(`modeExplain.${data.mode}`)}</p>
          </div>
        }
      />

      {!isAdmin ? (
        <Panel tone="info">
          <p role="status" className="text-body-sm text-fg-body">
            {t("moderatorNote")}
          </p>
        </Panel>
      ) : null}

      {ordered.map(([name, section], index) => (
        <div key={name} className={index > 0 ? "border-t border-edge pt-10" : undefined}>
          {section}
        </div>
      ))}
    </div>
  );
}
