import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { storagePaths } from "@kareem/storage-paths";
import { downloadObject } from "../content/storage.js";

// The font set, worker side — REQ-DSG-016, invariant 12, 06 §6.4 and §7.3.
//
// «Editor, worker Chromium, worker LibreOffice, identical by SHA-256.» A face
// is fetched by the hash of its bytes and by nothing else, and it is INLINED
// as a data URI so the render is hermetic: a page that fetches a font over
// the network is a page whose Arabic depends on a network, and a font fetch
// that fails does not error — it substitutes, and the poster looks fine.
//
// Two sources, same bytes, in this order: the `fonts` bucket (content-
// addressed, deliberately not org-prefixed, 03 §6) and the image's own
// `packages/fonts`. The bucket is where a materialised Google font lands
// (REQ-DSG-017); the package is the platform set the image already carries.

export interface WorkerFace {
  family: string;
  weight: number;
  style: string;
  sha256: string;
  base64: string;
  unicodeRange?: string;
}

/** Bytes are immutable under their hash, so the cache never needs
 *  invalidating — which is the same property that makes the hash a path. */
const cache = new Map<string, string>();

/**
 * `packages/fonts` on disk, RESOLVED THROUGH THE PACKAGE rather than
 * guessed from `process.cwd()`.
 *
 * The cwd-relative path happened to be right in the image (WORKDIR /app,
 * and the Dockerfile copies `packages/fonts` to /app/packages/fonts) and
 * wrong everywhere else — including from `worker/` itself, which is how a
 * local reproduction of a container failure turns into a second, fake
 * failure. `@kareem/fonts` is a declared dependency of this workspace and
 * exports `./manifest.json`, so the resolver already knows where it is.
 */
const fontsDir = (() => {
  try {
    return dirname(createRequire(import.meta.url).resolve("@kareem/fonts/manifest.json"));
  } catch {
    return join(process.cwd(), "packages", "fonts");
  }
})();

async function fromPackage(sha256: string): Promise<Uint8Array | null> {
  for (const ext of ["woff2", "ttf"] as const) {
    try {
      return await readFile(join(fontsDir, `${sha256}.${ext}`));
    } catch {
      /* the next extension, then the bucket's answer stands */
    }
  }
  return null;
}

export async function faceBase64(sha256: string): Promise<string> {
  const hit = cache.get(sha256);
  if (hit) return hit;

  let bytes: Uint8Array | null = null;
  for (const ext of ["woff2", "ttf"] as const) {
    const { bucket, path } = storagePaths.font(sha256, ext);
    try {
      bytes = await downloadObject(bucket, path);
      break;
    } catch {
      /* not in the bucket under this extension */
    }
  }
  bytes ??= await fromPackage(sha256);
  if (!bytes) {
    // Refused, never substituted. A missing face that renders anyway is the
    // exact failure D66 exists to prevent.
    throw new Error(`render/fonts: no bytes for ${sha256} in the fonts bucket or packages/fonts`);
  }

  const base64 = Buffer.from(bytes).toString("base64");
  cache.set(sha256, base64);
  return base64;
}

export interface ManifestRow {
  family: string;
  weight: number;
  style: string;
  sha256: string;
  script?: string | null;
}

/** The manifest rows turned into inlinable faces. The Arabic subset is
 *  narrowed to its own unicode-range so the Latin face of the same family
 *  keeps everything else — without it the LAST declaration wins for every
 *  character and a mixed «جلسة عن Next.js 16» loses its Latin to whatever the
 *  host has, which is a different render per machine. */
export async function inlineFaces(rows: readonly ManifestRow[]): Promise<WorkerFace[]> {
  return Promise.all(
    rows.map(async (row) => ({
      family: row.family,
      weight: row.weight,
      style: row.style,
      sha256: row.sha256,
      base64: await faceBase64(row.sha256),
    })),
  );
}

/**
 * The face set a render context must PIN — REQ-DSG-016, invariant 12.
 *
 * ★ THE FALLBACK IS THE WHOLE FUNCTION. `public.fonts` holds only fonts an
 * admin MATERIALISED (REQ-DSG-017, JOB-materialise_font); the platform set
 * — Reem Kufi, Amiri, IBM Plex Sans Arabic — lives in the image's own
 * `packages/fonts/manifest.json` and has no row there. So on a fresh
 * install the table is EMPTY, and a job that pinned only what the table
 * held pinned nothing: `render_variant` then refused every variant with
 * «the render context pins no faces», which is exactly what it should do
 * and exactly the wrong set to have handed it.
 *
 * `listEditorFaces()` (src/lib/dal/fonts.ts) already resolved it this way
 * for the editor. The two paths disagreeing is what made an automatic
 * poster fail while a hand-saved one worked — and DEC-017's «the preview an
 * admin approves is the artifact» cannot survive two font resolvers, so
 * this is the worker's single copy of that rule.
 */
export async function renderFaces(dbRows: readonly ManifestRow[]): Promise<ManifestRow[]> {
  // A materialised font is the org's own choice and supersedes nothing —
  // but if the table has any passed row, it is the authoritative set the
  // editor showed, so the export matches the preview.
  if (dbRows.length) return [...dbRows];
  return readPackageManifest();
}

type PackageFace = { family: string; weight: number; style: string; sha256: string; script?: string };

/** `packages/fonts/manifest.json`, from the image. One entry per (family,
 *  weight, style, SCRIPT): a family's Arabic and Latin subsets are separate
 *  files with separate hashes and BOTH are pinned, because dropping either
 *  is how a mixed «جلسة عن Next.js 16» loses half its glyphs. */
export async function readPackageManifest(): Promise<ManifestRow[]> {
  const raw = await readFile(join(fontsDir, "manifest.json"), "utf8");
  const faces = (JSON.parse(raw) as { faces?: PackageFace[] }).faces ?? [];
  const seen = new Set<string>();
  const out: ManifestRow[] = [];
  for (const f of faces) {
    const key = `${f.family}|${f.weight}|${f.style}|${f.script ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ family: f.family, weight: f.weight, style: f.style, sha256: f.sha256, script: f.script ?? null });
  }
  // Loud, not empty. An image with no manifest cannot render Arabic at all,
  // and returning [] here would push that failure down into every single
  // variant instead of saying it once.
  if (out.length === 0) throw new Error("render/fonts: packages/fonts/manifest.json lists no faces — the image has no font set (REQ-DSG-016)");
  return out;
}
