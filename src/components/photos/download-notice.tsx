"use client";

import { useSearchParams } from "next/navigation";

// A refused or failed photo download comes back to the page it left with
// `?download=photo_failed` or `album_failed` (DEC-182, Q4) — never a raw body in
// a blank tab. Said in the photos slot, beside the control that was pressed, as
// a state of the URL: a reload keeps saying it, a navigation clears it. Not
// `failed`, which is the poster's notice's (`sessions/download-failed-notice.tsx`).
export function PhotoDownloadNotice({ photoFailed, albumFailed }: { photoFailed: string; albumFailed: string }) {
  // `null` outside a mounted app router (a component test's jsdom): nothing to say there.
  const params = useSearchParams() as URLSearchParams | null;
  const value = params?.get("download");
  if (value !== "photo_failed" && value !== "album_failed") return null;
  return (
    <p role="alert" className="text-body-sm text-error">
      {value === "photo_failed" ? photoFailed : albumFailed}
    </p>
  );
}
