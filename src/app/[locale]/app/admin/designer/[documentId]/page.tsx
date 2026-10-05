import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { PresetName } from "@kareem/designer-runtime";
import { exportFingerprint, getDesignerDocument, getExportQueue, getLongestSamples, listPreviewMembers, listPreviewSessions, signExportUrl, type DesignerDocumentData } from "@/lib/dal/designer";
import { listEditorFaces } from "@/lib/dal/fonts";
import { requireSession } from "@/lib/dal/session";
import { assetSizesFor, downloadHref, listDesignAssets } from "@/lib/dal/posters";
import { DesignerEditor } from "@/components/designer/editor";
import { ExportActionButton } from "@/components/designer/export-action-button";
import { ExportPanel } from "@/components/designer/export-panel";
import { CustomiseButton } from "@/components/posters/picker-controls";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ChevronIcon, LockIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { publishVersion } from "@/app/[locale]/app/admin/templates/actions";
import { openSiblingTemplate, queueExports } from "./actions";

// SCR-056/057 · /app/admin/designer/[documentId] — the studio, rebuilt from `AdminDesigner.dc.html` (wave 23,
// REQ-UIX-107, REQ-UIX-110, DEC-208, DEC-237, DEC-238). REQ-DSG-005, REQ-DSG-006, REQ-DSG-010 … REQ-DSG-013,
// REQ-DSG-022, REQ-DSG-028, REQ-DSG-029, DEC-093, DEC-096, DEC-148.
//
// The page fetches; the editor is the client half. The route renders bare (the studio frame), so the page hands the
// editor its bar's start — the way back, the document's name as the page's `h1`, its badges — and the «صدّر» sheet.
// Authority is not checked here: `documents_read` (03 §5.9b) decides whether a row comes back at all, and
// `getDesignerDocument()` returns null when it does not (DEC-134) — a presenter sees their own session's poster
// read-only, a member of another org the not-found page, both from the same policy.
//
// ★ THE EXPORT IS KEYED BY THE SAVED DOCUMENT'S OWN BINDINGS (REQ-DSG-013). «معاينة بجلسة» paints a real session
// over the canvas and the checks; it never reaches the fingerprint, the queue or a render.

function backOf(context: DesignerDocumentData["context"]): { href: string; key: string } {
  switch (context.kind) {
    case "session_poster":
      return { href: `/app/admin/sessions/${context.sessionId}/schedule`, key: "sessionPoster" };
    case "template_draft":
      return context.purpose === "poster"
        ? { href: "/app/admin/templates/posters", key: "templatesPoster" }
        : { href: "/app/admin/templates/certificates", key: "templatesCertificate" };
    case "certificate":
      // An achievement certificate has no session; its release lives on the recognition screen (SCR-054, DEC-050).
      return context.sessionId
        ? { href: `/app/admin/sessions/${context.sessionId}/certificates`, key: "certificates" }
        : { href: "/app/admin/recognition", key: "recognition" };
    default:
      return context.purpose === "poster"
        ? { href: "/app/admin/templates/posters", key: "templatesPoster" }
        : { href: "/app/admin/templates/certificates", key: "templatesCertificate" };
  }
}

export default async function DesignerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; documentId: string }>;
  searchParams: Promise<{ scheme?: string; download?: string | string[]; session?: string; member?: string }>;
}) {
  const { locale, documentId } = await params;
  setRequestLocale(locale);
  const { scheme: requestedScheme, download, session: previewSessionId, member: previewMemberId } = await searchParams;

  // The QR target and the font URLs must be ABSOLUTE: a phone camera needs a URL (REQ-DSG-023), and a `srcdoc`
  // iframe resolves a relative one against whatever the browser decides its base is.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const [t, te, ts, data, faces, session] = await Promise.all([
    getTranslations("designer.editor"),
    getTranslations("designer.exports"),
    getTranslations("designer.studio"),
    getDesignerDocument(locale, documentId, origin, { scheme: requestedScheme ?? null, previewSessionId: previewSessionId ?? null, previewMemberId: previewMemberId ?? null }),
    listEditorFaces(locale),
    // The DAL already read it (`getSessionState` is memoised per render): the local draft is this member's (DEC-259 §2.2).
    requireSession(locale),
  ]);
  if (!data) notFound();

  // The queue is keyed by the SAVED document's fingerprint and its OWN bindings: you export what is saved, and
  // re-opening the page renders nothing (REQ-DSG-013).
  const fingerprint = exportFingerprint({
    document: data.document,
    templateVersionId: data.templateVersionId,
    bindings: data.bindings,
    fontHashes: faces.map((f) => f.sha256),
  });
  const { context } = data;
  // «معاينة بجلسة» on a poster not bound to its own session; «معاينة بعضو» (and, for a session kind, a session) on a
  // certificate that is not a certificate row (C5).
  const certificateTemplate = data.purpose === "certificate" && !data.boundCertificateId;
  const previewable = (data.purpose === "poster" && !data.boundSessionId) || (certificateTemplate && data.family !== "achievement");
  const [queue, assetSizes, uploads, previewSessions, previewMembers, samples] = await Promise.all([
    getExportQueue(locale, documentId, fingerprint),
    assetSizesFor(locale, data.document),
    data.canEdit ? listDesignAssets(locale) : Promise.resolve([]),
    previewable ? listPreviewSessions(locale) : Promise.resolve(null),
    certificateTemplate && data.canEdit ? listPreviewMembers(locale) : Promise.resolve(null),
    data.canEdit ? getLongestSamples(locale) : Promise.resolve({}),
  ]);

  // ★ A DOWNLOAD IS AUDITED, A PREVIEW IS NOT (DEC-178). The queue's links go through the one audited route; the
  // PNG thumbnails are previews, signed once, 5 minutes, through `exports_storage_read` (03 §6).
  const ready = queue.artifacts.filter((a) => a.status === "ready" && a.storagePath);
  const links: Record<string, string> = Object.fromEntries(ready.map((a) => [a.id, downloadHref(a.id)]));
  const thumbnails = ready.filter((a) => a.format === "png");
  const signed = await Promise.all(thumbnails.map(async (a) => [a, await signExportUrl(locale, a.storagePath as string)] as const));
  const variantPreviews: Partial<Record<PresetName, string>> = {};
  for (const [artifact, url] of signed) if (url) variantPreviews[artifact.preset as PresetName] = url;

  const back = backOf(context);
  // ★ A LIVE poster is the template's, rebuilt on every change: the studio opens read-only with the one way forward —
  // the same confirmed detach as the picker's «خصّص» (REQ-DSG-003, REQ-UIX-013).
  const liveGate = context.kind === "session_poster" && context.binding === "live" && data.canEdit;
  const title = context.kind === "unbound" ? t(`untitled.${context.purpose}`) : context.title;

  const barStart = (
    <>
      <nav aria-label={t("breadcrumbLabel")} className="shrink-0">
        <Link href={back.href} className={buttonClass("secondary", "sm")}>
          <ChevronIcon direction="back" />
          <span>{t(`back.${back.key}`)}</span>
        </Link>
      </nav>
      {/* One line in its slot, the full name in its title: clipped on the INLINE axis only (`overflow-x-clip`), so a
          mark above or below the line is never cut (no `overflow: hidden` on a text line). */}
      <h1 title={title} className="min-w-[8rem] max-w-[16rem] shrink overflow-x-clip text-ellipsis whitespace-nowrap py-1 text-label leading-loose text-fg-heading">
        <bdi>{title}</bdi>
      </h1>
      {context.kind === "session_poster" && context.binding ? (
        <Badge tone={context.binding === "live" ? "success" : "neutral"} outline={context.binding === "detached"}>
          {t(`badge.${context.binding}`)}
        </Badge>
      ) : null}
      {context.kind === "template_draft" ? <Badge outline>{t("badge.templateDraft")}</Badge> : null}
      {context.kind === "certificate" ? (
        <>
          <Badge tone="info">{t("badge.certificate")}</Badge>
          <bdi dir="ltr" className="text-body-sm text-fg-muted">
            {context.serial}
          </bdi>
        </>
      ) : null}
      {!data.canEdit ? (
        <Badge outline icon={<LockIcon />}>
          {t("badge.readOnly")}
        </Badge>
      ) : null}
    </>
  );

  // A certificate TEMPLATE carries no scheme (a scheme is never a row, DEC-148), so its preview offers both. A poster
  // is always dark and a certificate row renders what it pinned — neither offers a choice.
  // ★ ONE PAGE PER CERTIFICATE (DEC-148, DEC-238 §3): the strip shows this composition's one preset, and its other
  // orientation — a separate template in the org's library — is a link that opens that template's draft.
  const sibling = context.kind === "template_draft" && data.sibling ? (
    // ★ It leaves for another document through a Server Action — not a link — so it says so, and the editor's leave
    // guard asks before it submits with unsaved changes (DEC-259 §1.3). The attribute is `leave-guard.ts`'s
    // `LEAVES_ATTRIBUTE`, spelled here: a constant imported from a client module is a reference on the server.
    <form action={openSiblingTemplate.bind(null, locale, data.sibling.templateId)} className="shrink-0" data-designer-leaves="">
      <button type="submit" className={buttonClass("secondary", "sm")}>
        {ts(`siblingOrientation.${data.sibling.orientation}`)}
      </button>
    </form>
  ) : null;
  const barEnd =
    data.purpose === "certificate" && context.kind !== "certificate" ? (
      <nav aria-label={t("scheme.legend")} className="flex shrink-0 items-center gap-1">
        {(["light", "dark"] as const).map((value) => (
          <Link
            key={value}
            href={`/app/admin/designer/${documentId}?scheme=${value}`}
            aria-current={data.scheme === value ? "true" : undefined}
            className={buttonClass(data.scheme === value ? "primary" : "secondary", "sm")}
          >
            {t(`scheme.${value}`)}
          </Link>
        ))}
        {sibling}
      </nav>
    ) : null;

  const exportContent = (
    <div className="flex flex-col gap-6">
      {data.canEdit ? (
        <ExportActionButton
          id="dr-export-request"
          action={queueExports.bind(null, locale, documentId, data.purpose === "certificate" ? data.scheme : null)}
          label={te("approve")}
          pendingLabel={te("approvePending")}
        />
      ) : null}
      <section aria-labelledby="dr-exports" className="flex flex-col gap-4">
        <SectionHeader as="h2" id="dr-exports" title={te("heading")} count={queue.artifacts.length} />
        <ExportPanel documentId={documentId} queue={queue} canExport={data.canEdit} locale={locale} links={links} />
      </section>
      {Object.keys(variantPreviews).length ? (
        // The worker's own renders (DEC-017) — what the strip showed before wave 23.
        <ul className="grid grid-cols-3 gap-2">
          {Object.entries(variantPreviews).map(([preset, url]) => (
            <li key={preset}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived export URL */}
              <img src={url} alt="" className="w-full border border-edge rounded-field" loading="lazy" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  const notice = (
    <>
      {download === "failed" ? (
        // The audited download route sends a refusal or a failure back here (DEC-178).
        <Panel tone="error" className="m-4">
          <p role="alert" className="text-body-sm text-fg-heading">
            {te("downloadFailed")}
          </p>
        </Panel>
      ) : null}
      {liveGate ? (
        <Panel tone="info" className="m-4 flex flex-col gap-3">
          <p className="text-label text-fg-heading">{t("liveGate.title")}</p>
          <p className="text-body-sm text-fg-body">{t("liveGate.body")}</p>
          <div>
            <CustomiseButton sessionId={context.sessionId} sessionTitle={context.title} variant="secondary" />
          </div>
        </Panel>
      ) : null}
    </>
  );

  return (
    <DesignerEditor
      documentId={data.id}
      purpose={data.purpose}
      initialDocument={data.document}
      initialUpdatedAt={data.updatedAt}
      bindings={{ ...data.bindings, ...data.previewBindings }}
      assets={data.assets}
      declaredBindings={data.declaredBindings}
      faces={faces}
      lockedLayerIds={data.lockedLayerIds}
      canEdit={data.canEdit && !liveGate}
      origin={origin}
      assetSizes={assetSizes}
      variantPreviews={variantPreviews}
      barStart={barStart}
      barEnd={barEnd}
      exportContent={exportContent}
      notice={notice}
      publishedDocument={data.publishedDocument}
      {...(context.kind === "template_draft" && data.canEdit ? { publish: publishVersion.bind(null, locale, context.purpose, context.templateId) } : {})}
      family={data.family}
      {...(previewSessions ? { previewSessions, previewSessionId: previewSessionId ?? null } : {})}
      {...(previewMembers ? { previewMembers, previewMemberId: previewMemberId ?? null } : {})}
      samples={samples}
      uploads={uploads}
      draftOwner={session.memberId}
    />
  );
}
