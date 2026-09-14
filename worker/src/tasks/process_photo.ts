import type { Task } from "graphile-worker";
import { createHash } from "node:crypto";
import { downloadObject, uploadObject, deleteObject } from "../content/storage.js";
import { sniffImageKind, stripImageMetadata, type ImageKind } from "../content/exif.js";

// JOB-process_photo (11 §2.4, 07 §9.2, REQ-EVT-011, DEC-047). Enqueued by
// initiate_photo_processing() (supabase/proposed/content/0007) the moment
// the browser's own direct PUT to the `photos` bucket succeeds (07 §1 —
// bytes never traverse Vercel even for photos). Key `photo:{photo_id}`.
//
// This is the ONLY place a photo's EXIF is stripped, and the only place a
// `public.photos` row is ever created — `record_photo_upload()` is
// SECURITY DEFINER, service_role-only, mirroring record_material_
// conversion()'s shape (DEC-046: every write to a table the worker doesn't
// own directly goes through one SQL door). Unlike convert_document, this
// task never hands a URL to an outside process — it downloads, strips and
// re-uploads the bytes itself, so it talks to Storage directly with its own
// service_role Bearer token rather than minting a signed URL for a
// converter that (unlike this task) must never hold credentials (DEC-032).
//
// DEC-009 (no SVG uploads, anywhere) is enforced here too: a photo whose
// bytes sniff as `svg` or as anything other than the kind the browser
// declared at initiate time is deleted outright — no `photos` row is ever
// created for it, the same "never becomes retrievable" outcome REQ-MAT-012
// describes for materials, reached here by simply never writing the row
// rather than by writing-then-deleting a version.
interface Payload {
  photo_id: string;
  org_id: string;
  session_id: string;
  uploader_id: string;
  storage_path: string;
  declared_kind: ImageKind;
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return (
    !!v &&
    typeof v.photo_id === "string" &&
    typeof v.org_id === "string" &&
    typeof v.session_id === "string" &&
    typeof v.uploader_id === "string" &&
    typeof v.storage_path === "string" &&
    (v.declared_kind === "jpeg" || v.declared_kind === "png" || v.declared_kind === "webp")
  );
}

const CONTENT_TYPE: Record<ImageKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const process_photo: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`process_photo: malformed payload ${JSON.stringify(payload)}`);

  let raw: Uint8Array;
  try {
    raw = await downloadObject("photos", payload.storage_path);
  } catch (e) {
    // The object is gone (expired signed-upload token never used, a retry
    // after a prior successful run already deleted it, …) — nothing to
    // process, and nothing to retry either.
    helpers.logger.warn(`process_photo: ${payload.photo_id} — could not download ${payload.storage_path}: ${(e as Error).message}`);
    return;
  }

  const sniffed = sniffImageKind(raw);
  if (sniffed !== payload.declared_kind) {
    helpers.logger.warn(
      `process_photo: ${payload.photo_id} sniffed as ${sniffed}, declared ${payload.declared_kind} — deleting; no photos row will ever exist for it (DEC-009, REQ-EVT-011)`,
    );
    await deleteObject("photos", payload.storage_path);
    return;
  }

  const { bytes: stripped, width, height, removed } = stripImageMetadata(raw, sniffed);
  await uploadObject("photos", payload.storage_path, stripped, CONTENT_TYPE[sniffed]);
  const sha256 = createHash("sha256").update(stripped).digest("hex");

  // A single `select fn(...) as envelope` — never `(fn(...)).*` — a composite/jsonb-returning
  // function called that way can be evaluated twice by Postgres (docs/plan/notes/content.md
  // §1.4a); record_photo_upload has side effects, so a double call would be a double insert
  // attempt on its retry-safe `on conflict (id) do nothing`, not a correctness bug here, but the
  // safe form is used regardless, as everywhere else in this track.
  const { rows: outcomeRows } = await helpers.query<{ envelope: { status: string; limit_mb?: number } }>(
    `select public.record_photo_upload($1, $2, $3, $4, $5, $6, $7, $8, $9) as envelope`,
    [payload.photo_id, payload.org_id, payload.session_id, payload.uploader_id, payload.storage_path, stripped.byteLength, sha256, width, height],
  );
  const envelope = outcomeRows[0]?.envelope;

  if (envelope?.status === "file_too_large") {
    helpers.logger.warn(`process_photo: ${payload.photo_id} exceeds the org's ${envelope.limit_mb} MB image limit after stripping — deleting`);
    await deleteObject("photos", payload.storage_path);
    return;
  }

  helpers.logger.info(`process_photo: ${payload.photo_id} stripped (${removed.join(", ") || "nothing to remove"}), ${stripped.byteLength} bytes`);
};
