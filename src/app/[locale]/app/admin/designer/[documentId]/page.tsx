import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { exportFingerprint, getDesignerDocument, getExportQueue } from "@/lib/dal/designer";
import { listEditorFaces } from "@/lib/dal/fonts";
import { DesignerEditor } from "@/components/designer/editor";
import { ExportPanel } from "@/components/designer/export-panel";
import { assetSizesFor } from "@/lib/dal/posters";

// SCR-057 · /app/admin/designer/[documentId] — the shared designer.
// REQ-DSG-005, REQ-DSG-006, REQ-DSG-010, REQ-DSG-022, 06 §10.
//
// The page fetches; the editor is the client half. Authority is not checked
// here: `documents_read` (03 §5.9b) decides whether a row comes back at all,
// and `getDesignerDocument()` returns null when it does not — so a presenter
// looking at their own session's poster gets the read-only view and a member
// from another org gets a 404, both from the same policy rather than from two
// pieces of page logic that could disagree.

export default async function DesignerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; documentId: string }>;
  searchParams: Promise<{ export?: string }>;
}) {
  const { locale, documentId } = await params;
  setRequestLocale(locale);
  const { export: exportResult } = await searchParams;

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
    getDesignerDocument(locale, documentId, origin),
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

  const boundLabel = data.boundSessionId ? t("boundSession") : data.boundCertificateId ? t("boundCertificate") : t("unbound");

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-2 text-body text-fg-muted">{boundLabel}</p>

      {exportResult ? (
        <p
          role={exportResult === "not_authorized" ? "alert" : "status"}
          className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading"
        >
          {exportResult === "queued" ? te("queuedNotice") : exportResult === "retried" ? te("retriedNotice") : te("notAuthorized")}
        </p>
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
          canEdit={data.canEdit}
          numerals={data.numerals}
          origin={origin}
          assetSizes={assetSizes}
        />
      </div>

      <section aria-labelledby="dr-exports" className="mt-12">
        <h2 id="dr-exports" className="text-h2 text-fg-heading">
          {te("heading")}
        </h2>
        <div className="mt-4">
          <ExportPanel documentId={documentId} queue={queue} canExport={data.canEdit} locale={locale} />
        </div>
      </section>
    </>
  );
}
