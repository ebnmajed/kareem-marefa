// REQ-DSG-016, invariant 12 — the render context must PIN a face set, and
// the platform set is not in `public.fonts`.
//
// This is the regression test for the bug that failed every variant of the
// M6 demonstrable's first sentence. `public.fonts` holds only fonts an
// admin materialised (JOB-materialise_font); Reem Kufi, Amiri and IBM Plex
// Sans Arabic live in the image's manifest and have no row there. On a
// fresh install the table is empty, so a job pinning only the table's rows
// pinned NOTHING, and `render_variant` correctly refused all thirteen
// artifacts with «the render context pins no faces».
//
// The editor's `listEditorFaces()` already fell back to the manifest. The
// two paths disagreeing is the actual defect: DEC-017 says the preview an
// admin approves IS the artifact, and that cannot hold with two font
// resolvers.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "test" };
});

describe("renderFaces", () => {
  it("★ an EMPTY fonts table falls back to the image's manifest, never to an empty set", async () => {
    const { renderFaces } = await import("../../worker/src/render/fonts");
    const faces = await renderFaces([]);
    expect(faces.length).toBeGreaterThan(0);
    // The three the platform actually ships (06 §7.3): a display face for
    // poster headings, a serif for certificates, and the body face.
    const families = new Set(faces.map((f) => f.family));
    expect(families).toContain("Reem Kufi");
    expect(families).toContain("Amiri");
    expect(families).toContain("IBM Plex Sans Arabic");
  });

  it("★ BOTH scripts of a family are pinned — dropping either loses half of «جلسة عن Next.js 16»", async () => {
    const { renderFaces } = await import("../../worker/src/render/fonts");
    const faces = await renderFaces([]);
    const amiri = faces.filter((f) => f.family === "Amiri" && f.weight === 400 && f.style === "normal");
    expect(amiri.length).toBeGreaterThan(1);
    // Different subsets are different files, so they are different hashes.
    expect(new Set(amiri.map((f) => f.sha256)).size).toBe(amiri.length);
  });

  it("every pinned face carries a sha256 — the hash IS the identity (DEC-031)", async () => {
    const { renderFaces } = await import("../../worker/src/render/fonts");
    for (const f of await renderFaces([])) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a materialised set supersedes the manifest, so the export matches what the editor showed", async () => {
    const { renderFaces } = await import("../../worker/src/render/fonts");
    const row = { family: "Cairo", weight: 700, style: "normal", sha256: "a".repeat(64), script: "arabic" };
    expect(await renderFaces([row])).toEqual([row]);
  });
});
