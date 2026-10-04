import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withTempDir } from "./pdf.js";
import { sniffImageKind, type ImageKind } from "./exif.js";
import { runTool } from "./video.js";

// A photograph's `story` derivative — 1080 px on the long side, WebP (`05-stories.md` «Data access», REQ-STO-012,
// DEC-251 §5). Made by `cwebp`, already in the image (DEC-181), from the STRIPPED bytes only — process_photo.ts calls
// this after the strip and never before. Never upscaled: a photograph smaller than 1080 px keeps its own size.
// `-metadata none` is cwebp's default and is said anyway.

export const STORY_LONG_EDGE = 1080;
export const STORY_QUALITY = 82;
const CWEBP_TIMEOUT_MS = 30_000;

const EXT: Record<ImageKind, string> = { jpeg: "jpg", png: "png", webp: "webp" };

/** `-resize W H` with 0 on the short side, so cwebp keeps the aspect. */
export function storyResize(width: number, height: number): [number, number] {
  if (width >= height) return [Math.min(STORY_LONG_EDGE, width), 0];
  return [0, Math.min(STORY_LONG_EDGE, height)];
}

export function storyCwebpArgs(input: string, output: string, width: number, height: number): string[] {
  const [w, h] = storyResize(width, height);
  return ["-quiet", "-metadata", "none", "-q", String(STORY_QUALITY), "-resize", String(w), String(h), input, "-o", output];
}

/** The derivative's bytes, or null when the photograph's size is unknown or cwebp fails — the photo then records
 *  without one and its frame falls back to the stripped original. A derivative never blocks the album. */
export async function renderStoryDerivative(stripped: Uint8Array, kind: ImageKind, width: number | null, height: number | null): Promise<Uint8Array | null> {
  if (!width || !height) return null;
  try {
    return await withTempDir("story-photo-", async (dir) => {
      const input = join(dir, `source.${EXT[kind]}`);
      const output = join(dir, "story.webp");
      await writeFile(input, stripped);
      await runTool("cwebp", storyCwebpArgs(input, output, width, height), CWEBP_TIMEOUT_MS);
      const bytes = new Uint8Array(await readFile(output));
      return sniffImageKind(bytes) === "webp" ? bytes : null;
    });
  } catch {
    return null;
  }
}
