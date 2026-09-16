"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";

// A CSV download with a pending state and a failure that says so — SCR-061.
//
// A plain `<a href>` to the Route Handler gave neither: nothing showed while a
// large ledger export was being built (`REQ-UIX-007`), and a failure replaced
// the console with the server's bare error page (`16` §7.4). This fetches the
// file, hands it to the browser as a download under the name the handler gives
// it, toasts either way, and refreshes the page so «آخر تصدير» shows the export
// that just happened. The Route Handler, its authorisation and its audit write
// are unchanged.

/** RFC 6266: the UTF-8 `filename*` wins; the ASCII `filename` is the fallback. */
export function filenameFrom(disposition: string | null): string | null {
  if (!disposition) return null;
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (extended) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
      // A malformed escape falls through to the plain name.
    }
  }
  const plain = /filename="([^"]+)"/i.exec(disposition);
  return plain ? plain[1] : null;
}

export function ExportDownloadButton({
  href,
  fallbackName,
  label,
  accessibleName,
  pendingLabel,
  doneLabel,
  failedLabel,
}: {
  href: string;
  fallbackName: string;
  label: string;
  /** Names the file — «نزِّل ملف الحضور بصيغة CSV» — so seven buttons are not seven «نزِّل CSV». */
  accessibleName: string;
  pendingLabel: string;
  doneLabel: string;
  failedLabel: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // The object URL outlives the click — revoking it at once can cancel the
  // download in some browsers — and is released on the next one, or on unmount.
  const objectUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  async function download() {
    setPending(true);
    try {
      const response = await fetch(href, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(`export ${response.status}`);
      const blob = await response.blob();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl.current;
      anchor.download = filenameFrom(response.headers.get("content-disposition")) ?? fallbackName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      toast.show({ title: doneLabel, tone: "success" });
      router.refresh();
    } catch {
      toast.show({ title: failedLabel, tone: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" aria-label={accessibleName} pending={pending} pendingLabel={pendingLabel} iconStart={<DownloadIcon />} onClick={download}>
      {label}
    </Button>
  );
}
