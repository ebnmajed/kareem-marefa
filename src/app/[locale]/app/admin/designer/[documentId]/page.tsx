import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDesignerDocument } from "@/lib/dal/designer";
import { listEditorFaces } from "@/lib/dal/fonts";
import { DesignerEditor } from "@/components/designer/editor";

// SCR-057 · /app/admin/designer/[documentId] — the shared designer.
// REQ-DSG-005, REQ-DSG-006, REQ-DSG-010, REQ-DSG-022, 06 §10.
//
// The page fetches; the editor is the client half. Authority is not checked
// here: `documents_read` (03 §5.9b) decides whether a row comes back at all,
// and `getDesignerDocument()` returns null when it does not — so a presenter
// looking at their own session's poster gets the read-only view and a member
// from another org gets a 404, both from the same policy rather than from two
// pieces of page logic that could disagree.

export default async function DesignerPage({ params }: { params: Promise<{ locale: string; documentId: string }> }) {
  const { locale, documentId } = await params;
  setRequestLocale(locale);

  // The QR target and the font URLs must be ABSOLUTE: a phone camera needs a
  // URL (REQ-DSG-023), and a `srcdoc` iframe resolves a relative one against
  // whatever the browser decides its base is.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const [t, data, faces] = await Promise.all([getTranslations("designer.editor"), getDesignerDocument(locale, documentId, origin), listEditorFaces(locale)]);
  if (!data) notFound();

  const boundLabel = data.boundSessionId ? t("boundSession") : data.boundCertificateId ? t("boundCertificate") : t("unbound");

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-2 text-body text-fg-muted">{boundLabel}</p>

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
        />
      </div>
    </>
  );
}
