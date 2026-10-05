import type { Task } from "graphile-worker";
import { createHash } from "node:crypto";
import { downloadObject, uploadObject, deleteObject, isNotFound } from "../content/storage.js";
import { sniffImageKind, stripImageMetadata, type ImageKind } from "../content/exif.js";
import { photoStoryPath } from "@kareem/storage-paths";
import { renderStoryDerivative } from "../content/story-derivative.js";
import { readJpegOrientation, swapsAxes, uprightJpeg } from "../content/orientation.js";

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
  // REQ-SES-018/DEC-121: the instant `initiate_photo_processing()` ran — right after the browser's
  // own PUT succeeded, not this job's own clock, which can run minutes later.
  // `record_photo_upload()` uses this, not now(), to pick the day a photo belongs to
  // (proposed/content/0001). Optional, not required: a job enqueued by the OLD
  // `initiate_photo_processing()` (pushed before this migration lands, additive per rule 2) has no
  // such key, and is a malformed-payload rejection we can avoid — falling back to this task's own
  // clock below is exactly the SQL function's own default for an omitted argument.
  uploaded_at?: string;
  // Wave 26 (REQ-STO-011, DEC-251 §4.2): the caption a story photograph was posted with, put in the payload by
  // `initiate_story_photo()` (proposed/content/0002). Optional: an album upload has none, and a job enqueued by the
  // OLD `initiate_photo_processing()` never had the key.
  caption?: string | null;
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
    (v.declared_kind === "jpeg" || v.declared_kind === "png" || v.declared_kind === "webp") &&
    (v.uploaded_at === undefined || typeof v.uploaded_at === "string") &&
    (v.caption === undefined || v.caption === null || typeof v.caption === "string")
  );
}

const CONTENT_TYPE: Record<ImageKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const process_photo: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`process_photo: malformed payload ${JSON.stringify(payload)}`);

  let raw: Uint8Array;
  try {
    raw = await downloadObject("photos", payload.storage_path);
  } catch (e) {
    // Only a missing object is terminal. Anything else — Storage down, a timeout, a 5xx — is
    // rethrown so graphile-worker retries it; returning would drop a real photo silently.
    if (!isNotFound(e)) throw e;
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

  // ★ The EXIF Orientation is read from the RAW bytes, because the strip below removes the APP1 that carries it —
  // and with it the only record of which way up a phone photograph is (content/orientation.ts). Anything but 1 is
  // turned upright with ffmpeg AFTER the strip, so the original, the story derivative made from it and the
  // width and height recorded below are all the upright picture's. A failed turn keeps the unturned bytes.
  const orientation = sniffed === "jpeg" ? readJpegOrientation(raw) : 1;
  const strip = stripImageMetadata(raw, sniffed);
  const { removed } = strip;
  let { bytes: stripped, width, height } = strip;
  if (orientation !== 1) {
    const upright = await uprightJpeg(stripped, orientation);
    if (upright) {
      const swap = swapsAxes(orientation);
      stripped = upright.bytes;
      width = upright.width ?? (swap ? strip.height : strip.width);
      height = upright.height ?? (swap ? strip.width : strip.height);
    } else {
      helpers.logger.warn(`process_photo: ${payload.photo_id} — orientation ${orientation} could not be applied; stored as shot`);
    }
  }
  await uploadObject("photos", payload.storage_path, stripped, CONTENT_TYPE[sniffed]);
  const sha256 = createHash("sha256").update(stripped).digest("hex");

  // Wave 26 (REQ-STO-012, `05-stories.md` «Data access»): the `story` derivative, 1080 px on the long side, WebP,
  // made from the STRIPPED bytes and written under `photos/…/photos/story/{id}.webp` — read under exactly its
  // photograph's visibility (packages/storage-paths `photoStoryPath`). A failure never blocks the album: the photo
  // records with `story_derivative_ready = false` and its frame shows the original.
  const storyPath = photoStoryPath(payload.org_id, payload.session_id, payload.photo_id);
  const story = await renderStoryDerivative(stripped, sniffed, width, height);
  let storyReady = false;
  if (story) {
    try {
      await uploadObject("photos", storyPath, story, "image/webp");
      storyReady = true;
    } catch (e) {
      helpers.logger.warn(`process_photo: ${payload.photo_id} — the story derivative was not stored: ${(e as Error).message}`);
    }
  }

  // A single `select fn(...) as envelope` — never `(fn(...)).*` — a composite/jsonb-returning
  // function called that way can be evaluated twice by Postgres (docs/plan/notes/content.md
  // §1.4a); record_photo_upload has side effects, so a double call would be a double insert
  // attempt on its retry-safe `on conflict (id) do nothing`, not a correctness bug here, but the
  // safe form is used regardless, as everywhere else in this track.
  //
  // REQ-SES-018/DEC-121: the 10th argument — `uploaded_at ?? now()` mirrors the SQL function's own
  // default for a caller that omits it (proposed/content/0001).
  const { rows: outcomeRows } = await helpers.query<{ envelope: { status: string; limit_mb?: number } }>(
    `select public.record_photo_upload($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as envelope`,
    [
      payload.photo_id,
      payload.org_id,
      payload.session_id,
      payload.uploader_id,
      payload.storage_path,
      stripped.byteLength,
      sha256,
      width,
      height,
      payload.uploaded_at ?? new Date().toISOString(),
      // Wave 26, trailing and defaulted in SQL (proposed/content/0002): the caption, and whether the derivative exists.
      payload.caption ?? null,
      storyReady,
    ],
  );
  const envelope = outcomeRows[0]?.envelope;

  if (envelope?.status === "file_too_large") {
    helpers.logger.warn(`process_photo: ${payload.photo_id} exceeds the org's ${envelope.limit_mb} MB image limit after stripping — deleting`);
    await deleteObject("photos", payload.storage_path);
    if (storyReady) await deleteObject("photos", storyPath).catch(() => undefined);
    return;
  }

  helpers.logger.info(`process_photo: ${payload.photo_id} stripped (${removed.join(", ") || "nothing to remove"})${orientation !== 1 ? `, orientation ${orientation}` : ""}, ${stripped.byteLength} bytes`);
};
