// The design-asset upload, from the browser — REQ-DSG-018, REQ-DSG-019, DEC-009.
//
// Three steps, and the bytes never pass through this app's process: ask
// `/api/designer/assets` for a signed upload URL (the size is refused up
// front), PUT the file to it, then `/api/designer/assets/complete` reads the
// bytes back and SNIFFS them — never the name — refusing an SVG and anything
// that is not PNG, JPEG or WebP (DEC-009). One copy, shared by the poster
// picker's «رفع» and the studio's «أضف صورة».

export type UploadFailure = "file_too_large" | "rejected_content" | "too_small" | "unreadable" | "not_authorized" | "unknown";

export type UploadResult =
  | { status: "ok"; assetId: string; width: number; height: number; previewUrl: string | null }
  | { status: UploadFailure; shortSide?: number };

const KNOWN: UploadFailure[] = ["file_too_large", "rejected_content", "too_small", "unreadable", "not_authorized"];

/** `sessionId` when the file is a finished poster (sized on the poster limit, 1080 px minimum). */
export async function uploadDesignAsset(file: File, locale: string, sessionId?: string): Promise<UploadResult> {
  try {
    const initiated = await fetch("/api/designer/assets", {
      method: "POST",
      headers: { "content-type": "application/json", "x-locale": locale },
      body: JSON.stringify({ byteSize: file.size, declaredType: file.type, ...(sessionId ? { sessionId } : {}) }),
    }).then((r) => r.json());
    if ("status" in initiated) return { status: initiated.status === "file_too_large" ? "file_too_large" : "not_authorized" };

    const put = await fetch(initiated.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
    if (!put.ok) return { status: "unknown" };

    const completed = await fetch("/api/designer/assets/complete", {
      method: "POST",
      headers: { "content-type": "application/json", "x-locale": locale },
      body: JSON.stringify({ assetId: initiated.assetId, ...(sessionId ? { sessionId } : {}) }),
    }).then((r) => r.json());
    if (completed.status !== "ok") return { status: KNOWN.includes(completed.status) ? completed.status : "unknown", shortSide: completed.shortSide };
    return { status: "ok", assetId: completed.assetId, width: completed.width, height: completed.height, previewUrl: completed.previewUrl ?? null };
  } catch {
    return { status: "unknown" };
  }
}
