import type { Task } from "graphile-worker";
import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { storyVideoPath, storyVideoPosterPath, storyVideoSourcePath, type StoryVideoSourceExt } from "@kareem/storage-paths";
import { deleteObject, downloadObjectToFile, isNotFound, uploadObject } from "../content/storage.js";
import { withTempDir } from "../content/pdf.js";
import { sniffImageKind } from "../content/exif.js";
import {
  FFMPEG_TIMEOUT_MS,
  FFPROBE_TIMEOUT_MS,
  POSTER_TIMEOUT_MS,
  STORY_VIDEO_MAX_SECONDS,
  ToolTimeout,
  auditArgs,
  auditRendition,
  cwebpPosterArgs,
  ffmpegArgs,
  ffprobeArgs,
  durationFromProbe,
  judgeProbe,
  posterArgs,
  runTool,
  sniffVideoContainer,
  type ProbeResult,
  type RenditionProbe,
} from "../content/video.js";

// JOB-transcode_story_video (REQ-STO-016, DEC-248 §6, DEC-251 §5). Enqueued by `begin_story_video()`
// (supabase/proposed/content/0003) the moment the browser's own PUT to `story-media` succeeded; key
// `story_video:{frame_id}`, queue `story_video` — one transcode at a time on the worker — three attempts.
//
// ★ The source is streamed to disk and sniffed, `ffprobe` reads its streams and the object's own length decides the
// 200 MB ceiling, then `ffmpeg` writes ONE H.264/AAC MP4 of the FIRST 15.0 s (DEC-293 §3 — a longer video is trimmed,
// never refused) with every container tag and every non-A/V track dropped, the rendition is PROBED AGAIN and refused if anything a
// phone wrote survived, a poster frame is cut from the rendition, both are uploaded, `record_story_video()` makes the
// frame visible (its 24 hours start then), and the source is deleted. Any refusal — `ffprobe`'s, the sniff's, the
// audit's, a timeout — calls `fail_story_video()`: the frame is `failed`, its author reads «تعذّر», nobody else sees
// anything, and the source is deleted all the same. A video earns nothing and never enters the album: this task writes
// no `photos` row and no ledger row.
//
// ★ Idempotent: both SQL doors are no-ops unless the frame is still `processing`; uploads overwrite (`x-upsert`). A
// transient failure (Storage 5xx) throws for graphile to retry; on the LAST attempt it fails the frame instead, so no
// frame is left `processing` for ever.
//
// `main`'s worker has no task by this name; graphile-worker only fetches jobs it knows, so a job enqueued before the new
// image deploys waits and runs when it does (DEC-248 §6).

interface Payload {
  frame_id: string;
  org_id: string;
  session_id: string;
  source_path: string;
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return !!v && typeof v.frame_id === "string" && typeof v.org_id === "string" && typeof v.session_id === "string" && typeof v.source_path === "string";
}

const BUCKET = "story-media";

/** Up to 200 MB from Storage, same region as the worker — minutes of room for a slow link. */
const SOURCE_DOWNLOAD_TIMEOUT_MS = 300_000;

/** The source is not there (see the download): the frame is already failed, nothing to retry. */
class Gone extends Error {}

class Refused extends Error {
  // ★ No `too_long` since DEC-293 §3: a longer video keeps its first 15 s. The reason survives on older failed rows.
  constructor(readonly reason: "too_large" | "unsupported" | "failed", detail: string) {
    super(detail);
  }
}

export const transcode_story_video: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`transcode_story_video: malformed payload ${JSON.stringify(payload)}`);
  const { frame_id: frameId, org_id: orgId, session_id: sessionId, source_path: sourcePath } = payload;

  const fail = async (reason: string, detail: string, opts: { deleteFiles?: boolean } = {}) => {
    helpers.logger.warn(`transcode_story_video: ${frameId} refused (${reason}) — ${detail}`);
    const { rows } = await helpers.query<{ envelope: { status?: string } | null }>(`select public.fail_story_video($1, $2) as envelope`, [
      frameId,
      reason,
    ]);
    // A rendition or poster uploaded before the failure (the record call failing on the last attempt) is referenced by
    // no frame now — it goes, so nothing playable outlives the `failed` state. ONLY when this call is what failed the
    // frame: a `noop` is a frame already visible (a retry after a run that finished), whose files are live.
    if (opts.deleteFiles !== false && rows[0]?.envelope?.status === "ok") {
      await deleteObject(BUCKET, storyVideoPath(orgId, sessionId, frameId)).catch(() => undefined);
      await deleteObject(BUCKET, storyVideoPosterPath(orgId, sessionId, frameId)).catch(() => undefined);
    }
    if (opts.deleteFiles !== false) await deleteObject(BUCKET, sourcePath).catch(() => undefined);
  };

  // The path is rebuilt by the one builder and must equal what the frame recorded — never trusted from the payload.
  // A path that is not this frame's is terminal: thrown, it would only retry to the same answer and leave the frame
  // `processing` for ever. The frame is failed; nothing is deleted — paths built from a payload that does not match
  // its frame name no object this job may touch.
  const ext = sourcePath.split(".").pop() as StoryVideoSourceExt;
  if (storyVideoSourcePath(orgId, sessionId, frameId, ext) !== sourcePath) {
    return fail("failed", "the source path is not this frame's", { deleteFiles: false });
  }

  try {
    await withTempDir("story-", async (dir) => {
      const source = join(dir, "source");
      const rendition = join(dir, "video.mp4");
      const posterPng = join(dir, "poster.png");
      const posterWebp = join(dir, "poster.webp");

      // Streamed to disk, never held in memory: a source may be 200 MB (DEC-293 §3).
      let byteLength: number;
      try {
        byteLength = await downloadObjectToFile(BUCKET, sourcePath, source, SOURCE_DOWNLOAD_TIMEOUT_MS);
      } catch (e) {
        // Gone already: a retry after a run that finished, or a PUT that never happened. Fail the frame if it is still
        // processing (a no-op otherwise) — nothing is left to transcode. Anything else (Storage down or slow) is not
        // «gone»: it falls to the outer handler, retried and failed only on the last attempt.
        if (!isNotFound(e)) throw e;
        await helpers.query(`select public.fail_story_video($1, 'failed') as envelope`, [frameId]);
        helpers.logger.warn(`transcode_story_video: ${frameId} — no source at ${sourcePath}: ${(e as Error).message}`);
        throw new Gone();
      }

      const head = new Uint8Array(128);
      const fh = await open(source, "r");
      try {
        await fh.read(head, 0, 128, 0);
      } finally {
        await fh.close();
      }
      const demuxer = sniffVideoContainer(head);
      if (!demuxer) throw new Refused("unsupported", "not an ISO-BMFF, QuickTime or EBML container");

      const probe = JSON.parse(await runTool("ffprobe", ffprobeArgs(demuxer, source), FFPROBE_TIMEOUT_MS)) as ProbeResult;
      const verdict = judgeProbe(probe, byteLength);
      if (!verdict.ok) {
        const codecs = (probe.streams ?? []).map((s) => `${s.codec_type ?? "?"}:${s.codec_name ?? "?"}`).join(",");
        throw new Refused(verdict.reason, `ffprobe: ${verdict.reason} (${demuxer}, ${byteLength} bytes, ${codecs})`);
      }

      await runTool("ffmpeg", ffmpegArgs(demuxer, source, rendition, verdict), FFMPEG_TIMEOUT_MS);

      // ★ The proof, on every run: the rendition is read back and refused if anything survived.
      const out = JSON.parse(await runTool("ffprobe", auditArgs("mp4", rendition), FFPROBE_TIMEOUT_MS)) as RenditionProbe;
      const wrong = auditRendition(out);
      if (wrong) throw new Refused("failed", `rendition audit: ${wrong}`);
      const video = out.streams?.find((s) => s.codec_type === "video");
      // The rendition's own length — trimmed to 15.0 s, and measured from a file ffmpeg wrote whole.
      const durationSeconds = durationFromProbe(out) ?? Math.min(verdict.durationSeconds ?? STORY_VIDEO_MAX_SECONDS, STORY_VIDEO_MAX_SECONDS);

      await runTool("ffmpeg", posterArgs(rendition, posterPng, durationSeconds), POSTER_TIMEOUT_MS);
      await runTool("cwebp", cwebpPosterArgs(posterPng, posterWebp), POSTER_TIMEOUT_MS);
      const poster = await readFile(posterWebp);
      if (sniffImageKind(poster) !== "webp") throw new Refused("failed", "cwebp wrote something that is not WebP");

      const bytes = await readFile(rendition);
      const size = (await stat(rendition)).size;
      const videoPath = storyVideoPath(orgId, sessionId, frameId);
      const posterPath = storyVideoPosterPath(orgId, sessionId, frameId);
      await uploadObject(BUCKET, videoPath, bytes, "video/mp4");
      await uploadObject(BUCKET, posterPath, poster, "image/webp");

      await helpers.query(`select public.record_story_video($1, $2, $3, $4, $5, $6, $7, $8) as envelope`, [
        frameId,
        videoPath,
        posterPath,
        Math.round(durationSeconds * 1000),
        video?.width ?? null,
        video?.height ?? null,
        size,
        createHash("sha256").update(bytes).digest("hex"),
      ]);
      await deleteObject(BUCKET, sourcePath).catch(() => undefined);
      const sourceSeconds = verdict.durationSeconds === null ? "?" : verdict.durationSeconds.toFixed(1);
      helpers.logger.info(`transcode_story_video: ${frameId} visible — ${durationSeconds.toFixed(1)} s kept of ${sourceSeconds} s, ${byteLength} → ${size} bytes, no tag left`);
    });
  } catch (e) {
    if (e instanceof Gone) return;
    if (e instanceof Refused) return fail(e.reason, e.message);
    if (e instanceof ToolTimeout) return fail("failed", e.message);
    if (e instanceof Error && e.message.startsWith("content/video:")) return fail("failed", e.message);
    // Transient (Storage, the database): retry — unless this was the last attempt, where the frame is failed instead.
    if (helpers.job.attempts >= helpers.job.max_attempts) return fail("failed", (e as Error).message);
    throw e;
  }
};
