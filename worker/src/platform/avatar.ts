import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { assertsNoExifRemains, sniffImageKind, stripImageMetadata } from "../content/exif.js";
import { withTempDir } from "../content/pdf.js";

// Google's photo, fetched once and turned into OUR copy — JOB-import_avatar's
// pipeline (11 §2.4; REQ-PRF-008, REQ-PRF-010; DEC-099, DEC-180 §3, DEC-181 §4,
// DEC-182). Every step here is a refusal the task can name.
//
// ★ THE SOURCE IS MEMBER-CONTROLLABLE. `members.avatar_url` is copied from
// `raw_user_meta_data` by `provision_member()` (0005:124), and a member can
// write their own metadata through `auth.updateUser()`. So the host allowlist
// below is the SSRF control — the only thing standing between a crafted URL
// and a worker holding `service_role` fetching whatever it names — together
// with `0004:243`'s `^https://` check, which stays (DEC-182). The list is exact
// hostnames, compared after `new URL()` has parsed them, and every redirect
// hop is held to the same list.
//
// ★ PNG OR JPEG IN, WEBP OUT, NEVER SVG (invariant 11, REQ-PRF-010). The bytes
// are sniffed on content by the content pipeline's own `sniffImageKind()` and
// stripped by its `stripImageMetadata()` — imported, never edited (DEC-099:
// «EXIF stripped exactly as session photos are»). `Accept` names JPEG and PNG
// only, so Google does not negotiate WebP on us; if it does anyway, the sniff
// refuses it (DEC-182).
//
// ★ DERIVATIVES ARE `cwebp`, a binary in worker/Dockerfile (DEC-181 §4) — no npm
// package. `-metadata none` is cwebp's default and is said anyway.

export const AVATAR_SOURCE_HOSTS: ReadonlySet<string> = new Set([
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
]);
/** Google's `picture` is normally 96 px; the size parameter asks for the larger derivative. */
export const AVATAR_SOURCE_SIZE = 192;
export const AVATAR_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_SOURCE_MAX_EDGE = 4096;
export const AVATAR_MAX_REDIRECTS = 2;
export const AVATAR_FETCH_TIMEOUT_MS = 10_000;
export const AVATAR_WEBP_QUALITY = 82;
export const AVATAR_DERIVATIVE_SIZES = [96, 192] as const;
export type AvatarDerivativeSize = (typeof AVATAR_DERIVATIVE_SIZES)[number];

/**
 * A permanent refusal: the task logs it and returns, because a retry would
 * fetch the same thing and refuse it the same way. Anything else thrown in
 * this file is transient (a 5xx, a timeout, a binary that failed) and is
 * rethrown for graphile-worker's retry.
 */
export class AvatarRefused extends Error {
  constructor(readonly reason: string) {
    super(`avatar refused: ${reason}`);
    this.name = "AvatarRefused";
  }
}

/** The parsed URL when it may be fetched at all, or null. */
export function allowedSource(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.port !== "") return null;
  if (!AVATAR_SOURCE_HOSTS.has(url.hostname)) return null;
  return url;
}

/** Google's trailing size parameter (`…=s96-c`) asks for `=s192-c`; anything else is left as it came. */
export function sizedSource(url: URL): URL {
  const next = new URL(url.href);
  next.pathname = next.pathname.replace(/=s[0-9]+(-c)?$/, `=s${AVATAR_SOURCE_SIZE}-c`);
  return next;
}

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** The source's bytes: allowlisted, at most two same-set redirects, capped on the header AND the stream. */
export async function fetchSource(raw: string, fetcher: Fetcher = fetch): Promise<Uint8Array> {
  const first = allowedSource(raw);
  if (!first) throw new AvatarRefused("host_not_allowed");
  let url = sizedSource(first);

  for (let hop = 0; ; hop += 1) {
    const res = await fetcher(url.href, {
      method: "GET",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      credentials: "omit",
      headers: { accept: "image/jpeg, image/png", "user-agent": "kareem-marefa-avatar-import" },
      signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => undefined);
      if (hop >= AVATAR_MAX_REDIRECTS) throw new AvatarRefused("too_many_redirects");
      const location = res.headers.get("location");
      if (!location) throw new AvatarRefused("redirect_without_location");
      let target: string;
      try {
        target = new URL(location, url).href;
      } catch {
        throw new AvatarRefused("redirect_off_host");
      }
      const next = allowedSource(target);
      if (!next) throw new AvatarRefused("redirect_off_host");
      url = next;
      continue;
    }
    if (res.status >= 500 || res.status === 429) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`avatar source answered ${res.status}`); // transient: retried
    }
    if (res.status !== 200) {
      await res.body?.cancel().catch(() => undefined);
      throw new AvatarRefused(`http_${res.status}`);
    }
    return readCapped(res);
  }
}

async function readCapped(res: Response): Promise<Uint8Array> {
  const declared = res.headers.get("content-length");
  if (declared !== null && Number(declared) > AVATAR_SOURCE_MAX_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw new AvatarRefused("too_many_bytes");
  }
  if (!res.body) throw new AvatarRefused("empty");

  // The header can be absent or lie; the stream is what is counted.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > AVATAR_SOURCE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new AvatarRefused("too_many_bytes");
    }
    chunks.push(value);
  }
  if (total === 0) throw new AvatarRefused("empty");
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export interface InspectedSource {
  kind: "jpeg" | "png";
  /** The stripped bytes — the only ones any binary ever sees. */
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Sniffed on content, EXIF stripped and proven gone, dimensions bounded before cwebp sees a byte. */
export function inspectSource(bytes: Uint8Array): InspectedSource {
  const kind = sniffImageKind(bytes);
  if (kind !== "jpeg" && kind !== "png") throw new AvatarRefused(`kind_${kind}`);

  let stripped;
  try {
    stripped = stripImageMetadata(bytes, kind);
  } catch {
    throw new AvatarRefused("malformed");
  }
  if (!assertsNoExifRemains(stripped.bytes)) throw new AvatarRefused("metadata_remains");

  const { width, height } = stripped;
  if (!width || !height) throw new AvatarRefused("no_dimensions");
  if (width > AVATAR_SOURCE_MAX_EDGE || height > AVATAR_SOURCE_MAX_EDGE) throw new AvatarRefused("too_many_pixels");
  return { kind, bytes: stripped.bytes, width, height };
}

/** The centred square an avatar shows — Google's `-c` is already square, so this is usually the whole frame. */
export function squareCrop(width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.min(width, height);
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side };
}

export type ToolRunner = (cmd: string, args: string[]) => Promise<void>;

const execFileP = promisify(execFile);

async function runTool(cmd: string, args: string[]): Promise<void> {
  try {
    await execFileP(cmd, args, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") throw new Error(`platform/avatar: ${cmd} is not installed — worker/Dockerfile installs webp`);
    throw new Error(`platform/avatar: ${cmd} failed: ${(err.stderr || err.message || "").toString().trim().split("\n").slice(-2).join(" | ")}`);
  }
}

/** 96 and 192 px WebP, square, through cwebp. Each output is sniffed as WebP before it is returned. */
export async function renderDerivatives(
  source: InspectedSource,
  run: ToolRunner = runTool,
): Promise<Record<AvatarDerivativeSize, Uint8Array>> {
  const { x, y, side } = squareCrop(source.width, source.height);
  return withTempDir("avatar-", async (dir) => {
    const input = join(dir, source.kind === "png" ? "source.png" : "source.jpg");
    await writeFile(input, source.bytes);
    const out = {} as Record<AvatarDerivativeSize, Uint8Array>;
    for (const size of AVATAR_DERIVATIVE_SIZES) {
      const target = join(dir, `${size}.webp`);
      await run("cwebp", [
        "-quiet",
        "-metadata", "none",
        "-q", String(AVATAR_WEBP_QUALITY),
        "-crop", String(x), String(y), String(side), String(side),
        "-resize", String(size), String(size),
        input,
        "-o", target,
      ]);
      const bytes = new Uint8Array(await readFile(target));
      if (sniffImageKind(bytes) !== "webp") throw new Error(`platform/avatar: cwebp wrote something that is not WebP at ${size} px`);
      out[size] = bytes;
    }
    return out;
  });
}
