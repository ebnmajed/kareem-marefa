// JOB-import_avatar's pipeline — worker/src/platform/avatar.ts (REQ-PRF-008,
// REQ-PRF-010; DEC-099, DEC-181 §4, DEC-182). No network, no cwebp: a fake
// fetch stands in for Google and a fake runner for the binary. Fixtures are
// container-level, as in storage-exif.test.ts — the strip never decodes pixels.
import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  AVATAR_SOURCE_MAX_BYTES,
  AvatarRefused,
  allowedSource,
  fetchSource,
  inspectSource,
  renderDerivatives,
  sizedSource,
  squareCrop,
  type Fetcher,
} from "../../worker/src/platform/avatar";

function bytes(...parts: (number[] | Uint8Array | string)[]): Uint8Array {
  const arrays = parts.map((p) => (typeof p === "string" ? Uint8Array.from(p, (c) => c.charCodeAt(0)) : p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];

/** A well-formed JPEG container with an EXIF segment and a SOF0 of `w`×`h`. */
function jpeg(w = 96, h = 96): Uint8Array {
  const app1Exif = bytes([0xff, 0xe1], u16be(2 + 6 + 8), "Exif\0\0", [0, 0, 0, 0, 0, 0, 0, 0]);
  const sof0 = bytes([0xff, 0xc0], u16be(17), [8], u16be(h), u16be(w), [3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const sos = bytes([0xff, 0xda], u16be(12), [3, 1, 0, 2, 17, 3, 17, 0, 63, 0]);
  return bytes([0xff, 0xd8], app1Exif, sof0, sos, [0xaa, 0xbb], [0xff, 0xd9]);
}
const WEBP = bytes("RIFF", [4, 0, 0, 0], "WEBP");
const SOURCE = "https://lh3.googleusercontent.com/a/ACg8ocTEST=s96-c";

function response(status: number, body: Uint8Array | null, headers: Record<string, string> = {}): Response {
  return new Response(body ? new Blob([body as BlobPart]) : null, { status, headers });
}

describe("allowedSource — the SSRF control (the source is member-controllable)", () => {
  it.each([
    ["https://lh3.googleusercontent.com/a/x=s96-c", true],
    ["https://lh6.googleusercontent.com/a/x", true],
    ["http://lh3.googleusercontent.com/a/x", false],
    ["https://lh7.googleusercontent.com/a/x", false],
    ["https://lh3.googleusercontent.com.evil.example/a/x", false],
    ["https://evil.example/lh3.googleusercontent.com", false],
    ["https://user:pw@lh3.googleusercontent.com/a/x", false],
    ["https://lh3.googleusercontent.com:8443/a/x", false],
    ["https://169.254.169.254/latest/meta-data", false],
    ["not a url", false],
  ])("%s → %s", (raw, ok) => {
    expect(allowedSource(raw) !== null).toBe(ok);
  });

  it("asks Google for 192 px by its own size parameter, and leaves a URL without one alone", () => {
    expect(sizedSource(new URL(SOURCE)).href).toBe("https://lh3.googleusercontent.com/a/ACg8ocTEST=s192-c");
    expect(sizedSource(new URL("https://lh3.googleusercontent.com/a/x=s400")).href).toBe("https://lh3.googleusercontent.com/a/x=s192-c");
    expect(sizedSource(new URL("https://lh3.googleusercontent.com/a/x")).href).toBe("https://lh3.googleusercontent.com/a/x");
  });
});

describe("fetchSource", () => {
  it("fetches the sized URL with manual redirects, JPEG/PNG only in Accept, and no referrer", async () => {
    const fetcher = vi.fn<Fetcher>(async () => response(200, jpeg()));
    const got = await fetchSource(SOURCE, fetcher);
    expect(got.byteLength).toBe(jpeg().byteLength);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://lh3.googleusercontent.com/a/ACg8ocTEST=s192-c");
    expect(init.redirect).toBe("manual");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect((init.headers as Record<string, string>).accept).toBe("image/jpeg, image/png");
  });

  it("refuses a host that is not Google's before any request", async () => {
    const fetcher = vi.fn<Fetcher>();
    await expect(fetchSource("https://evil.example/a.jpg", fetcher)).rejects.toMatchObject({ reason: "host_not_allowed" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("follows a redirect inside the host set, and refuses one off it", async () => {
    const inside = vi.fn<Fetcher>()
      .mockResolvedValueOnce(response(302, null, { location: "https://lh5.googleusercontent.com/a/y" }))
      .mockResolvedValueOnce(response(200, jpeg()));
    await expect(fetchSource(SOURCE, inside)).resolves.toBeInstanceOf(Uint8Array);

    const off = vi.fn<Fetcher>().mockResolvedValueOnce(response(302, null, { location: "http://169.254.169.254/" }));
    await expect(fetchSource(SOURCE, off)).rejects.toMatchObject({ reason: "redirect_off_host" });
    expect(off).toHaveBeenCalledTimes(1);
  });

  it("refuses a third redirect", async () => {
    const loop = vi.fn<Fetcher>(async () => response(302, null, { location: "https://lh4.googleusercontent.com/a/z" }));
    await expect(fetchSource(SOURCE, loop)).rejects.toMatchObject({ reason: "too_many_redirects" });
    expect(loop).toHaveBeenCalledTimes(3);
  });

  it("a 404 is permanent; a 503 is transient and rethrown for the retry", async () => {
    await expect(fetchSource(SOURCE, async () => response(404, null))).rejects.toMatchObject({ reason: "http_404" });
    const transient = fetchSource(SOURCE, async () => response(503, null));
    await expect(transient).rejects.toThrow(/503/);
    await expect(transient).rejects.not.toBeInstanceOf(AvatarRefused);
  });

  it("caps the bytes on the header AND on the stream, so a lying content-length does not get past it", async () => {
    const big = new Uint8Array(AVATAR_SOURCE_MAX_BYTES + 1);
    await expect(fetchSource(SOURCE, async () => response(200, jpeg(), { "content-length": String(AVATAR_SOURCE_MAX_BYTES + 1) }))).rejects.toMatchObject({
      reason: "too_many_bytes",
    });
    await expect(fetchSource(SOURCE, async () => response(200, big, { "content-length": "10" }))).rejects.toMatchObject({ reason: "too_many_bytes" });
  });
});

describe("inspectSource — sniffed on content, EXIF stripped and proven gone", () => {
  it("a JPEG passes with its EXIF removed and its dimensions read", () => {
    const got = inspectSource(jpeg(120, 96));
    expect(got).toMatchObject({ kind: "jpeg", width: 120, height: 96 });
    expect(Buffer.from(got.bytes).toString("latin1")).not.toContain("Exif");
  });

  it.each([
    ["an SVG named .png", bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'), "kind_svg"],
    ["WebP (DEC-182: PNG or JPEG in)", WEBP, "kind_webp"],
    ["unknown bytes", bytes("hello"), "kind_unknown"],
  ])("refuses %s", (_label, input, reason) => {
    expect(() => inspectSource(input)).toThrow(expect.objectContaining({ reason }));
  });

  it("refuses more than 4096 px on a side before any binary sees it", () => {
    expect(() => inspectSource(jpeg(5000, 96))).toThrow(expect.objectContaining({ reason: "too_many_pixels" }));
  });
});

describe("renderDerivatives — cwebp, square, 96 and 192", () => {
  it("crops the centred square and asks for each size, returning only WebP", async () => {
    const calls: string[][] = [];
    const run = async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      await writeFile(args[args.indexOf("-o") + 1], WEBP);
    };
    const out = await renderDerivatives({ kind: "jpeg", bytes: jpeg(120, 96), width: 120, height: 96 }, run);
    expect(Object.keys(out).sort()).toEqual(["192", "96"]);
    expect(calls).toHaveLength(2);
    for (const [i, size] of [96, 192].entries()) {
      const args = calls[i];
      expect(args[0]).toBe("cwebp");
      expect(args.slice(args.indexOf("-crop"), args.indexOf("-crop") + 5)).toEqual(["-crop", "12", "0", "96", "96"]);
      expect(args.slice(args.indexOf("-resize"), args.indexOf("-resize") + 3)).toEqual(["-resize", String(size), String(size)]);
      expect(args).toContain("-metadata");
    }
  });

  it("refuses output that is not WebP", async () => {
    const run = async (_cmd: string, args: string[]) => writeFile(args[args.indexOf("-o") + 1], jpeg());
    await expect(renderDerivatives({ kind: "jpeg", bytes: jpeg(), width: 96, height: 96 }, run)).rejects.toThrow(/not WebP/);
  });

  it("squareCrop centres the shorter side", () => {
    expect(squareCrop(96, 96)).toEqual({ x: 0, y: 0, side: 96 });
    expect(squareCrop(100, 200)).toEqual({ x: 0, y: 50, side: 100 });
  });
});
