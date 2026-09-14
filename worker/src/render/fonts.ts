import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

async function fromPackage(sha256: string): Promise<Uint8Array | null> {
  for (const ext of ["woff2", "ttf"] as const) {
    try {
      return await readFile(join(process.cwd(), "packages", "fonts", `${sha256}.${ext}`));
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
