"use client";

import type { ReactNode } from "react";
import { PhotoLightbox, type LightboxPhoto } from "@/components/photos/lightbox";
import { TakedownButton } from "@/components/photos/takedown-button";

// The event page's album — the lightbox with «احذف الصور التي أظهر فيها» beside the download, for the photograph on
// screen (REQ-EVT-012, DEC-209). A client component so the per-photograph control is a render function the lightbox
// calls, never a closure handed across the server boundary (DEC-159).
export function PhotoAlbum({ photos, locale, sessionId, children }: { photos: LightboxPhoto[]; locale: string; sessionId: string; children: ReactNode }) {
  return (
    <PhotoLightbox photos={photos} extra={(photo) => <TakedownButton key={photo.id} locale={locale} sessionId={sessionId} photoId={photo.id} mode="request" />}>
      {children}
    </PhotoLightbox>
  );
}
