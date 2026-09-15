import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// PDF inspection and page rendering, IN the worker image — 07 §4, DEC-058.
//
// Uploads are PDF-only from Launch (DEC-058, superseding D26's PowerPoint and
// Keynote items and DEC-032's credential-free converter). With LibreOffice
// gone there is no hostile parser left to isolate: poppler reads the PDF the
// presenter uploaded, and the worker — which already holds `service_role`
// for every other job — runs it here rather than shipping bytes to a second
// service through signed URLs. The four CLI tools this file shells out to
// are installed by worker/Dockerfile: pdfinfo, pdffonts, pdftoppm (poppler)
// and cwebp (libwebp). None is an npm dependency; worker/package.json stays
// `pg`, `graphile-worker` and `puppeteer-core`.
//
// The numbers are 07 §4.5's, verbatim, and they are what the parity suite's
// fourth path (scripts/parity/poppler.mjs) reproduces: a page image is WebP
// at quality 82 with a 1600 px long edge, a thumbnail quality 70 at 320 px.

const execFileP = promisify(execFile);

export const PAGE_LONG_EDGE = 1600;
export const THUMB_LONG_EDGE = 320;
export const PAGE_QUALITY = 82;
export const THUMB_QUALITY = 70;
const TOOL_TIMEOUT_MS = 60_000;

async function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileP(cmd, args, { cwd, timeout: TOOL_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    if (err.code === "ENOENT") throw new Error(`content/pdf: ${cmd} is not installed — worker/Dockerfile installs poppler-utils and webp`);
    const detail = (err.stderr || err.stdout || err.message || "").toString().trim().split("\n").slice(-3).join(" | ");
    throw new Error(`content/pdf: ${cmd} failed: ${detail}`);
  }
}

/** The five bytes every PDF starts with. The Route Handler already sniffed
 *  the upload (REQ-MAT-012); this is the worker refusing to hand poppler
 *  anything else, whatever the row says. */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/** A temp directory that is always removed, whatever `fn` does. */
export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface PdfFont {
  name: string;
  embedded: boolean;
}

export interface PdfInfo {
  pages: number;
  /** Every page's size in points, index 0 = page 1. */
  sizes: { width: number; height: number }[];
  fonts: PdfFont[];
}

/** Page count, per-page sizes and the font table, from `pdfinfo` and `pdffonts`. */
export async function inspectPdf(pdfPath: string): Promise<PdfInfo> {
  const { stdout: info } = await run("pdfinfo", [pdfPath]);
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  if (!Number.isInteger(pages) || pages < 1) throw new Error("content/pdf: the PDF has no pages");

  // `pdfinfo -f 1 -l N` prints one `Page N size:` line per page; a
  // single-page file prints `Page size:` instead.
  const { stdout: perPage } = await run("pdfinfo", ["-f", "1", "-l", String(pages), pdfPath]);
  const sizes: { width: number; height: number }[] = [];
  for (let n = 1; n <= pages; n++) {
    const m =
      perPage.match(new RegExp(`^Page\\s+${n}\\s+size:\\s+([\\d.]+) x ([\\d.]+)`, "m")) ??
      (pages === 1 ? perPage.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m) : null);
    sizes.push(m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1, height: 1 });
  }

  return { pages, sizes, fonts: parsePdfFonts((await run("pdffonts", [pdfPath])).stdout) };
}

/** `pdffonts`' table: two header lines, then one row per font whose last
 *  five columns are `emb sub uni objectID gen`. The name is the first token
 *  (a PostScript name never contains a space) with any subset tag stripped. */
export function parsePdfFonts(stdout: string): PdfFont[] {
  const fonts: PdfFont[] = [];
  for (const line of stdout.split("\n").slice(2)) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 6) continue;
    const emb = tokens[tokens.length - 5];
    if (emb !== "yes" && emb !== "no") continue;
    const name = tokens[0].replace(/^[A-Z]{6}\+/, "");
    if (!name || name === "[none]") continue;
    fonts.push({ name, embedded: emb === "yes" });
  }
  return fonts;
}

let installedFamilies: Set<string> | null = null;
/** Every family fontconfig knows in this image — the manifest's set, installed
 *  by worker/Dockerfile (REQ-DSG-016). Cached for the process. */
export async function fontsInstalled(): Promise<Set<string>> {
  if (installedFamilies) return installedFamilies;
  const { stdout } = await run("fc-list", [":", "family"]);
  const set = new Set<string>();
  for (const line of stdout.split("\n")) for (const fam of line.split(",")) if (fam.trim()) set.add(fam.trim());
  installedFamilies = set;
  return set;
}

/** REQ-MAT-011 for a PDF: a font the file names but does not EMBED is drawn
 *  with whatever fontconfig substitutes — for Arabic that changes the text,
 *  not only the look. Reported by name so the warning can say which; a
 *  non-embedded face the image actually has renders faithfully and is not
 *  a substitution. `pdffonts` prints PostScript names (`IBMPlexSansArabic-Bold`)
 *  and fontconfig prints families (`IBM Plex Sans Arabic`), so both are
 *  folded to lower case with no spaces or style suffix before comparing. */
export function substitutedFonts(fonts: PdfFont[], installed: Set<string>): string[] {
  const fold = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const families = new Set([...installed].map(fold));
  const out = new Set<string>();
  for (const f of fonts) {
    if (f.embedded) continue;
    if (!families.has(fold(f.name.split("-")[0]))) out.add(f.name);
  }
  return [...out].sort();
}

/** `pdftoppm -scale-to N` fits the page in an N×N box and rounds each axis
 *  independently, so a landscape page comes out 1601 wide. Pin the LONG edge
 *  exactly and let the other axis follow (-1). */
function scaleArgs(size: { width: number; height: number }, longEdge: number): string[] {
  const landscape = size.width >= size.height;
  return landscape ? ["-scale-to-x", String(longEdge), "-scale-to-y", "-1"] : ["-scale-to-x", "-1", "-scale-to-y", String(longEdge)];
}

export interface RenderedPage {
  webp: Uint8Array;
  width: number;
  height: number;
}

/** One page of the PDF as WebP at `longEdge`/`quality`, through pdftoppm's
 *  PNG and cwebp — the exact tool chain 07 §4.5 was specified against, so
 *  the committed slide-page goldens do not move (DEC-058). */
export async function renderPdfPage(pdfPath: string, workDir: string, n: number, size: { width: number; height: number }, longEdge: number, quality: number): Promise<RenderedPage> {
  const stem = join(workDir, `p${n}-${longEdge}`);
  await run("pdftoppm", ["-f", String(n), "-l", String(n), "-singlefile", "-png", ...scaleArgs(size, longEdge), pdfPath, stem]);
  const png = await readFile(`${stem}.png`);
  const webpPath = `${stem}.webp`;
  await run("cwebp", ["-quiet", "-q", String(quality), `${stem}.png`, "-o", webpPath]);
  const webp = await readFile(webpPath);
  await rm(`${stem}.png`, { force: true });
  await rm(webpPath, { force: true });
  return { webp: new Uint8Array(webp), ...pngDimensions(png) };
}

/** IHDR is the first chunk of every PNG: width and height are the eight
 *  big-endian bytes at offset 16. */
function pngDimensions(png: Buffer): { width: number; height: number } {
  if (png.length < 24) return { width: 0, height: 0 };
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Writes `bytes` under `dir` and returns the path — the one place the
 *  downloaded PDF touches disk. */
export async function stagePdf(dir: string, bytes: Uint8Array): Promise<string> {
  const path = join(dir, "input.pdf");
  await writeFile(path, bytes);
  return path;
}
