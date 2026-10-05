import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getViewerData } from "@/lib/dal/materials";
import { getSessionHeading } from "@/lib/dal/sessions";
import { ViewerScreen } from "@/components/viewer/viewer-screen";

// SCR-013, the viewer — written from `Viewer.dc.html` and `ViewerDesktop.dc.html` (wave 19, REQ-UIX-065,
// DEC-213, DEC-214). The kept-behaviour table is `docs/plan/notes/content.md`, «Wave 19 — plan», §2.
//
// The two reads run together. `getViewerData()` returns null for a bad id, an absent material and one the phase
// gate hides — deliberately indistinguishable (03 §5.5a, REQ-MAT-006) — and `getSessionHeading()` null for a
// session the viewer cannot see. ★ A material of ANOTHER session is not found either (DEC-214 §1): the URL's
// session is the one whose way back the close control offers.
//
// This page hands the client chrome DATA only. The viewer's labels hold formatter functions and are built there
// (DEC-159, DEC-214 §3).
export default async function MaterialViewerPage({ params }: { params: Promise<{ locale: string; id: string; materialId: string }> }) {
  const { locale, id, materialId } = await params;
  const [data, heading, tList] = await Promise.all([getViewerData(locale, materialId), getSessionHeading(locale, id), getTranslations("materials.list")]);
  if (!data || !heading || data.sessionId !== id) notFound();

  // Storage signs the source for these, whatever `allow_download` says (`0116:114-120`) — so they get the control.
  // ★ A member never does (DEC-266, the owner's ruling): the viewer is theirs, the original file is not.
  const isStaff = !!data.viewerIsStaff;
  const isPresenter = !!data.viewerIsPresenter;
  const canDownload = isPresenter || isStaff;

  return (
    <ViewerScreen
      locale={locale}
      sessionId={id}
      materialId={materialId}
      title={data.title}
      kindLabel={tList(`kind.${data.kind}`)}
      presenters={heading.presenters.map((p) => ({ displayName: p.displayName, companyName: p.companyName }))}
      pages={data.pages}
      renderStatus={data.renderStatus}
      canDownload={canDownload}
      isAdmin={!!data.viewerIsAdmin}
      canReplace={isPresenter || !!data.viewerIsAdmin}
      substitutionFamily={isPresenter || isStaff ? data.fontSubstitutionWarning : null}
    />
  );
}
