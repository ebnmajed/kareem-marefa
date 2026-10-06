"use client";

import type { ReactNode } from "react";
import { PhotoLightbox, type LightboxPhoto } from "@/components/photos/lightbox";
import { ReportPhotoButton } from "@/components/photos/report-photo-button";
import { TakedownButton } from "@/components/photos/takedown-button";
import { useShowsEditOnly } from "@/components/sessions/edit-mode";

// The event page's album — the lightbox with «احذف الصور التي أظهر فيها» beside the download, for the photograph on
// screen (REQ-EVT-012, DEC-209). A client component so the per-photograph control is a render function the lightbox
// calls, never a closure handed across the server boundary (DEC-159).
// ★ Wave 22 (F1, REQ-EVT-008): «إبلاغ» beside it, for a photograph that is not the viewer's own — `reportable` names
// each such photo and whether the viewer has already reported it; a photo absent from it (the viewer's own) offers none.
export function PhotoAlbum({
  photos,
  locale,
  sessionId,
  reportable = {},
  canDownload = false,
  children,
}: {
  photos: LightboxPhoto[];
  locale: string;
  sessionId: string;
  reportable?: Record<string, "open" | "reported">;
  /** Staff only (DEC-266). */
  canDownload?: boolean;
  children: ReactNode;
}) {
  // ★ Edit mode (the owner's ruling, `sessions/edit-mode.tsx`): staff's «تنزيل الصورة» is behind «تعديل» on the event
  // page; outside a provider it is as before.
  const showsEditOnly = useShowsEditOnly();
  return (
    <PhotoLightbox
      photos={photos}
      canDownload={canDownload && showsEditOnly}
      extra={(photo) => (
        <>
          {reportable[photo.id] ? (
            <ReportPhotoButton key={`report-${photo.id}`} locale={locale} sessionId={sessionId} photoId={photo.id} reported={reportable[photo.id] === "reported"} />
          ) : null}
          <TakedownButton key={photo.id} locale={locale} sessionId={sessionId} photoId={photo.id} mode="request" />
        </>
      )}
    >
      {children}
    </PhotoLightbox>
  );
}
