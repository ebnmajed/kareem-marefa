import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { PresetName } from "@kareem/designer-runtime";
import { exportFingerprint, getDesignerDocument, getExportQueue, signExportUrl, type DesignerDocumentData } from "@/lib/dal/designer";
import { listEditorFaces } from "@/lib/dal/fonts";
import { assetSizesFor } from "@/lib/dal/posters";
import { DesignerEditor } from "@/components/designer/editor";
import { ExportActionButton } from "@/components/designer/export-action-button";
import { ExportPanel } from "@/components/designer/export-panel";
import { CustomiseButton } from "@/components/posters/picker-controls";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { LockIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { queueExports } from "./actions";

// SCR-057 · /app/admin/designer/[documentId] — the shared designer, on the M9
// system. REQ-DSG-005, REQ-DSG-006, REQ-DSG-010, REQ-DSG-012, REQ-DSG-022,
// REQ-DSG-028, REQ-DSG-029, DEC-093, DEC-096, DEC-148.
//
// The page fetches; the editor is the client half. Authority is not checked
// here: `documents_read` (03 §5.9b) decides whether a row comes back at all,
// and `getDesignerDocument()` returns null when it does not — so a presenter
// looking at their own session's poster gets the read-only view and a member
// from another org gets the not-found page (DEC-134), both from the same
// policy rather than from two pieces of page logic that could disagree.
//
// ★ «اطلب التصدير» is the header's action on every screen size, and on a
// phone it is the «approve» of view-and-approve (09, DEC-148 q1): the preview
// an admin approves IS the worker-rendered artifact (DEC-017), so approving is
// asking for it. There is no «send back» — nothing in the model receives one.

function backOf(context: DesignerDocumentData["context"]): { href: string; key: string } {
  switch (context.kind) {
    case "session_poster":
      return { href: `/app/admin/sessions/${context.sessionId}/schedule`, key: "sessionPoster" };
    case "template_draft":
      return context.purpose === "poster"
        ? { href: "/app/admin/templates/posters", key: "templatesPoster" }
        : { href: "/app/admin/templates/certificates", key: "templatesCertificate" };
    case "certificate":
      // An achievement certificate has no session; its release lives on the
      // recognition screen (SCR-054, DEC-050).
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
  searchParams: Promise<{ scheme?: string }>;
}) {
  const { locale, documentId } = await params;
  setRequestLocale(locale);
  const { scheme: requestedScheme } = await searchParams;

  // The QR target and the font URLs must be ABSOLUTE: a phone camera needs a
  // URL (REQ-DSG-023), and a `srcdoc` iframe resolves a relative one against
  // whatever the browser decides its base is.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const [t, te, data, faces] = await Promise.all([
    getTranslations("designer.editor"),
    getTranslations("designer.exports"),
    getDesignerDocument(locale, documentId, origin, { scheme: requestedScheme ?? null }),
    listEditorFaces(locale),
  ]);
  if (!data) notFound();

  // The queue is keyed by the SAVED document's fingerprint: you export what
  // is saved, and re-opening the page renders nothing (REQ-DSG-013).
  const fingerprint = exportFingerprint({
    document: data.document,
    templateVersionId: data.templateVersionId,
    bindings: data.bindings,
    fontHashes: faces.map((f) => f.sha256),
  });
  const [queue, assetSizes] = await Promise.all([getExportQueue(locale, documentId, fingerprint), assetSizesFor(locale, data.document)]);

  // Signed once, 5 minutes, through `exports_storage_read` (03 §6): the list
  // downloads them and the variant strip shows the PNGs as thumbnails.
  const ready = queue.artifacts.filter((a) => a.status === "ready" && a.storagePath);
  const signed = await Promise.all(ready.map(async (a) => [a, await signExportUrl(locale, a.storagePath as string)] as const));
  const links: Record<string, string> = {};
  const variantPreviews: Partial<Record<PresetName, string>> = {};
  for (const [artifact, url] of signed) {
    if (!url) continue;
    links[artifact.id] = url;
    if (artifact.format === "png") variantPreviews[artifact.preset as PresetName] = url;
  }

  const { context } = data;
  const back = backOf(context);
  // ★ A LIVE poster is the template's, rebuilt on every change: an edit here
  // would be regenerated away (and the save is refused, REQ-DSG-003). The
  // studio opens read-only with the one way forward — the same confirmed
  // detach as the picker's «خصّص» (REQ-UIX-013).
  const liveGate = context.kind === "session_poster" && context.binding === "live" && data.canEdit;
  const title = context.kind === "unbound" ? t(`untitled.${context.purpose}`) : context.title;

  const status = (
    <>
      {context.kind === "session_poster" && context.binding ? (
        <Badge tone={context.binding === "live" ? "success" : "neutral"} outline={context.binding === "detached"}>
          {t(`badge.${context.binding}`)}
        </Badge>
      ) : null}
      {context.kind === "template_draft" ? <Badge outline>{t("badge.templateDraft")}</Badge> : null}
      {context.kind === "certificate" ? <Badge tone="info">{t("badge.certificate")}</Badge> : null}
      {!data.canEdit ? (
        <Badge outline icon={<LockIcon />}>
          {t("badge.readOnly")}
        </Badge>
      ) : null}
    </>
  );

  // A certificate TEMPLATE carries no scheme (a scheme is never a row,
  // DEC-148), so its preview offers both. A poster is always dark and a
  // certificate row renders what it pinned — neither offers a choice.
  const schemeChoice =
    data.purpose === "certificate" && context.kind !== "certificate" ? (
      <nav aria-label={t("scheme.legend")} className="flex items-center gap-1">
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
      </nav>
    ) : null;

  return (
    <>
      <PageHeader
        title={title}
        eyebrow={t(`eyebrow.${data.purpose}`)}
        breadcrumb={[{ href: back.href, label: t(`back.${back.key}`) }]}
        breadcrumbLabel={t("breadcrumbLabel")}
        status={status}
        meta={context.kind === "certificate" ? <bdi dir="ltr" className="text-body-sm text-fg-muted">{context.serial}</bdi> : null}
        actions={
          <>
            {schemeChoice}
            {data.canEdit ? (
              <ExportActionButton
                id="dr-export-request"
                action={queueExports.bind(null, locale, documentId, data.purpose === "certificate" ? data.scheme : null)}
                label={te("approve")}
                pendingLabel={te("approvePending")}
              />
            ) : null}
          </>
        }
      />

      {liveGate ? (
        <Panel tone="info" className="mt-8 flex flex-col gap-3">
          <p className="text-label text-fg-heading">{t("liveGate.title")}</p>
          <p className="text-body-sm text-fg-body">{t("liveGate.body")}</p>
          <div>
            {/* Secondary: «اطلب التصدير» is the header's one primary action. */}
            <CustomiseButton sessionId={context.sessionId} sessionTitle={context.title} variant="secondary" />
          </div>
        </Panel>
      ) : null}

      <div className="mt-8">
        <DesignerEditor
          documentId={data.id}
          purpose={data.purpose}
          initialDocument={data.document}
          initialUpdatedAt={data.updatedAt}
          bindings={data.bindings}
          declaredBindings={data.declaredBindings}
          faces={faces}
          lockedLayerIds={data.lockedLayerIds}
          canEdit={data.canEdit && !liveGate}
          origin={origin}
          assetSizes={assetSizes}
          variantPreviews={variantPreviews}
        />
      </div>

      <section aria-labelledby="dr-exports" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="dr-exports" title={te("heading")} count={queue.artifacts.length} />
        <div className="mt-4">
          <ExportPanel documentId={documentId} queue={queue} canExport={data.canEdit} locale={locale} links={links} />
        </div>
      </section>
    </>
  );
}
