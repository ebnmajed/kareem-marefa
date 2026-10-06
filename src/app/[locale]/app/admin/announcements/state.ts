import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";

// A "use server" module may export async functions and nothing else (REQ-ADM-025).

/** In the page's order — the summary lists failures in it. */
export const ANNOUNCEMENT_FIELDS = ["body", "publish", "publishAt", "expiresAt"] as const;
export type AnnouncementField = (typeof ANNOUNCEMENT_FIELDS)[number];

export type AnnouncementState = SavedFormState<AnnouncementField>;
export const emptyAnnouncementState: AnnouncementState = emptySavedState<AnnouncementField>();

/** The DOM id of each field's control, for the summary's links. */
export const ANNOUNCEMENT_FIELD_IDS: Record<AnnouncementField, string> = {
  body: "announcement-body",
  publish: "announcement-publish",
  publishAt: "announcement-publish-at",
  expiresAt: "announcement-expires-at",
};
