// GET /api/mail/qr — the PNG behind a mail's «رمز QR» (wave 23, `REQ-NTF-015`,
// `DEC-238` §4). Public by necessity, so the cases that matter are the
// refusals: it draws only OUR pages, from a path, never caller text.
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodeQr } from "@kareem/designer-runtime";
import { GET } from "@/app/api/mail/qr/route";
import { crc32, qrPng } from "@/app/api/mail/qr/png";

const ORIGIN = "https://app.kareem.example";
const PATH = "/ar/app/sessions/11111111-1111-4111-8111-111111111111";
const get = (query: string) => GET(new Request(`${ORIGIN}/api/mail/qr${query}`));

/** Reads back what `qrPng()` wrote: the chunks, their CRCs, and the pixels. */
function decode(png: Uint8Array) {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  const idat: Uint8Array[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    expect(view.getUint32(offset + 8 + length), `${type} crc`).toBe(crc32(png.subarray(offset + 4, offset + 8 + length)));
    if (type === "IHDR") {
      width = new DataView(data.buffer, data.byteOffset).getUint32(0);
      expect([...data.subarray(8)]).toEqual([1, 0, 0, 0, 0]);
    }
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil(width / 8);
  const dark = (x: number, y: number) => (raw[y * (stride + 1) + 1 + (x >> 3)]! & (0x80 >> (x & 7))) === 0;
  return { width, dark };
}

describe("the PNG", () => {
  it("is a valid 1-bit greyscale PNG whose modules are the encoder's, with a four-module quiet zone", () => {
    const matrix = encodeQr(`${ORIGIN}${PATH}`, "M");
    const { width, dark } = decode(qrPng(matrix, 8, 4));
    expect(width).toBe((matrix.size + 8) * 8);
    for (let my = 0; my < matrix.size; my++) {
      for (let mx = 0; mx < matrix.size; mx++) {
        expect(dark(mx * 8 + 32 + 4, my * 8 + 32 + 4)).toBe(matrix.dark[my * matrix.size + mx]);
      }
    }
    expect(dark(0, 0)).toBe(false); // the quiet zone is white
  });
});

describe("the route", () => {
  it("draws one of our pages: image/png, cached for ever, encoding origin + path", async () => {
    const response = await get(`?p=${encodeURIComponent(PATH)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes).toEqual(qrPng(encodeQr(`${ORIGIN}${PATH}`, "M")));
  });

  it.each([
    ["no path", ""],
    ["a URL rather than a path", `?p=${encodeURIComponent("https://evil.example/")}`],
    ["caller text", `?p=${encodeURIComponent("hello")}`],
    ["a page outside the allowlist", `?p=${encodeURIComponent("/ar/app/admin/members")}`],
    ["a protocol-relative path", `?p=${encodeURIComponent("//evil.example/ar/s/x")}`],
    ["an extra parameter", `?p=${encodeURIComponent(PATH)}&d=x`],
  ])("★ refuses %s with the same silent 404", async (_name, query) => {
    const response = await get(query);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toBe("image/png");
  });
});
