import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { storagePaths } from "@/lib/storage/paths";
import { sessionClient } from "@/lib/dal/session";

// The font set — REQ-DSG-016, invariant 12, 06 §7.3.
//
// «Editor, worker Chromium, worker LibreOffice, identical by SHA-256.» That
// is the whole of it: a face is addressed by the hash of its bytes and by
// nothing else, so a different font is a different URL rather than a silently
// different render. The editor never touches Google's CDN — its dynamically
// subset slices are not byte-stable, so the editor and the worker would fetch
// different bytes on different days and nothing would error (A39).
//
// TWO SOURCES, in this order, and the order is the point:
//
//   1. the `fonts` bucket, `fonts/{sha256}.woff2` — content-addressed and
//      deliberately NOT org-prefixed (03 §6, REQ-DSG-016). This is the source
//      of truth and the only one the worker uses.
//   2. `packages/fonts/` on disk — the repository's own manifest, which is
//      where the platform set lives until `JOB-materialise_font` seeds the
//      bucket (STORY-DSG-008). Read through `process.cwd()` rather than by
//      importing `@kareem/fonts`, which is not a declared dependency of the
//      app.
//
// Both paths serve the SAME BYTES, because `npm run fonts:check` is what
// gates the package and the hash is what names the object. The fallback is a
// different transport, never a different font.

const SHA256 = /^[0-9a-f]{64}$/;

export type FontBinary = { bytes: Uint8Array; contentType: "font/woff2" | "font/ttf"; source: "bucket" | "package" };

/** `true` for a well-formed SHA-256 and nothing else — the hash is a path
 *  segment in two different stores, so it is validated before either. */
export function isFontHash(value: string): boolean {
  return SHA256.test(value);
}

const CONTENT_TYPE = { woff2: "font/woff2", ttf: "font/ttf" } as const;

async function fromPackage(sha256: string): Promise<FontBinary | null> {
  for (const ext of ["woff2", "ttf"] as const) {
    try {
      return { bytes: await readFile(join(process.cwd(), "packages", "fonts", `${sha256}.${ext}`)), contentType: CONTENT_TYPE[ext], source: "package" };
    } catch {
      /* the next extension, then the caller's 404 */
    }
  }
  return null;
}

/**
 * The binary behind a hash, for `/api/fonts/[hash]`.
 *
 * The bucket read goes through the caller's own RLS-bound client, so
 * `fonts_storage_read` (0037) is the boundary — every authenticated member may
 * read a font, and nobody else may, which is exactly what an editor and a
 * signed-in preview need.
 */
export async function getFontBinary(locale: string, sha256: string): Promise<FontBinary | null> {
  if (!isFontHash(sha256)) return null;
  const { supabase } = await sessionClient(locale);

  for (const ext of ["woff2", "ttf"] as const) {
    const { bucket, path } = storagePaths.font(sha256, ext);
    const { data } = await supabase.storage.from(bucket).download(path);
    if (data) return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: CONTENT_TYPE[ext], source: "bucket" };
  }

  return fromPackage(sha256);
}

/** The faces the editor should declare, as the manifest lists them. Reads
 *  `ENT-fonts` first — it is the manifest by requirement — and falls back to
 *  the repository's own for the platform set before the bucket is seeded. */
export interface ManifestFace {
  family: string;
  weight: number;
  style: string;
  sha256: string;
  /** Which subset this file carries. Recorded, not turned into a
   *  `unicode-range`: see ARABIC_UNICODE_RANGE's comment — ranging one
   *  subset of a family sends the other's characters to a system font. */
  script?: string;
}

export async function listEditorFaces(locale: string): Promise<ManifestFace[]> {
  const { supabase } = await sessionClient(locale);
  const { data } = await supabase.from("fonts").select("family, weight, style, sha256, parity_status").order("family");

  // 06 §7.2: only a font whose goldens PASSED is usable. A pending one is
  // listed to the admin with its status, never loaded into a canvas that an
  // export is supposed to match.
  const rows = (data ?? []).filter((f) => f.parity_status === "passed");
  if (rows.length) {
    return rows.map((f) => ({ family: f.family as string, weight: f.weight as number, style: f.style as string, sha256: f.sha256 as string }));
  }

  return readPackageManifest();
}

type PackageFace = { family: string; weight: number; style: string; sha256: string; script?: string };

/** `packages/fonts/manifest.json`, read from disk. The package is the
 *  repository's ENT-fonts until the bucket is seeded (§2 above). */
export async function readPackageManifest(): Promise<ManifestFace[]> {
  try {
    const raw = await readFile(join(process.cwd(), "packages", "fonts", "manifest.json"), "utf8");
    const faces = (JSON.parse(raw) as { faces?: PackageFace[] }).faces ?? [];
    // The manifest lists one entry per (family, weight, style, SCRIPT): the
    // same family's Arabic and Latin subsets are different files with
    // different hashes. Both are kept, and the Arabic one is narrowed to the
    // Arabic range so the two do not overwrite each other.
    const seen = new Set<string>();
    const out: ManifestFace[] = [];
    for (const f of faces) {
      const key = `${f.family}|${f.weight}|${f.style}|${f.script ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        family: f.family,
        weight: f.weight,
        style: f.style,
        sha256: f.sha256,
      });
    }
    return out;
  } catch {
    return [];
  }
}
