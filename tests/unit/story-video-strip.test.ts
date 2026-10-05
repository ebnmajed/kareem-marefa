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
  ffmpegArgs,
  ffprobeArgs,
  judgeProbe,
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

  it("refuses 20 seconds from ffprobe's reading", async () => {
    const src = phoneVideo("long.mov", 20);
    const head = new Uint8Array(readFileSync(src).subarray(0, 128));
    const demuxer = sniffVideoContainer(head);
    expect(demuxer).toBe("mov");
    const probe = JSON.parse(await runTool("ffprobe", ffprobeArgs(demuxer!, src), FFPROBE_TIMEOUT_MS)) as ProbeResult;
    expect(judgeProbe(probe, readFileSync(src).byteLength)).toEqual({ ok: false, reason: "too_long" });
  });

  it("transcodes 12 seconds into one MP4 with no tag, no chapter, no data track and no location in its bytes", async () => {
    const src = phoneVideo("twelve.mov", 12);
    const head = new Uint8Array(readFileSync(src).subarray(0, 128));
    const demuxer = sniffVideoContainer(head)!;
    const probe = JSON.parse(await runTool("ffprobe", ffprobeArgs(demuxer, src), FFPROBE_TIMEOUT_MS)) as ProbeResult;
    const verdict = judgeProbe(probe, readFileSync(src).byteLength);
    expect(verdict.ok).toBe(true);

    const out = join(dir, "video.mp4");
    await runTool("ffmpeg", ffmpegArgs(demuxer, src, out, true), FFMPEG_TIMEOUT_MS);
    const audit = JSON.parse(await runTool("ffprobe", auditArgs("mp4", out), FFPROBE_TIMEOUT_MS));
    expect(auditRendition(audit)).toBeNull();

    const rendered = readFileSync(out).toString("latin1");
    for (const needle of [LATITUDE, "ISO6709", "iPhone", "Apple", "2026-10-05"]) expect(rendered).not.toContain(needle);
    // The short side is at most 720 px, the rotation applied to the pixels rather than written as a tag.
    const video = (audit.streams as { codec_type: string; width: number; height: number }[]).find((s) => s.codec_type === "video")!;
    expect(Math.min(video.width, video.height)).toBeLessThanOrEqual(720);
  }, 180_000);
});
