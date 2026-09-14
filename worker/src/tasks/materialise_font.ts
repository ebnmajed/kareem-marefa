import type { Task } from "graphile-worker";
import { createHash } from "node:crypto";
import { advancesBatch, checkFontShaping, describeFontGate, FONT_GATE_TEXTS, fontFaceCss } from "@kareem/designer-runtime";
import { storagePaths } from "@kareem/storage-paths";
import { uploadObject } from "../content/storage.js";
import { withPage } from "../render/chromium.js";

// JOB-materialise_font — 11 §2.5, REQ-DSG-017, A39, DEC-007, 06 §7.2.
// Key `font:{family}:{style}:{weight}`, retry 3, queue `render`.
//
// ★ CHOOSE FREELY, THEN FREEZE. Five properties, each doing real work:
//
//   1. `subset=arabic` on the way in, so a family with no Arabic coverage
//      can never be chosen at all.
//   2. MATERIALISE, DON'T REFERENCE. The binary is downloaded once and
//      stored in our own bucket, because Google's dynamically subset slices
//      are NOT byte-stable — a CDN link would have the editor and the
//      worker fetch different bytes on different days with nothing
//      erroring, which is D66 broken invisibly.
//   3. The hash IS the name. A different font is a different path.
//   4. THE GATE DECIDES SELECTABILITY. A face with partial GSUB or mark
//      coverage renders Latin perfectly and silently breaks lam-alef and
//      stacked tashkeel; only the Arabic checks catch it.
//   5. A failure REPORTS WHICH CHECKS FAILED, so the admin gets an answer
//      rather than a refusal.

interface Payload {
  family: string;
  style: string;
  weight: number;
  org_id?: string;
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return !!v && typeof v.family === "string" && typeof v.style === "string" && typeof v.weight === "number";
}

/** The CSS API returns a stylesheet naming one URL per subset; asking as a
 *  modern browser gets woff2 rather than the legacy formats. */
const UA_WOFF2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function googleFontUrl(family: string, style: string, weight: number): Promise<string> {
  const spec = style === "italic" ? `ital,wght@1,${weight}` : `wght@${weight}`;
  // `subset=arabic` is property 1: a family with no Arabic coverage returns
  // no Arabic face and the job stops here rather than storing something
  // that would fail the gate later for a reason nobody could read.
  const css = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${spec}&subset=arabic&display=swap`;
  const response = await fetch(css, { headers: { "user-agent": UA_WOFF2 } });
  if (!response.ok) throw new Error(`materialise_font: Google returned ${response.status} for ${family} ${style} ${weight}`);
  const text = await response.text();
  const match = /src:\s*url\((https:\/\/[^)]+\.woff2)\)/.exec(text);
  if (!match?.[1]) {
    throw new Error(`materialise_font: no Arabic woff2 for ${family} ${style} ${weight} — the family has no Arabic subset`);
  }
  return match[1];
}

export const materialise_font: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`materialise_font: malformed payload ${JSON.stringify(payload)}`);
  const { family, style, weight } = payload;

  const url = await googleFontUrl(family, style, weight);
  const binary = await fetch(url);
  if (!binary.ok) throw new Error(`materialise_font: downloading ${url} returned ${binary.status}`);
  const bytes = new Uint8Array(await binary.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error(`materialise_font: ${family} came back as ${bytes.byteLength} bytes — not a font`);

  // Property 3: the hash is the name, so a different font is a different
  // path and two orgs asking for the same family share one object.
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { bucket, path } = storagePaths.font(sha256, "woff2");
  await uploadObject(bucket, path, bytes, "font/woff2");

  // ★ The gate. Rendered in the SAME Chromium the exports use, against the
  // SAME bytes that were just stored — a gate run against a different
  // engine or a CDN copy would be a gate on something else.
  const base64 = Buffer.from(bytes).toString("base64");
  const result = await withPage(600, 400, async (page) => {
    const css = fontFaceCss([{ family, weight, style, sha256, base64 }]);
    await page.setContent(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body></body></html>`, {
      waitUntil: "load",
    });
    await page.evaluate(
      async (f: string, w: number) => {
        await document.fonts.load(`${w} 40px "${f}"`);
        await document.fonts.ready;
      },
      family,
      weight,
    );
    const advances = (await page.evaluate(advancesBatch, { family, size: 40, texts: [...FONT_GATE_TEXTS] })) as number[];
    // The control: the same strings in a face that certainly does not
    // exist. Every check here is a COMPARISON, because a font nobody has
    // rendered before has no golden to be compared against.
    const fallback = (await page.evaluate(advancesBatch, { family: "NoSuchArabicFace", size: 40, texts: [...FONT_GATE_TEXTS] })) as number[];
    return checkFontShaping(advances, fallback);
  });

  await helpers.query(`select public.record_font($1, $2, $3, 'google', $4, $5, $6, $7, $8::jsonb, $9)`, [
    family,
    style,
    weight,
    path,
    sha256,
    ["arabic"],
    result.passed ? "passed" : "failed",
    JSON.stringify({ findings: result.findings, summary: describeFontGate(result) }),
    payload.org_id ?? null,
  ]);

  if (!result.passed) {
    // Recorded first, then thrown: the row is what tells the admin WHICH
    // checks failed, and a throw that rolled it back would leave them with
    // a font that is simply missing.
    helpers.logger.warn(`materialise_font: ${family} ${style} ${weight} failed the shaping gate — ${describeFontGate(result)}`);
    return;
  }

  helpers.logger.info(`materialise_font: ${family} ${style} ${weight} passed and is selectable (${sha256.slice(0, 12)})`);
};
