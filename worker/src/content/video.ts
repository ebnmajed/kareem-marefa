import { execFile } from "node:child_process";
import { promisify } from "node:util";

// An attendee's story video, IN the worker image — REQ-STO-016, DEC-248 §6, DEC-181.
//
// `ffmpeg` and `ffprobe` are Debian's own package, installed by worker/Dockerfile (the lead's) beside poppler, webp
// and zip. No npm package touches the bytes: this file spawns the binaries as pdf.ts spawns pdftoppm.
//
// ★ THREE RULES THIS FILE EXISTS TO HOLD.
//   1. The server decides from the bytes that landed, never from the client's word: the size (200 MB) is the object's
//      own length, and the length kept is the first 15 seconds of whatever was uploaded (DEC-293 §3 — a longer video
//      is trimmed, not refused).
//   2. Nothing a phone wrote into the container survives. A phone's video carries its GPS position in its container
//      exactly as a photograph carries it in EXIF (REQ-EVT-011): `-map_metadata -1` drops the global tags, the
//      per-stream `-map_metadata:s:* -1` the stream tags, `-map_chapters -1` the chapters, and the EXPLICIT maps with
//      `-dn -sn` drop every other track — an iPhone also writes its location into a separate timed-metadata track
//      (`mebx`), which a tag strip alone would carry straight across.
//   3. An uploaded file is never allowed to choose its own parser. The container is sniffed here from its first bytes,
//      the demuxer is then FORCED with `-f`, and only the `file` protocol is whitelisted — so a playlist, a concat
//      script or an image sequence posing as a video can never make the worker fetch a URL or read another file.

const execFileP = promisify(execFile);

/** REQ-STO-016, DEC-293 §3 — named once. A story video is at most 15.0 s: the rendition keeps the FIRST 15.0 s of any
 *  accepted source and nothing after — a 40-second clip from the phone's camera app is stored as its first 15 seconds,
 *  never refused for its length. (`too_long` survives only as a reason on rows failed before DEC-293.) */
export const STORY_VIDEO_MAX_SECONDS = 15;
/** 200 MB — the same figure as the `story-media` bucket's `file_size_limit` (0225, notes/story-media.md §8), which
 *  refuses the PUT at the edge: a minute of the iPhone's default 1080p30 HEVC is ≈ 60 MB, of 4K30 ≈ 170 MB. */
export const STORY_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
/** The rendition: at most 720 px on the short side, 30 fps, 2.5 Mbit/s video, 128 kbit/s audio — ≈ 5 MB for 15 s. */
export const STORY_VIDEO_SHORT_SIDE = 720;
export const STORY_VIDEO_MAX_DIMENSION = 4096;
export const FFPROBE_TIMEOUT_MS = 15_000;
/** 15 s of a 4K60 HEVC source decoded in software on two threads, scaled to 720 p and encoded — with room. */
export const FFMPEG_TIMEOUT_MS = 240_000;
export const POSTER_TIMEOUT_MS = 15_000;

/** ffmpeg's own demuxer names — the only two this task will ever hand it. */
export type StoryVideoDemuxer = "mov" | "matroska";

const ISO_BMFF_BRANDS = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4A ", "qt  ", "3gp4", "3gp5", "3gp6", "MSNV", "dash"]);
const QUICKTIME_ATOMS = new Set(["moov", "mdat", "wide", "free", "skip"]);

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length && offset + i < bytes.length; i++) s += String.fromCharCode(bytes[offset + i]!);
  return s;
}

/** Sniffed on content, after the bytes land: ISO-BMFF/QuickTime → `mov`, EBML (WebM, Matroska) → `matroska`, anything
 *  else — an image, an SVG, a playlist, text — null, and the task refuses it as `unsupported`. */
export function sniffVideoContainer(head: Uint8Array): StoryVideoDemuxer | null {
  if (head.length < 12) return null;
  const box = ascii(head, 4, 4);
  if (box === "ftyp") return ISO_BMFF_BRANDS.has(ascii(head, 8, 4)) ? "mov" : null;
  if (QUICKTIME_ATOMS.has(box)) return "mov";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    // The EBML header names its DocType within its first few dozen bytes.
    const window = ascii(head, 4, Math.min(64, head.length - 4));
    if (window.includes("webm") || window.includes("matroska")) return "matroska";
  }
  return null;
}

export function ffprobeArgs(demuxer: StoryVideoDemuxer, input: string): string[] {
  return [
    "-v", "error",
    "-hide_banner",
    "-protocol_whitelist", "file",
    "-f", demuxer,
    "-show_entries", "format=format_name,duration,size:stream=index,codec_type,codec_name,width,height,duration",
    "-of", "json",
    "-i", input,
  ];
}

export interface ProbeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
}
export interface ProbeResult {
  format?: { format_name?: string; duration?: string; size?: string };
  streams?: ProbeStream[];
}

/** What a phone or a browser records, and what Debian's ffmpeg 5.1 decodes (libdav1d for AV1). MPEG-4 Part 2 is an
 *  older Android's 3GP. Anything else is `unsupported`. */
export const VIDEO_CODECS = new Set(["h264", "hevc", "vp8", "vp9", "av1", "mpeg4"]);
/** An audio track in one of these is kept (re-encoded to AAC). A track in any other — an iPhone 16's spatial-audio
 *  APAC, which ffmpeg 5.1 cannot decode and reads as `none` — is DROPPED, never a reason to refuse the video. */
export const AUDIO_CODECS = new Set([
  "aac", "opus", "vorbis", "mp3", "alac", "flac", "ac3", "eac3", "amr_nb", "amr_wb",
  "pcm_s16le", "pcm_s16be", "pcm_s24le", "pcm_s24be", "pcm_s32le", "pcm_f32le", "pcm_u8",
]);

/** The streams the rendition is made from, by ABSOLUTE index: the first allowed video stream and the first decodable
 *  audio stream (null — the video is silent). Null when there is no allowed video at all. */
export function pickStreams(probe: ProbeResult): { video: ProbeStream; audioIndex: number | null } | null {
  const streams = probe.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video" && !!s.codec_name && VIDEO_CODECS.has(s.codec_name));
  if (!video) return null;
  const audio = streams.find((s) => s.codec_type === "audio" && !!s.codec_name && AUDIO_CODECS.has(s.codec_name));
  return { video, audioIndex: audio ? audio.index : null };
}

function seconds(v: string | undefined): number | null {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) && n > 0 ? n : null;
}

/** The container's own duration, else the longest stream's — null when neither is written (a MediaRecorder WebM writes
 *  `N/A`: its header goes out before the recording ends). Informational since DEC-293: nothing is refused for its
 *  length, and the stored duration is read from the rendition, which ffmpeg writes whole. */
export function durationFromProbe(probe: { format?: { duration?: string }; streams?: { duration?: string }[] }): number | null {
  const format = seconds(probe.format?.duration);
  if (format !== null) return format;
  const streams = (probe.streams ?? []).map((s) => seconds(s.duration)).filter((n): n is number => n !== null);
  return streams.length > 0 ? Math.max(...streams) : null;
}

export type ProbeVerdict =
  | { ok: true; durationSeconds: number | null; hasAudio: boolean; videoIndex: number; audioIndex: number | null }
  | { ok: false; reason: "too_large" | "unsupported" };

/** The server's decision on what was uploaded — from ffprobe's reading and the object's own byte length, never from
 *  anything the client declared. ★ Length is not a reason to refuse (DEC-293 §3): `ffmpegArgs()` keeps the first 15 s. */
export function judgeProbe(probe: ProbeResult, byteSize: number): ProbeVerdict {
  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > STORY_VIDEO_MAX_BYTES) return { ok: false, reason: "too_large" };
  const picked = pickStreams(probe);
  if (!picked) return { ok: false, reason: "unsupported" };
  const { video, audioIndex } = picked;
  if ((video.width ?? 0) > STORY_VIDEO_MAX_DIMENSION || (video.height ?? 0) > STORY_VIDEO_MAX_DIMENSION) return { ok: false, reason: "unsupported" };
  return { ok: true, durationSeconds: durationFromProbe(probe), hasAudio: audioIndex !== null, videoIndex: video.index, audioIndex };
}

/** The one rendition, from the two streams `pickStreams()` chose (by absolute index). Autorotation is ffmpeg's
 *  default, so the display matrix is applied to the pixels and none is written; the scale keeps the aspect, the short
 *  side at most 720 px, both sides even. ★ `-t 15` is an INPUT option: the demuxer stops reading at 15.0 s, so a long
 *  4K source is never decoded past what is kept (DEC-293 §3). */
export function ffmpegArgs(demuxer: StoryVideoDemuxer, input: string, output: string, streams: { videoIndex: number; audioIndex: number | null }): string[] {
  const s = STORY_VIDEO_SHORT_SIDE;
  const hasAudio = streams.audioIndex !== null;
  return [
    "-hide_banner", "-nostdin", "-v", "error", "-y",
    "-protocol_whitelist", "file",
    "-f", demuxer,
    "-t", String(STORY_VIDEO_MAX_SECONDS),
    "-i", input,
    "-map", `0:${streams.videoIndex}`,
    ...(hasAudio ? ["-map", `0:${streams.audioIndex}`] : []),
    "-dn", "-sn",
    // `trunc(…/2)*2`: a source with an odd short side (719 px) would otherwise keep it, and libx264 refuses an odd
    // dimension in yuv420p. The other side is `-2`, which ffmpeg already rounds to even.
    "-vf", `scale='if(lte(iw,ih),trunc(min(${s},iw)/2)*2,-2)':'if(lte(iw,ih),-2,trunc(min(${s},ih)/2)*2)',format=yuv420p`,
    "-fpsmax", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-level:v", "4.0",
    "-crf", "23", "-maxrate", "2500k", "-bufsize", "5000k",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000"] : ["-an"]),
    "-map_metadata", "-1",
    "-map_metadata:s:v", "-1",
    ...(hasAudio ? ["-map_metadata:s:a", "-1"] : []),
    "-map_chapters", "-1",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", ...(hasAudio ? ["-flags:a", "+bitexact"] : []),
    "-write_tmcd", "0",
    "-movflags", "+faststart",
    "-threads", "2",
    output,
  ];
}

/** One poster frame from the STRIPPED rendition — never the source — as PNG, for cwebp to make WebP. Not the first
 *  frame: a phone's first frames are often dark while the exposure settles, and a black poster reads as a broken
 *  video. From `min(1 s, d/4)` the `thumbnail` filter picks, of the next ~1 s of frames, the one closest to their
 *  average — a frame representative of the shot rather than a fade or a flash. Fewer frames than that (a very short
 *  clip) and it picks from those it has. */
export const POSTER_SAMPLE_FRAMES = 30;
export function posterArgs(rendition: string, output: string, durationSeconds: number): string[] {
  const at = Math.max(0, Math.min(1, durationSeconds / 4));
  return [
    "-hide_banner", "-nostdin", "-v", "error", "-y",
    "-protocol_whitelist", "file",
    "-ss", at.toFixed(3),
    "-f", "mp4",
    "-i", rendition,
    "-vf", `thumbnail=${POSTER_SAMPLE_FRAMES}`,
    "-frames:v", "1",
    "-f", "image2", "-c:v", "png",
    output,
  ];
}

export function cwebpPosterArgs(input: string, output: string): string[] {
  return ["-quiet", "-q", "80", "-metadata", "none", input, "-o", output];
}

/** The output's tags must be the brand keys ffmpeg's MP4 muxer always writes and nothing else — the proof that no
 *  container tag survived (REQ-STO-016). Returns what is wrong, or null. */
export const ALLOWED_FORMAT_TAGS = new Set(["major_brand", "minor_version", "compatible_brands"]);
export interface RenditionProbe {
  format?: { duration?: string; tags?: Record<string, string> };
  streams?: { codec_type?: string; width?: number; height?: number; duration?: string; tags?: Record<string, string> }[];
  chapters?: unknown[];
}
export function auditRendition(probe: RenditionProbe): string | null {
  const formatTags = Object.keys(probe.format?.tags ?? {}).filter((k) => !ALLOWED_FORMAT_TAGS.has(k));
  if (formatTags.length > 0) return `format tags survived: ${formatTags.join(", ")}`;
  const streams = probe.streams ?? [];
  if (streams.filter((s) => s.codec_type === "video").length !== 1) return "not exactly one video stream";
  if (streams.filter((s) => s.codec_type === "audio").length > 1) return "more than one audio stream";
  const other = streams.filter((s) => s.codec_type !== "video" && s.codec_type !== "audio");
  if (other.length > 0) return `a ${other[0]!.codec_type ?? "data"} stream survived`;
  // A muxer's own per-stream bookkeeping (`language`, `handler_name`, `vendor_id`) is not a phone's, and neither is the
  // `encoder` ffprobe reads back from the sample description — OUR encoder, always `Lavc…` (libavcodec, ours, the
  // version dropped by `bitexact`). Any other key is the phone's, and so is an `encoder` that is not libavcodec's.
  const STREAM_KEYS = new Set(["language", "handler_name", "vendor_id"]);
  for (const s of streams) {
    const extra = Object.entries(s.tags ?? {})
      .filter(([k, v]) => !STREAM_KEYS.has(k) && !(k === "encoder" && /^Lavc/.test(v)))
      .map(([k]) => k);
    if (extra.length > 0) return `stream tags survived: ${extra.join(", ")}`;
  }
  if ((probe.chapters ?? []).length > 0) return "chapters survived";
  return null;
}

export function auditArgs(demuxer: "mp4" | StoryVideoDemuxer, input: string): string[] {
  return [
    "-v", "error", "-hide_banner", "-protocol_whitelist", "file", "-f", demuxer,
    "-show_entries", "format=duration:format_tags:stream=index,codec_type,codec_name,width,height:stream_tags",
    "-show_chapters",
    "-of", "json", "-i", input,
  ];
}

export class ToolTimeout extends Error {}

/** Spawns one of the image's binaries with a wall-clock limit; a timeout kills it with SIGKILL. */
export async function runTool(cmd: string, args: string[], timeoutMs: number, maxBuffer = 1024 * 1024): Promise<string> {
  try {
    const { stdout } = await execFileP(cmd, args, { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer });
    return stdout;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; killed?: boolean; signal?: string };
    if (err.code === "ENOENT") throw new Error(`content/video: ${cmd} is not installed — worker/Dockerfile installs ffmpeg and webp`);
    if (err.killed || err.signal === "SIGKILL") throw new ToolTimeout(`content/video: ${cmd} ran past ${timeoutMs} ms`);
    const detail = (err.stderr || err.message || "").toString().trim().split("\n").slice(-3).join(" | ");
    throw new Error(`content/video: ${cmd} failed: ${detail}`);
  }
}
