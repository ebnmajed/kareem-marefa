import type { Task } from "graphile-worker";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { photoAlbumBuildPrefix, photoAlbumPartPath, photoAlbumPrefix } from "@kareem/storage-paths";
import { deleteObject, downloadObject, listObjects, uploadObject } from "../content/storage.js";
import { withTempDir } from "../content/pdf.js";
import { zipFiles } from "../content/zip.js";

// JOB-zip_session_photos (11 §2.4, REQ-ADM-021, DEC-180, DEC-182) — «تنزيل الكل».
// Enqueued by `request_photo_album()` (0156), key `zipphotos:{session_id}`,
// queue `convert`, three attempts. The audit row is the request's, never this
// job's.
//
// ★ THIS IS A JOB BECAUSE IT CANNOT BE A REQUEST: an album of 300 photographs
// would block a function past its limit.
//
// ★ THE ALBUM SHIPS IN PARTS (DEC-182). Storage takes one upload of at most
// 50 MiB by default, and one phone photograph is 2 to 6 MB, so twenty can pass
// it. Each part is a complete zip of at most `PHOTO_ALBUM_PART_BYTES` (45 MiB),
// that opens on a phone on its own; a session under the cap gets one. A split
// archive (`zip -s`) is not used: its pieces open only together. Only one part
// is on disk at a time, and `convert` is a named queue that runs one job at a
// time and carries nothing else, so zips never race each other for disk.
//
// ★ ONLY STRIPPED PHOTOGRAPHS, ONLY VISIBLE ONES. The set comes from ROWS, from
// `begin_photo_album_build()` — never from listing the bucket, where a raw,
// unstripped upload sits at a photo's path until `process_photo` runs. Each
// object's SHA-256 must equal the one `process_photo` computed over the
// stripped bytes and stored on the row; a mismatch refuses the whole album.
// A photograph hidden while this runs is caught by `record_photo_album_built()`,
// which answers 'stale', and the retry rebuilds without it.
//
// The `expire` mode, enqueued by `record_photo_album_built()` for the moment
// the album lapses (DEC-182, Q7), deletes that build's parts if it is still the
// current one. The bucket's policy already refuses an expired build (0156);
// this only removes bytes nobody can reach.

interface BuildPayload {
  mode?: "build";
  album_id: string;
  build_id: string;
  session_id: string;
  org_id: string;
}

interface ExpirePayload extends Omit<BuildPayload, "mode"> {
  mode: "expire";
}

type Payload = BuildPayload | ExpirePayload;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return (
    !!v &&
    (v.mode === undefined || v.mode === "build" || v.mode === "expire") &&
    [v.album_id, v.build_id, v.session_id, v.org_id].every((id) => typeof id === "string" && UUID.test(id))
  );
}

export interface AlbumPhoto {
  photo_id: string;
  storage_path: string;
  byte_size: number;
  sha256: string;
}

/** 45 MiB: under Storage's 50 MiB default single-upload limit with room to spare. */
export const DEFAULT_PART_BYTES = 45 * 1024 * 1024;

export function partBytes(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.PHOTO_ALBUM_PART_BYTES);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PART_BYTES;
}

/** Greedy, in order: a photograph joins the current part unless that would pass the cap. A single
 *  photograph larger than the cap is a part of its own — never split, never dropped. */
export function partition(photos: AlbumPhoto[], cap: number): AlbumPhoto[][] {
  const parts: AlbumPhoto[][] = [];
  let current: AlbumPhoto[] = [];
  let size = 0;
  for (const photo of photos) {
    if (current.length > 0 && size + photo.byte_size > cap) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(photo);
    size += photo.byte_size;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/** `007-3f2a9c1b.jpg` — the album's own order, then the photograph's id, so every name is unique
 *  and ASCII. The numbering runs across parts, so part 2 continues where part 1 stopped. */
export function entryName(ordinal: number, photo: Pick<AlbumPhoto, "photo_id" | "storage_path">): string {
  const ext = /\.([a-z0-9]+)$/i.exec(photo.storage_path)?.[1]?.toLowerCase() ?? "jpg";
  return `${String(ordinal).padStart(3, "0")}-${photo.photo_id.replace(/-/g, "").slice(0, 8)}.${ext}`;
}

export const zip_session_photos: Task = async (payload, helpers) => {
  if (!isPayload(payload)) {
    // Retrying a malformed payload repeats the same failure; there is no album to fail.
    helpers.logger.error(`zip_session_photos: malformed payload ${JSON.stringify(payload)}`);
    return;
  }
  if (payload.mode === "expire") return expire(payload, helpers);

  const { build_id, session_id, org_id } = payload;
  try {
    const { rows } = await helpers.query<{ photo_id: string; storage_path: string; byte_size: string | number; sha256: string }>(
      `select * from public.begin_photo_album_build($1)`,
      [build_id],
    );
    if (rows.length === 0) {
      // Either a newer request replaced this build (then this is a no-op, the build id is not
      // the row's), or every photograph was hidden since the request: the album fails, and the
      // slot says so.
      await helpers.query(`select public.fail_photo_album($1, $2)`, [build_id, "album_empty"]);
      helpers.logger.info(`zip_session_photos: build ${build_id} has nothing to zip`);
      return;
    }
    const photos: AlbumPhoto[] = rows.map((r) => ({ ...r, byte_size: Number(r.byte_size) }));

    const written: { path: string; byteSize: number; photoCount: number }[] = [];
    let ordinal = 0;
    for (const [index, group] of partition(photos, partBytes()).entries()) {
      await withTempDir("album-", async (dir) => {
        const files: string[] = [];
        for (const photo of group) {
          ordinal += 1;
          const bytes = await downloadObject("photos", photo.storage_path);
          const sha = createHash("sha256").update(bytes).digest("hex");
          if (sha !== photo.sha256) {
            throw new Error(`zip_session_photos: ${photo.photo_id}'s object is not the stripped file its row recorded — refusing the album`);
          }
          const file = join(dir, entryName(ordinal, photo));
          await writeFile(file, bytes);
          files.push(file);
        }
        const output = join(dir, "part.zip");
        await zipFiles(output, files);
        const zip = await readFile(output);
        const path = photoAlbumPartPath(org_id, session_id, build_id, index + 1);
        await uploadObject("photo-albums", path, new Uint8Array(zip.buffer, zip.byteOffset, zip.byteLength), "application/zip");
        written.push({ path, byteSize: zip.byteLength, photoCount: group.length });
      });
    }

    const { rows: outcome } = await helpers.query<{ outcome: string }>(
      `select public.record_photo_album_built($1, $2::jsonb, $3::uuid[]) as outcome`,
      [build_id, JSON.stringify(written), photos.map((p) => p.photo_id)],
    );
    const result = outcome[0]?.outcome;

    if (result === "stale") {
      // Thrown, so the retry reads the visible set again — without the photograph just hidden.
      throw new Error(`zip_session_photos: a photograph of session ${session_id} was hidden during build ${build_id} — rebuilding`);
    }
    if (result === "superseded") {
      for (const part of written) await deleteObject("photo-albums", part.path);
      helpers.logger.info(`zip_session_photos: build ${build_id} was replaced while it ran — its parts deleted`);
      return;
    }

    // Ready. Every older build of this album is unreadable already (the policy admits the current
    // build only); its bytes go too.
    const current = `${photoAlbumBuildPrefix(org_id, session_id, build_id)}/`;
    for (const path of await listObjects("photo-albums", photoAlbumPrefix(org_id, session_id))) {
      if (!path.startsWith(current)) await deleteObject("photo-albums", path);
    }
    helpers.logger.info(`zip_session_photos: build ${build_id} ready — ${photos.length} photographs in ${written.length} part(s)`);
  } catch (error) {
    // The row says `failed` only when no retry is left, so the slot never shows «failed» while a
    // retry is still coming.
    if (helpers.job.attempts >= helpers.job.max_attempts) {
      await helpers.query(`select public.fail_photo_album($1, $2)`, [build_id, (error as Error).message]);
    }
    throw error;
  }
};

async function expire(payload: ExpirePayload, helpers: Parameters<Task>[1]) {
  const { rows } = await helpers.query<{ build_id: string; expires_at: string | null }>(
    `select build_id, expires_at from public.photo_albums where session_id = $1`,
    [payload.session_id],
  );
  const album = rows[0];
  if (!album || album.build_id !== payload.build_id || !album.expires_at || Date.parse(album.expires_at) > Date.now()) {
    // Replaced, rebuilt or deleted since: the newer build cleans up after itself.
    return;
  }
  const paths = await listObjects("photo-albums", photoAlbumBuildPrefix(payload.org_id, payload.session_id, payload.build_id));
  for (const path of paths) await deleteObject("photo-albums", path);
  helpers.logger.info(`zip_session_photos: build ${payload.build_id} expired — ${paths.length} part(s) deleted`);
}
