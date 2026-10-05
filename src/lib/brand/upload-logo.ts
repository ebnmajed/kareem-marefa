import type { PpiAtA3 } from "./ppi";

// The logo's upload round trip — SCR-059, REQ-DSG-018, REQ-DSG-019, REQ-DSG-021, DEC-009.
//
// MOVED verbatim out of `components/branding/logo-uploader.tsx` before that file is rebuilt (DEC-208; DEC-237 §2's
// precedent: logic living in a chrome file is moved before the delete). Three round trips — initiate at
// `/api/admin/branding/logo`, the browser PUTs the bytes straight to Storage, complete at `…/logo/complete`, which
// sniffs the CONTENT after the bytes land and measures the A3 PPI. Never a Server Action: the bytes never cross
// this process and never approach the 1 MB action cap.
//
// No `server-only`: it runs in the browser. It returns a code; the widget decides what to say.

export type UploadLogoResult =
  | { status: "ok"; assetId: string; a3: PpiAtA3 }
  | { status: "file_too_large" | "not_authorized" | "rejected_content" | "too_small" | "unreadable" | "unknown" };

export async function uploadLogo(locale: string, file: File): Promise<UploadLogoResult> {
  try {
    const initiated = await fetch("/api/admin/branding/logo", {
      method: "POST",
      headers: { "content-type": "application/json", "x-locale": locale },
      body: JSON.stringify({ byteSize: file.size, declaredType: file.type }),
    }).then((r) => r.json());
    if ("status" in initiated) {
      return { status: initiated.status === "file_too_large" ? "file_too_large" : "not_authorized" };
    }

    const put = await fetch(initiated.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
    if (!put.ok) return { status: "unknown" };

    const completed = await fetch("/api/admin/branding/logo/complete", {
      method: "POST",
      headers: { "content-type": "application/json", "x-locale": locale },
      body: JSON.stringify({ assetId: initiated.assetId }),
    }).then((r) => r.json());
    if (completed.status !== "ok") return { status: completed.status ?? "unknown" };

    return { status: "ok", assetId: completed.assetId, a3: completed.a3 };
  } catch {
    return { status: "unknown" };
  }
}
