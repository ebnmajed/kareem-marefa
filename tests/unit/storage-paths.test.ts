// The single storage path builder — 07-content-pipeline.md §3, 03-permissions-rls.md §6.
// Every shape must match what a storage.objects policy's `storage.foldername(name)`
// expects: [org_id, "sessions", session_id, ...] or [org_id, "design"/"exports", ...],
// and `fonts` deliberately has no org segment at all.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  designAssetPath,
  exportPath,
  fontPath,
  InvalidStoragePathError,
  materialPagePath,
  materialPageThumbnailPath,
  materialSourcePath,
  photoPath,
  storagePaths,
} from "@/lib/storage/paths";

const ORG = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";
const VERSION = "33333333-3333-3333-3333-333333333333";
const PHOTO = "44444444-4444-4444-4444-444444444444";
const ASSET = "55555555-5555-5555-5555-555555555555";
const DOCUMENT = "66666666-6666-6666-6666-666666666666";
const SHA = "a".repeat(64);

describe("materialSourcePath", () => {
  it("matches materials/{org}/sessions/{session}/materials/{version}/{filename}", () => {
    expect(materialSourcePath(ORG, SESSION, VERSION, "deck.pdf")).toBe(`${ORG}/sessions/${SESSION}/materials/${VERSION}/deck.pdf`);
  });

  it("rejects a filename that is actually a path (traversal)", () => {
    expect(() => materialSourcePath(ORG, SESSION, VERSION, "../../etc/passwd")).toThrow(InvalidStoragePathError);
    expect(() => materialSourcePath(ORG, SESSION, VERSION, "a/b.pdf")).toThrow(InvalidStoragePathError);
    expect(() => materialSourcePath(ORG, SESSION, VERSION, "..")).toThrow(InvalidStoragePathError);
    expect(() => materialSourcePath(ORG, SESSION, VERSION, "")).toThrow(InvalidStoragePathError);
  });

  it("rejects a non-UUID org, session or version — the first segment is what the prefix policy checks", () => {
    expect(() => materialSourcePath("not-a-uuid", SESSION, VERSION, "deck.pdf")).toThrow(InvalidStoragePathError);
    expect(() => materialSourcePath(ORG, "not-a-uuid", VERSION, "deck.pdf")).toThrow(InvalidStoragePathError);
    expect(() => materialSourcePath(ORG, SESSION, "not-a-uuid", "deck.pdf")).toThrow(InvalidStoragePathError);
  });

  it("rejects an org id that only looks close (extra segment smuggled via a slash-encoded value)", () => {
    expect(() => materialSourcePath(`${ORG}/${ORG}`, SESSION, VERSION, "deck.pdf")).toThrow(InvalidStoragePathError);
  });
});

describe("materialPagePath / materialPageThumbnailPath", () => {
  it("matches material-pages/{org}/sessions/{session}/pages/{version}/{n}.webp, and .../thumbs/{n}.webp", () => {
    expect(materialPagePath(ORG, SESSION, VERSION, 3)).toBe(`${ORG}/sessions/${SESSION}/pages/${VERSION}/3.webp`);
    expect(materialPageThumbnailPath(ORG, SESSION, VERSION, 3)).toBe(`${ORG}/sessions/${SESSION}/pages/${VERSION}/thumbs/3.webp`);
  });

  it("rejects a non-positive, non-integer or absurd page number", () => {
    expect(() => materialPagePath(ORG, SESSION, VERSION, 0)).toThrow(InvalidStoragePathError);
    expect(() => materialPagePath(ORG, SESSION, VERSION, -1)).toThrow(InvalidStoragePathError);
    expect(() => materialPagePath(ORG, SESSION, VERSION, 1.5)).toThrow(InvalidStoragePathError);
    expect(() => materialPagePath(ORG, SESSION, VERSION, 1_000_000)).toThrow(InvalidStoragePathError);
  });
});

describe("photoPath", () => {
  it("matches photos/{org}/sessions/{session}/photos/{photo_id}.webp", () => {
    expect(photoPath(ORG, SESSION, PHOTO)).toBe(`${ORG}/sessions/${SESSION}/photos/${PHOTO}.webp`);
  });

  it("rejects a non-UUID photo id", () => {
    expect(() => photoPath(ORG, SESSION, "'; drop table photos; --")).toThrow(InvalidStoragePathError);
  });

  it("★ DEC-047: takes the sniffed kind's own extension rather than always forcing .webp", () => {
    expect(photoPath(ORG, SESSION, PHOTO, "jpg")).toBe(`${ORG}/sessions/${SESSION}/photos/${PHOTO}.jpg`);
    expect(photoPath(ORG, SESSION, PHOTO, "png")).toBe(`${ORG}/sessions/${SESSION}/photos/${PHOTO}.png`);
  });
});

describe("designAssetPath", () => {
  it("matches design-assets/{org}/design/assets/{asset_id}.{ext}", () => {
    expect(designAssetPath(ORG, ASSET, "png")).toBe(`${ORG}/design/assets/${ASSET}.png`);
  });

  it("the extension parameter's type has no `svg` member — DEC-009 is a compile-time fact here; content sniffing (07 §2.1) is the runtime enforcement", () => {
    // @ts-expect-error — "svg" is not assignable to "png" | "jpg" | "webp"
    const build = () => designAssetPath(ORG, ASSET, "svg");
    expect(typeof build).toBe("function");
  });
});

describe("exportPath", () => {
  it("matches exports/{org}/exports/{document}/{preset}.{ext}", () => {
    expect(exportPath(ORG, DOCUMENT, "a3-portrait", "pdf")).toBe(`${ORG}/exports/${DOCUMENT}/a3-portrait.pdf`);
  });

  it("rejects a preset or extension carrying a path separator", () => {
    expect(() => exportPath(ORG, DOCUMENT, "../a3", "pdf")).toThrow(InvalidStoragePathError);
    expect(() => exportPath(ORG, DOCUMENT, "a3", "pdf/../x")).toThrow(InvalidStoragePathError);
  });
});

describe("fontPath", () => {
  it("matches {sha256}.{ext}, with no org segment at all (REQ-DSG-016)", () => {
    expect(fontPath(SHA, "woff2")).toBe(`${SHA}.woff2`);
    expect(fontPath(SHA.toUpperCase(), "ttf")).toBe(`${SHA}.ttf`); // lowercased, matching the content-address
  });

  it("rejects a hash that is not exactly 64 hex characters", () => {
    expect(() => fontPath("abc", "woff2")).toThrow(InvalidStoragePathError);
    expect(() => fontPath(`${SHA}00`, "woff2")).toThrow(InvalidStoragePathError);
  });
});

describe("storagePaths — the bucket+path pairs callers actually hand to Storage", () => {
  it("names the correct bucket for each shape", () => {
    expect(storagePaths.materialSource(ORG, SESSION, VERSION, "deck.pdf").bucket).toBe("materials");
    expect(storagePaths.materialPage(ORG, SESSION, VERSION, 1).bucket).toBe("material-pages");
    expect(storagePaths.materialPageThumbnail(ORG, SESSION, VERSION, 1).bucket).toBe("material-pages");
    expect(storagePaths.photo(ORG, SESSION, PHOTO).bucket).toBe("photos");
    expect(storagePaths.designAsset(ORG, ASSET, "png").bucket).toBe("design-assets");
    expect(storagePaths.export(ORG, DOCUMENT, "a3", "pdf").bucket).toBe("exports");
    expect(storagePaths.font(SHA, "woff2").bucket).toBe("fonts");
  });
});
