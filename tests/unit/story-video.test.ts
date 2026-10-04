import { describe, expect, it } from "vitest";
import {
  STORY_VIDEO_MAX_BYTES,
  auditRendition,
  ffmpegArgs,
  ffprobeArgs,
  judgeProbe,
  posterArgs,
  sniffVideoContainer,
} from "../../worker/src/content/video";
import { storyCwebpArgs, storyResize } from "../../worker/src/content/story-derivative";

// REQ-STO-016, DEC-248 §6 — what the worker hands ffprobe and ffmpeg, without the binaries. The real strip is proven
// against ffmpeg itself in story-video-strip.test.ts, inside the worker image.

function bytes(...parts: (string | number[])[]): Uint8Array {
  const out: number[] = [];
  for (const p of parts) out.push(...(typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p));
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
}

describe("sniffVideoContainer — on content, never on the extension", () => {
  it("reads an MP4 and an iPhone MOV as the mov demuxer", () => {
    expect(sniffVideoContainer(bytes([0, 0, 0, 0x20], "ftypisom"))).toBe("mov");
    expect(sniffVideoContainer(bytes([0, 0, 0, 0x14], "ftypqt  "))).toBe("mov");
    expect(sniffVideoContainer(bytes([0, 0, 0, 0x08], "wide"))).toBe("mov");
  });
  it("reads WebM from MediaRecorder as matroska", () => {
    expect(sniffVideoContainer(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84], "webm"))).toBe("matroska");
  });
  it("refuses an image, an SVG, a playlist and an unknown brand", () => {
    expect(sniffVideoContainer(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(sniffVideoContainer(bytes("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(sniffVideoContainer(bytes("#EXTM3U\n#EXT-X-VERSION:3\n"))).toBeNull();
    expect(sniffVideoContainer(bytes([0, 0, 0, 0x20], "ftypheic"))).toBeNull();
  });
});

describe("ffprobe and ffmpeg never choose their own parser or protocol", () => {
  it("forces the demuxer and whitelists only the file protocol, for every invocation", () => {
    for (const args of [ffprobeArgs("mov", "/tmp/in"), ffmpegArgs("matroska", "/tmp/in", "/tmp/out.mp4", true), posterArgs("/tmp/out.mp4", "/tmp/p.png", 4)]) {
      expect(args[args.indexOf("-protocol_whitelist") + 1]).toBe("file");
      expect(args.indexOf("-f")).toBeGreaterThan(-1);
      expect(args.indexOf("-f")).toBeLessThan(args.indexOf("-i"));
    }
  });
});

describe("ffmpegArgs — one H.264/AAC MP4 with nothing of the phone left", () => {
  const args = ffmpegArgs("mov", "/tmp/in", "/tmp/out.mp4", true);
  const pair = (flag: string) => args[args.indexOf(flag) + 1];
  it("maps exactly one video and one audio stream and drops data and subtitles", () => {
    expect(args.filter((a) => a === "-map")).toHaveLength(2);
    expect(args).toContain("0:v:0");
    expect(args).toContain("0:a:0");
    expect(args).toContain("-dn");
    expect(args).toContain("-sn");
  });
  it("drops global and per-stream metadata and chapters, and writes no timecode track", () => {
    expect(pair("-map_metadata")).toBe("-1");
    expect(pair("-map_metadata:s:v")).toBe("-1");
    expect(pair("-map_metadata:s:a")).toBe("-1");
    expect(pair("-map_chapters")).toBe("-1");
    expect(pair("-write_tmcd")).toBe("0");
    expect(pair("-fflags")).toBe("+bitexact");
  });
  it("encodes H.264 + AAC under the ceilings, faststart, short side ≤ 720", () => {
    expect(pair("-c:v")).toBe("libx264");
    expect(pair("-c:a")).toBe("aac");
    expect(pair("-maxrate")).toBe("2500k");
    expect(pair("-fpsmax")).toBe("30");
    expect(pair("-movflags")).toBe("+faststart");
    expect(pair("-vf")).toContain("min(720,iw)");
    expect(pair("-t")).toBe("15.1");
  });
  it("without audio maps no audio and encodes none", () => {
    const silent = ffmpegArgs("mov", "/tmp/in", "/tmp/out.mp4", false);
    expect(silent).not.toContain("0:a:0");
    expect(silent).toContain("-an");
  });
});

describe("judgeProbe — the server decides, from the bytes", () => {
  const ok = { format: { duration: "12.0" }, streams: [{ index: 0, codec_type: "video", codec_name: "hevc", width: 1080, height: 1920 }, { index: 1, codec_type: "audio", codec_name: "aac" }] };
  it("passes 12 seconds", () => {
    expect(judgeProbe(ok, 20_000_000)).toEqual({ ok: true, durationSeconds: 12, hasAudio: true });
  });
  it("refuses 20 seconds, and 15.2 — over the one-frame tolerance", () => {
    expect(judgeProbe({ ...ok, format: { duration: "20.0" } }, 1_000)).toEqual({ ok: false, reason: "too_long" });
    expect(judgeProbe({ ...ok, format: { duration: "15.2" } }, 1_000)).toEqual({ ok: false, reason: "too_long" });
    expect(judgeProbe({ ...ok, format: { duration: "15.05" } }, 1_000).ok).toBe(true);
  });
  it("refuses over 60 MB by the object's own length", () => {
    expect(judgeProbe(ok, STORY_VIDEO_MAX_BYTES + 1)).toEqual({ ok: false, reason: "too_large" });
  });
  it("refuses no video stream, an unknown codec and a missing duration", () => {
    expect(judgeProbe({ format: { duration: "3" }, streams: [{ index: 0, codec_type: "audio", codec_name: "aac" }] }, 1).ok).toBe(false);
    expect(judgeProbe({ ...ok, streams: [{ index: 0, codec_type: "video", codec_name: "prores" }] }, 1)).toEqual({ ok: false, reason: "unsupported" });
    expect(judgeProbe({ streams: ok.streams }, 1)).toEqual({ ok: false, reason: "unsupported" });
  });
});

describe("auditRendition — the proof read back on every run", () => {
  const clean = { format: { tags: { major_brand: "isom", minor_version: "512", compatible_brands: "isomiso2avc1mp41" } }, streams: [{ codec_type: "video", tags: { language: "und", handler_name: "VideoHandler" } }, { codec_type: "audio" }], chapters: [] };
  it("accepts the muxer's own brand keys", () => {
    expect(auditRendition(clean)).toBeNull();
  });
  it("refuses a surviving location, device, creation time, data track or chapter", () => {
    expect(auditRendition({ ...clean, format: { tags: { ...clean.format.tags, location: "+24.7136+046.6753/" } } })).toMatch(/location/);
    expect(auditRendition({ ...clean, format: { tags: { "com.apple.quicktime.make": "Apple" } } })).toMatch(/apple/);
    expect(auditRendition({ ...clean, streams: [...clean.streams, { codec_type: "data" }] })).toMatch(/data/);
    expect(auditRendition({ ...clean, streams: [{ codec_type: "video", tags: { creation_time: "2026-10-05" } }] })).toMatch(/creation_time/);
    expect(auditRendition({ ...clean, chapters: [{}] })).toMatch(/chapters/);
  });
});

describe("the story derivative — 1080 px on the long side, never upscaled", () => {
  it("resizes by the long side and keeps the aspect", () => {
    expect(storyResize(4032, 3024)).toEqual([1080, 0]);
    expect(storyResize(3024, 4032)).toEqual([0, 1080]);
    expect(storyResize(800, 600)).toEqual([800, 0]);
  });
  it("writes no metadata", () => {
    expect(storyCwebpArgs("/a.jpg", "/b.webp", 4032, 3024)).toEqual(["-quiet", "-metadata", "none", "-q", "82", "-resize", "1080", "0", "/a.jpg", "-o", "/b.webp"]);
  });
});
