import type { SettingsField } from "@/lib/dal/admin-settings";

// SCR-063's fields — which card holds each, and how it posts. No directive: the page, the form and the action all read
// it, so the three cannot disagree about a field's name.
//
// ★ The four cards are `AdminSettings.dc.html`'s; the rows they hold are what the org STORES (notes/notify.md N2,
// `DEC-232` §5.1). Nine drawn values that nothing stores are absent, never invented; the eleven `REQ-TEN-008` settings
// the board does not draw are kept, placed where their meaning sits.

/** Numbers, posted as text and parsed as whole numbers. */
export const NUMBER_FIELDS: readonly SettingsField[] = [
  "companyMinActiveMembers",
  "checkInRotationSeconds",
  "checkInGraceSeconds",
  "maxCoPresenters",
  "priorityRsvpHours",
  "limitDocumentMb",
  "limitAudioMb",
  "limitImageMb",
  "limitPosterMb",
  "ratingMinAggregate",
];

/** Everything the form posts besides the domains, in reading order. */
export const FORM_FIELDS: readonly (SettingsField | "name")[] = [
  "name",
  "timeZone",
  "companyMetric",
  "companyMinActiveMembers",
  "checkInRotationSeconds",
  "checkInGraceSeconds",
  "maxCoPresenters",
  "priorityRsvpHours",
  "limitDocumentMb",
  "limitAudioMb",
  "limitImageMb",
  "limitPosterMb",
  "ratingMinAggregate",
  "emailFromName",
  "emailReplyTo",
  "allowJpegExport",
];

/** The `org_settings` columns whose history is this page's saved mark, and the audit actions beside them. */
export const MARK_COLUMNS = [
  "time_zone",
  "company_metric",
  "company_min_active_members",
  "check_in_rotation_seconds",
  "check_in_grace_seconds",
  "max_co_presenters",
  "priority_rsvp_hours",
  "limit_document_mb",
  "limit_audio_mb",
  "limit_image_mb",
  "limit_poster_mb",
  "rating_min_aggregate",
  "email_from_name",
  "email_reply_to",
  "allow_jpeg_export",
] as const;
export const MARK_ACTIONS = ["org.renamed", "domain.added", "domain.removed", "domain.changed"] as const;

/** `org_domains`' check (0004:76), said before the database has to. */
export const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** What an admin types — «@Example.com, other.sa» — as `org_domains_normalise()` would store it. */
export function parseDomains(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,،]+/).map((d) => d.trim().toLowerCase().replace(/^@+/, "")).filter(Boolean)));
}

/** Each number's bounds — the column's check constraint (0004, 0175), said at the field with its figures read here. */
export const BOUNDS: Partial<Record<SettingsField | "name", readonly [number, number]>> = {
  name: [2, 120],
  companyMinActiveMembers: [1, 50],
  checkInRotationSeconds: [60, 3600],
  checkInGraceSeconds: [0, 600],
  maxCoPresenters: [0, 10],
  priorityRsvpHours: [0, 168],
  limitDocumentMb: [1, 500],
  limitAudioMb: [1, 2000],
  limitImageMb: [1, 100],
  limitPosterMb: [1, 200],
  ratingMinAggregate: [1, 20],
};

/** Every IANA zone this runtime knows, and the stored one even if it does not (D-N3: nothing stored is hidden). */
export function timeZones(stored: string): string[] {
  const all = Intl.supportedValuesOf("timeZone");
  return all.includes(stored) ? all : [stored, ...all];
}
