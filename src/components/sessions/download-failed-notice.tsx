"use client";

import { useSearchParams } from "next/navigation";

// A refused or failed download comes back to the page it left with
// `?download=failed` (DEC-178, `sessions`' R4 on `designer`'s route) — never a
// raw body in a blank tab. Said beside the control that was pressed, as a
// state of the URL: a reload keeps saying it, a navigation clears it.
export function DownloadFailedNotice({ message }: { message: string }) {
  const params = useSearchParams();
  if (params.get("download") !== "failed") return null;
  return (
    <p role="alert" className="text-body-sm text-error">
      {message}
    </p>
  );
}
