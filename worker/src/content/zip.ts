import { execFile } from "node:child_process";
import { promisify } from "node:util";

// The album's zip, IN the worker image — REQ-ADM-021, DEC-181 §4, DEC-182.
//
// Debian's `zip` (Info-ZIP 3.0), installed by worker/Dockerfile beside poppler
// and cwebp. Not an npm dependency: `worker/package.json` stays `pg`,
// `graphile-worker` and `puppeteer-core`, and the owner ruled that image and
// archive work uses the image's binaries (DEC-181 §4).
//
// `execFile`, never a shell, so no file name is ever interpreted. The flags:
//   -q  quiet;
//   -X  no extra attributes — no uid/gid, no extended timestamps: the zip
//       carries the photographs and nothing about the machine that built it;
//   -0  store, do not deflate — JPEG, PNG and WebP are already compressed, and
//       deflating them again costs CPU for a few bytes;
//   -j  junk the temp directory's path, so each entry is its bare file name.

const execFileP = promisify(execFile);

/** Generous for one part (at most `PHOTO_ALBUM_PART_BYTES`, 45 MiB by default) stored, not deflated. */
const ZIP_TIMEOUT_MS = 60_000;

export const ZIP_ARGS = ["-q", "-X", "-0", "-j"] as const;

/** Writes `output` holding `files` (absolute paths), in the order given. */
export async function zipFiles(output: string, files: string[]): Promise<void> {
  if (files.length === 0) throw new Error("content/zip: nothing to zip");
  try {
    await execFileP("zip", [...ZIP_ARGS, output, ...files], { timeout: ZIP_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    if (err.code === "ENOENT") throw new Error("content/zip: zip is not installed — worker/Dockerfile installs zip");
    const detail = (err.stderr || err.stdout || err.message || "").toString().trim().split("\n").slice(-3).join(" | ");
    throw new Error(`content/zip: zip failed: ${detail}`);
  }
}
