import { execFile } from "node:child_process";
import { promisify } from "node:util";

// An attendee's story video, IN the worker image — REQ-STO-016, DEC-248 §6, DEC-181.
//
// `ffmpeg` and `ffprobe` are Debian's own package, installed by worker/Dockerfile (the lead's) beside poppler, webp
// and zip. No npm package touches the bytes: this file spawns the binaries as pdf.ts spawns pdftoppm.
//
// ★ THREE RULES THIS FILE EXISTS TO HOLD.
//   1. The server decides the limits — 15 seconds and 60 MB — from `ffprobe`'s reading of the bytes that landed,
//      never from the client's word.
//   2. Nothing a phone wrote into the container survives. A phone's video carries its GPS position in its container
//      exactly as a photograph carries it in EXIF (REQ-EVT-011): `-map_metadata -1` drops the global tags, the
//      per-stream `-map_metadata:s:* -1` the stream tags, `-map_chapters -1` the chapters, and the EXPLICIT maps with
//      `-dn -sn` drop every other track — an iPhone also writes its location into a separate timed-metadata track
//      (`mebx`), which a tag strip alone would carry straight across.
//   3. An uploaded file is never allowed to choose its own parser. The container is sniffed here from its first bytes,
//      the demuxer is then FORCED with `-f`, and only the `file` protocol is whitelisted — so a playlist, a concat
//      script or an image sequence posing as a video can never make the worker fetch a URL or read another file.

const execFileP = promisify(execFile);

/** REQ-STO-016 — named once. The capture stops at 15.0 s; one frame of container rounding is tolerated. */
export const STORY_VIDEO_MAX_SECONDS = 15;
export const STORY_VIDEO_TOLERANCE_SECONDS = 0.1;
/** 60 MB — the same figure as the `story-media` bucket's `file_size_limit` (0198), which refuses the PUT at the edge. */
export const STORY_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
/** The rendition: at most 720 px on the short side, 30 fps, 2.5 Mbit/s video, 128 kbit/s audio — ≈ 5 MB for 15 s. */
export const STORY_VIDEO_SHORT_SIDE = 720;
export const STORY_VIDEO_MAX_DIMENSION = 4096;
export const FFPROBE_TIMEOUT_MS = 15_000;
export const FFMPEG_TIMEOUT_MS = 120_000;
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

export const VIDEO_CODECS = new Set(["h264", "hevc", "vp8", "vp9", "av1"]);
export const AUDIO_CODECS = new Set(["aac", "opus", "vorbis", "mp3"]);

export type ProbeVerdict =
  | { ok: true; durationSeconds: number; hasAudio: boolean }
  | { ok: false; reason: "too_long" | "too_large" | "unsupported" };

/** The server's decision on what was uploaded — from ffprobe's reading and the object's own byte length, never from
 *  anything the client declared. */
export function judgeProbe(probe: ProbeResult, byteSize: number): ProbeVerdict {
  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > STORY_VIDEO_MAX_BYTES) return { ok: false, reason: "too_large" };
  const streams = probe.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  if (!video || !video.codec_name || !VIDEO_CODECS.has(video.codec_name)) return { ok: false, reason: "unsupported" };
  if ((video.width ?? 0) > STORY_VIDEO_MAX_DIMENSION || (video.height ?? 0) > STORY_VIDEO_MAX_DIMENSION) return { ok: false, reason: "unsupported" };
  const audio = streams.find((s) => s.codec_type === "audio");
  if (audio && (!audio.codec_name || !AUDIO_CODECS.has(audio.codec_name))) return { ok: false, reason: "unsupported" };
  const duration = Number(probe.format?.duration ?? video.duration);
  if (!Number.isFinite(duration) || duration <= 0) return { ok: false, reason: "unsupported" };
  if (duration > STORY_VIDEO_MAX_SECONDS + STORY_VIDEO_TOLERANCE_SECONDS) return { ok: false, reason: "too_long" };
  return { ok: true, durationSeconds: duration, hasAudio: !!audio };
}

/** The one rendition. Autorotation is ffmpeg's default, so the display matrix is applied to the pixels and none is
 *  written; the scale keeps the aspect, the short side at most 720 px, both sides even. */
export function ffmpegArgs(demuxer: StoryVideoDemuxer, input: string, output: string, hasAudio: boolean): string[] {
  const s = STORY_VIDEO_SHORT_SIDE;
  return [
    "-hide_banner", "-nostdin", "-v", "error", "-y",
    "-protocol_whitelist", "file",
    "-f", demuxer,
    "-i", input,
    "-map", "0:v:0",
    ...(hasAudio ? ["-map", "0:a:0"] : []),
    "-dn", "-sn",
    "-t", String(STORY_VIDEO_MAX_SECONDS + STORY_VIDEO_TOLERANCE_SECONDS),
    "-vf", `scale='if(lte(iw,ih),min(${s},iw),-2)':'if(lte(iw,ih),-2,min(${s},ih))',format=yuv420p`,
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

/** One poster frame from the STRIPPED rendition — never the source — as PNG, for cwebp to make WebP. */
export function posterArgs(rendition: string, output: string, durationSeconds: number): string[] {
  const at = Math.max(0, Math.min(0.5, durationSeconds / 2));
  return [
    "-hide_banner", "-nostdin", "-v", "error", "-y",
    "-protocol_whitelist", "file",
    "-f", "mp4",
    "-i", rendition,
    "-ss", at.toFixed(3),
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
  streams?: { codec_type?: string; width?: number; height?: number; tags?: Record<string, string> }[];
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
  // A muxer's own per-stream bookkeeping (`language`, `handler_name`, `vendor_id`) is not a phone's; any other key is.
  const STREAM_KEYS = new Set(["language", "handler_name", "vendor_id"]);
  for (const s of streams) {
    const extra = Object.keys(s.tags ?? {}).filter((k) => !STREAM_KEYS.has(k));
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
export async function runTool(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  try {
    const { stdout } = await execFileP(cmd, args, { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 });
    return stdout;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; killed?: boolean; signal?: string };
    if (err.code === "ENOENT") throw new Error(`content/video: ${cmd} is not installed — worker/Dockerfile installs ffmpeg and webp`);
    if (err.killed || err.signal === "SIGKILL") throw new ToolTimeout(`content/video: ${cmd} ran past ${timeoutMs} ms`);
    const detail = (err.stderr || err.message || "").toString().trim().split("\n").slice(-3).join(" | ");
    throw new Error(`content/video: ${cmd} failed: ${detail}`);
  }
}
