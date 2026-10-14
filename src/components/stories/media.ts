// The capture's media helpers — what a phone's camera, recorder and gallery hand us, made into something the server
// can take (REQ-STO-011, REQ-STO-016, DEC-248 §6). Plain functions, no React, so each is tested on its own. The server
// stays the authority on every limit (ffprobe decides 15 s and 60 MB); these are the fast, honest answer on the phone.

export const STORY_VIDEO_LIMIT_SECONDS = 15;
export const STORY_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
/** A recording shorter than this, or one that wrote no bytes, is a slip of the finger — never uploaded. */
export const STORY_VIDEO_MIN_SECONDS = 0.5;
/** A photograph's long edge after preparation: a story is a phone's screen, never a sensor's 12 MP. */
export const STORY_PHOTO_MAX_EDGE = 2048;

export type VideoExt = "mp4" | "mov" | "webm";
export type PhotoKind = "jpeg" | "png" | "webp";

/** The recorder's container, in order of preference. ★ Feature-detected, never guessed from the user agent:
 *  iOS Safari records MP4 only; Chrome records WebM everywhere and MP4 (H.264) from 126. H.264/AAC first because the
 *  worker's rendition is H.264/AAC; WebM before a bare «video/mp4», which in Chrome means Opus-in-MP4. */
export const RECORDER_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

export function pickRecorderType(isTypeSupported: ((type: string) => boolean) | undefined): string | undefined {
  if (!isTypeSupported) return undefined;
  for (const type of RECORDER_TYPES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // A browser that throws on a codec string it does not parse simply does not support it.
    }
  }
  return undefined;
}

/** The container from the bytes themselves — what the recorder actually wrote, never what it was asked for. */
export function sniffVideoExt(head: Uint8Array): VideoExt | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  if (head.length >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = String.fromCharCode(head[8]!, head[9]!, head[10]!, head[11]!);
    return brand === "qt  " ? "mov" : "mp4";
  }
  return null;
}

// The contract's table (story-media.md §1.2): QuickTime → mov; WebM and Matroska → webm; every other video → mp4.
const VIDEO_TYPE_EXT: Record<string, VideoExt> = {
  "video/mp4": "mp4",
  "video/x-m4v": "mp4",
  "video/3gpp": "mp4",
  "video/3gpp2": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "webm",
};
const PHOTO_TYPE_KIND: Record<string, PhotoKind> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

export function videoExtFromType(type: string): VideoExt | null {
  return VIDEO_TYPE_EXT[type.split(";")[0]!.trim().toLowerCase()] ?? null;
}

export function photoKindFromType(type: string): PhotoKind | null {
  return PHOTO_TYPE_KIND[type.split(";")[0]!.trim().toLowerCase()] ?? null;
}

/** By name when the browser gives no type — some Android galleries hand over a `.mov` or `.webm` with `type === ""`. */
export function videoExtFromName(name: string): VideoExt | null {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "mp4" || ext === "m4v" || ext === "3gp" ? "mp4" : ext === "mov" ? "mov" : ext === "webm" ? "webm" : null;
}

export async function readHead(blob: Blob, bytes = 16): Promise<Uint8Array> {
  const slice = blob.slice(0, bytes);
  if (typeof slice.arrayBuffer === "function") return new Uint8Array(await slice.arrayBuffer());
  return new Uint8Array(
    await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(slice);
    }),
  );
}

/** A video's length in seconds, or NaN when the browser cannot say within `timeoutMs`. ★ A MediaRecorder WebM carries
 *  no duration and reports `Infinity` until it is seeked past its end — so it is seeked, and read again. */
export function videoDuration(blob: Blob, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    const url = URL.createObjectURL(blob);
    let settled = false;
    const done = (value: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.removeAttribute("src");
      el.load?.();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(Number.NaN), timeoutMs);
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) return done(el.duration);
      el.ontimeupdate = () => {
        el.ontimeupdate = null;
        done(Number.isFinite(el.duration) ? el.duration : Number.NaN);
      };
      try {
        el.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        done(Number.NaN);
      }
    };
    el.onerror = () => done(Number.NaN);
    el.src = url;
  });
}

/** A still from a video, as a JPEG blob, for the review and the «processing» tile — so neither is ever black (iOS
 *  paints nothing for a blob <video> until it plays). Null when the browser cannot decode it in time. */
export function videoPoster(blob: Blob, timeoutMs = 5000): Promise<Blob | null> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    const url = URL.createObjectURL(blob);
    let settled = false;
    const done = (value: Blob | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.removeAttribute("src");
      el.load?.();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    el.preload = "auto";
    el.muted = true;
    el.playsInline = true;
    el.onloadeddata = () => {
      try {
        el.currentTime = Math.min(0.1, Number.isFinite(el.duration) ? el.duration / 2 : 0.1);
      } catch {
        done(null);
      }
    };
    el.onseeked = () => {
      if (!el.videoWidth) return done(null);
      const canvas = document.createElement("canvas");
      canvas.width = el.videoWidth;
      canvas.height = el.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return done(null);
      ctx.drawImage(el, 0, 0);
      canvas.toBlob((b) => done(b), "image/jpeg", 0.8);
    };
    el.onerror = () => done(null);
    el.src = url;
  });
}

/** The size a photograph is drawn at: its long edge at most `maxEdge`, never enlarged. */
export function fitWithin(width: number, height: number, maxEdge = STORY_PHOTO_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A photograph re-drawn as a JPEG at a phone's size — upright (the orientation applied), and with no metadata,
 *  because a canvas carries none. The worker strips EXIF all the same (REQ-EVT-011); this is less to send and nothing
 *  to leak on the way. A browser that cannot decode the file hands back the original when it is a kind the album takes. */
export async function preparePhoto(blob: Blob, maxEdge = STORY_PHOTO_MAX_EDGE, timeoutMs = 8000): Promise<{ blob: Blob; kind: PhotoKind } | null> {
  const original = photoKindFromType(blob.type);
  const fallback = original ? { blob, kind: original } : null;
  // A decode that never finishes (a huge file on an old phone) is not allowed to hold the capture.
  return Promise.race([redraw(blob, maxEdge).then((out) => out ?? fallback), new Promise<typeof fallback>((r) => setTimeout(() => r(fallback), timeoutMs))]);
}

async function redraw(blob: Blob, maxEdge: number): Promise<{ blob: Blob; kind: PhotoKind } | null> {
  try {
    let source: CanvasImageSource & { width: number; height: number };
    let close = () => undefined as void;
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      source = bitmap;
      close = () => bitmap.close();
    } else {
      source = await loadImage(blob);
    }
    const size = fitWithin(source.width, source.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(source, 0, 0, size.width, size.height);
    close();
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (out && out.size > 0) return { blob: out, kind: "jpeg" };
  } catch {
    // The caller falls back to the original.
  }
  return null;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}
