import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  FFMPEG_TIMEOUT_MS,
  FFPROBE_TIMEOUT_MS,
  auditArgs,
  auditRendition,
  durationFromProbe,
  ffmpegArgs,
  ffprobeArgs,
  judgeProbe,
  posterArgs,
  runTool,
  sniffVideoContainer,
  type ProbeResult,
} from "../../worker/src/content/video";

// ★ REQ-STO-016, DEC-248 §6 — the proof that NO container tag survives, against ffmpeg itself.
//
// The fixtures are made here, by ffmpeg, as a phone writes them: a QuickTime file carrying a location (both the
// `©xyz`-style `location` key and Apple's `com.apple.quicktime.location.ISO6709`), a make and a model, a creation time
// and a chapter. The 12-second one must come out as one MP4 with none of that left — not in its tags and not anywhere
// in its bytes; the 20-second one must be refused by ffprobe's reading.
//
// It needs the binaries, which the worker image has and a laptop may not: it runs inside the image
// (`docker run kareem-worker …`, the lead's CI step) and ★ FAILS rather than skips when `REQUIRE_FFMPEG=1`.

function has(cmd: string): boolean {
  try {
    execFileSync(cmd, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const runnable = has("ffmpeg") && has("ffprobe");
const required = process.env.REQUIRE_FFMPEG === "1";

const LATITUDE = "+24.7136";
const ISO6709 = `${LATITUDE}+046.6753+612.000/`;

describe.skipIf(!runnable && !required)("a phone's video, transcoded by the worker's own arguments", () => {
  const dir = mkdtempSync(join(tmpdir(), "story-strip-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function phoneVideo(name: string, seconds: number): string {
    const out = join(dir, name);
    const chapters = join(dir, `${name}.ffmeta`);
    execFileSync("sh", ["-c", `printf ';FFMETADATA1\\n[CHAPTER]\\nTIMEBASE=1/1000\\nSTART=0\\nEND=1000\\ntitle=رياض\\n' > '${chapters}'`]);
    execFileSync("ffmpeg", [
      "-hide_banner", "-v", "error", "-y",
      "-f", "lavfi", "-i", `testsrc=size=1080x1920:rate=30:duration=${seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
      "-i", chapters, "-map_metadata", "2", "-map_chapters", "2",
      "-map", "0:v", "-map", "1:a",
      "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
      "-metadata", `location=${ISO6709}`,
      "-metadata", `com.apple.quicktime.location.ISO6709=${ISO6709}`,
      "-metadata", "com.apple.quicktime.make=Apple",
      "-metadata", "com.apple.quicktime.model=iPhone 15",
      "-metadata", "creation_time=2026-10-05T18:33:00Z",
      "-metadata:s:v", "rotate=90",
      "-movflags", "use_metadata_tags",
      "-f", "mov", out,
    ]);
    return out;
  }

  it("the fixture really carries what a phone writes — or the test proves nothing", () => {
    const src = phoneVideo("tagged.mov", 2);
    const bytes = readFileSync(src).toString("latin1");
    expect(bytes).toContain(LATITUDE);
    expect(bytes).toContain("iPhone");
  });

  it("transcodes 12 seconds into one MP4 with no tag, no chapter, no data track and no location in its bytes", async () => {
    const src = phoneVideo("twelve.mov", 12);
    const head = new Uint8Array(readFileSync(src).subarray(0, 128));
    const demuxer = sniffVideoContainer(head)!;
    const probe = JSON.parse(await runTool("ffprobe", ffprobeArgs(demuxer, src), FFPROBE_TIMEOUT_MS)) as ProbeResult;
    const verdict = judgeProbe(probe, readFileSync(src).byteLength);
    if (!verdict.ok) throw new Error(`refused: ${verdict.reason}`);

    const out = join(dir, "video.mp4");
    await runTool("ffmpeg", ffmpegArgs(demuxer, src, out, verdict), FFMPEG_TIMEOUT_MS);
    const audit = JSON.parse(await runTool("ffprobe", auditArgs("mp4", out), FFPROBE_TIMEOUT_MS));
    expect(auditRendition(audit)).toBeNull();

    const rendered = readFileSync(out).toString("latin1");
    for (const needle of [LATITUDE, "ISO6709", "iPhone", "Apple", "2026-10-05"]) expect(rendered).not.toContain(needle);
    // The short side is at most 720 px, the rotation applied to the pixels rather than written as a tag.
    const video = (audit.streams as { codec_type: string; width: number; height: number }[]).find((s) => s.codec_type === "video")!;
    expect(Math.min(video.width, video.height)).toBeLessThanOrEqual(720);
  }, 180_000);

  // ★ notes/story-media.md §2.1 — the two defects production met, against the binaries.
  function make(name: string, args: string[]): string {
    const out = join(dir, name);
    execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args, out]);
    return out;
  }
  async function measure(src: string) {
    const demuxer = sniffVideoContainer(new Uint8Array(readFileSync(src).subarray(0, 128)))!;
    const probe = JSON.parse(await runTool("ffprobe", ffprobeArgs(demuxer, src), FFPROBE_TIMEOUT_MS)) as ProbeResult;
    return { demuxer, probe, verdict: judgeProbe(probe, readFileSync(src).byteLength) };
  }
  async function transcode(src: string, name: string) {
    const { demuxer, verdict } = await measure(src);
    if (!verdict.ok) throw new Error(`refused: ${verdict.reason}`);
    const out = join(dir, name);
    await runTool("ffmpeg", ffmpegArgs(demuxer, src, out, verdict), FFMPEG_TIMEOUT_MS);
    const audit = JSON.parse(await runTool("ffprobe", auditArgs("mp4", out), FFPROBE_TIMEOUT_MS));
    return { verdict, audit, out };
  }

  // ★ DEC-295 §3 — a longer video keeps its first 15 seconds; it is never refused for its length.
  it("keeps the FIRST 15.0 s of a 40-second video — red for 20 s, then blue: the rendition ends red", async () => {
    const src = make("forty.mov", [
      "-f", "lavfi", "-i", "color=red:size=640x360:rate=30:duration=20",
      "-f", "lavfi", "-i", "color=blue:size=640x360:rate=30:duration=20",
      "-f", "lavfi", "-i", "sine=duration=40",
      "-filter_complex", "[0][1]concat=n=2:v=1[v]", "-map", "[v]", "-map", "2:a",
      "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
      "-metadata", `location=${ISO6709}`, "-movflags", "use_metadata_tags", "-f", "mov",
    ]);
    const { verdict, audit, out } = await transcode(src, "forty.mp4");
    expect(verdict.ok && verdict.durationSeconds).toBeCloseTo(40, 0);
    const kept = durationFromProbe(audit)!;
    expect(kept).toBeGreaterThan(14.9);
    expect(kept).toBeLessThanOrEqual(15.05);
    expect(auditRendition(audit)).toBeNull();
    expect(readFileSync(out).toString("latin1")).not.toContain(LATITUDE);
    // The rendition's LAST frame, as one RGB pixel: red (the source's 0 – 20 s), never blue (20 – 40 s).
    const px = execFileSync("ffmpeg", ["-v", "error", "-sseof", "-0.2", "-i", out, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    expect(px[0]).toBeGreaterThan(150);
    expect(px[2]).toBeLessThan(100);
  }, 240_000);

  it("accepts a WebM that carries no duration (as MediaRecorder writes it) — 20 s live WebM kept as its first 15 s", async () => {
    const src = make("live-20.webm", ["-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=20", "-c:v", "libvpx", "-deadline", "realtime", "-live", "1", "-f", "webm"]);
    const { verdict, audit } = await transcode(src, "live-20.mp4");
    expect(verdict.ok && verdict.durationSeconds).toBeNull();
    expect(durationFromProbe(audit)).toBeLessThanOrEqual(15.05);
    expect(durationFromProbe(audit)).toBeGreaterThan(14.9);
  }, 180_000);

  it("cuts a poster that is not the black first second", async () => {
    const src = make("dark-start.mp4", [
      "-f", "lavfi", "-i", "color=black:size=720x1280:rate=30:duration=1.5",
      "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=2.5",
      "-filter_complex", "[0][1]concat=n=2:v=1[v]", "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast",
    ]);
    const png = join(dir, "poster.png");
    await runTool("ffmpeg", posterArgs(src, png, 4), FFMPEG_TIMEOUT_MS);
    const yavg = Number(await runTool("ffprobe", ["-v", "error", "-f", "lavfi", "-i", `movie=${png},signalstats`, "-show_entries", "frame_tags=lavfi.signalstats.YAVG", "-of", "csv=p=0"], FFPROBE_TIMEOUT_MS));
    expect(yavg).toBeGreaterThan(40);
  }, 180_000);
});
