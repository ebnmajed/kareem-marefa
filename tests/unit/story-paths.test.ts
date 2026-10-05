import { describe, expect, it } from "vitest";
import {
  InvalidStoragePathError,
  photoStoryPath,
  storyFramePrefix,
  storyVideoPath,
  storyVideoPosterPath,
  storyVideoSourcePath,
} from "@kareem/storage-paths";

// REQ-STO-012, REQ-STO-016, DEC-248 §6 — the four story shapes from the one builder. No day in any path.
const ORG = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";

describe("photoStoryPath", () => {
  it("puts the derivative in a sub-folder whose file name is the photo id", () => {
    expect(photoStoryPath(ORG, SESSION, ID)).toBe(`${ORG}/sessions/${SESSION}/photos/story/${ID}.webp`);
  });
  it("strips to the photo id under 0156's rule — the file name minus its last extension", () => {
    const name = photoStoryPath(ORG, SESSION, ID).split("/").pop() as string;
    expect(name.replace(/\.[a-zA-Z0-9]+$/, "")).toBe(ID);
  });
  it("refuses a non-uuid", () => {
    expect(() => photoStoryPath(ORG, SESSION, "../x")).toThrow(InvalidStoragePathError);
  });
});

describe("story video paths", () => {
  it("builds the frame's prefix and its three objects", () => {
    const prefix = `${ORG}/sessions/${SESSION}/frames/${ID}`;
    expect(storyFramePrefix(ORG, SESSION, ID)).toBe(prefix);
    expect(storyVideoSourcePath(ORG, SESSION, ID, "mov")).toBe(`${prefix}/source.mov`);
    expect(storyVideoPath(ORG, SESSION, ID)).toBe(`${prefix}/video.mp4`);
    expect(storyVideoPosterPath(ORG, SESSION, ID)).toBe(`${prefix}/poster.webp`);
  });
  it("accepts only the three source extensions", () => {
    for (const ext of ["mp4", "mov", "webm"] as const) expect(storyVideoSourcePath(ORG, SESSION, ID, ext)).toMatch(new RegExp(`source\\.${ext}$`));
    expect(() => storyVideoSourcePath(ORG, SESSION, ID, "svg" as never)).toThrow(InvalidStoragePathError);
  });
  it("refuses an id that is not a uuid", () => {
    expect(() => storyVideoPath(ORG, "nope", ID)).toThrow(InvalidStoragePathError);
  });
});
