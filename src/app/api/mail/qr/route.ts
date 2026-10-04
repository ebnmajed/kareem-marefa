import { encodeQr } from "@kareem/designer-runtime";
import { isQrPath } from "@kareem/mail-runtime";
import { qrPng } from "./png";

// GET /api/mail/qr?p=/ar/app/sessions/<uuid> — the PNG a mail's «رمز QR» block
// shows (wave 23, `REQ-NTF-015`, `DEC-238` §4).
//
// ★ PUBLIC, BECAUSE A MAIL CLIENT FETCHES WITH NO SESSION — and therefore
// NOT AN OPEN QR GENERATOR. It takes a PATH, never a URL and never caller
// text; the path must be one of our own pages (`isQrPath()`, the same rule the
// compiler used to build this URL); and what it encodes is THIS request's
// origin plus that path. Anything else is a 404 that says nothing.
//
// `src/proxy.ts`'s matcher excludes `api/`, so neither its sign-in check nor its
// CSP runs here — the same standing as `/api/brand/{orgId}/logo` and
// `/api/s/{id}/og`. The headers below are this route's own.

export const runtime = "nodejs";

function notFound(): Response {
  return new Response("not_found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get("p");
  if (!path || url.searchParams.size !== 1 || !isQrPath(path)) return notFound();

  let png: Uint8Array;
  try {
    png = qrPng(encodeQr(`${url.origin}${path}`, "M"));
  } catch {
    // A path that passed the allowlist always fits version 10; this is the
    // encoder refusing rather than truncating, which must never ship a half QR.
    return notFound();
  }

  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-length": String(png.byteLength),
      // The bytes are a pure function of origin and path, so they never change.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
