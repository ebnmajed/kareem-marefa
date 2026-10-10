// The upload's contract between the crop step and the route (DEC-280 §2, DEC-281; REQ-PRF-017).
//
// ★ Not `server-only` on purpose: `content`'s encoder imports `MAX_UPLOAD_BYTES` from here rather than retyping it,
// and `POST /api/avatars/upload` refuses by the same number. `avatar-staging` (0222) carries it a third time as the
// bucket's `file_size_limit` — `tests/unit/avatar-upload-route.test.ts` holds the two in code equal to 1 MiB.

/** 1 MiB — the largest body the route and the staging bucket accept. */
export const MAX_UPLOAD_BYTES = 1_048_576;

/** The declared types the route admits. The worker decides on content after the bytes land (an SVG renamed `.png`). */
export const UPLOAD_CONTENT_TYPES = ["image/jpeg", "image/png"] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

/** An upload's state as the sheet polls it — `public.avatar_upload_state`. */
export const AVATAR_UPLOAD_STATES = ["pending", "done", "refused", "failed", "cancelled"] as const;
export type AvatarUploadState = (typeof AVATAR_UPLOAD_STATES)[number];

/** `POST /api/avatars/upload`'s refusals, as the response's `error`. `content` maps them to words. */
export type AvatarUploadError = "png_jpg_only" | "too_large" | "unauthorised" | "upload_failed";
