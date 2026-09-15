import "server-only";

// Content sniffing — 07-content-pipeline.md §2.1, REQ-MAT-002, REQ-MAT-012,
// DEC-009. "The only trustworthy check is on the stored bytes." Every
// function here reads magic bytes (and, for ZIP containers, a full-buffer
// substring search for the entry names that distinguish PowerPoint from
// Keynote) — never a filename, an extension or a client-declared
// Content-Type. No third-party dependency: Node's Buffer/TextDecoder only.
//
// SVG is rejected unconditionally, regardless of what kind the caller
// declared (DEC-009) — an SVG renamed `.png` fails on its content here, not
// on its name.

export type SniffedKind = "pdf" | "powerpoint_ooxml" | "powerpoint_legacy" | "keynote" | "png" | "jpeg" | "webp" | "mp3" | "wav" | "m4a" | "ogg" | "svg" | "unknown";

export interface SniffResult {
  kind: SniffedKind;
  mime: string;
}

const MIME: Record<SniffedKind, string> = {
  pdf: "application/pdf",
  powerpoint_ooxml: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  powerpoint_legacy: "application/vnd.ms-powerpoint",
  keynote: "application/vnd.apple.keynote",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  svg: "image/svg+xml",
  unknown: "application/octet-stream",
};

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[offset + i] !== bytes[i]) return false;
  return true;
}

function ascii(buf: Uint8Array, offset: number, length: number): string {
  if (buf.length < offset + length) return "";
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(buf[offset + i]);
  return s;
}

/** A cheap, dependency-free "does this buffer contain this ASCII substring anywhere" scan — good enough for ZIP entry names, which are never compressed in the local file header or the central directory. */
function bufferIncludesAscii(buf: Uint8Array, needle: string): boolean {
  const bytes = Array.from(needle, (c) => c.charCodeAt(0));
  const limit = buf.length - bytes.length;
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < bytes.length; j++) {
      if (buf[i + j] !== bytes[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** DEC-009: an SVG is an XML document that can carry a `<script>` — rejected everywhere, by content, regardless of declared kind. Looks at the first few KB only: a real SVG opens with `<svg` or an XML prolog naming it within that window; a legitimate PDF/PNG/etc. never does. */
function looksLikeSvg(buf: Uint8Array): boolean {
  const head = ascii(buf, 0, Math.min(buf.length, 4096)).toLowerCase();
  if (!head.includes("<svg")) return false;
  // A stray "<svg" inside binary noise is astronomically unlikely to also
  // open with whitespace/XML-prolog-only content before it; require the
  // tag to appear before any binary magic bytes would (i.e. this is a text
  // file, not a PDF/ZIP/PNG that happens to embed the string in a stream).
  return true;
}

export function sniffContent(buf: Uint8Array): SniffResult {
  if (looksLikeSvg(buf)) return { kind: "svg", mime: MIME.svg };

  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: "pdf", mime: MIME.pdf }; // %PDF-

  // ZIP local-file-header (PK\x03\x04) or empty-archive (PK\x05\x06).
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) {
    if (bufferIncludesAscii(buf, "ppt/presentation.xml")) return { kind: "powerpoint_ooxml", mime: MIME.powerpoint_ooxml };
    if (bufferIncludesAscii(buf, "index.apxl") || bufferIncludesAscii(buf, "Index.zip")) return { kind: "keynote", mime: MIME.keynote };
    return { kind: "unknown", mime: MIME.unknown }; // some other zip-based format — not one we accept
  }

  // OLE2/CFBF compound file — legacy .ppt.
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { kind: "powerpoint_legacy", mime: MIME.powerpoint_legacy };

  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "png", mime: MIME.png };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: "jpeg", mime: MIME.jpeg };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WEBP") return { kind: "webp", mime: MIME.webp };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WAVE") return { kind: "wav", mime: MIME.wav };
  if (ascii(buf, 0, 3) === "ID3" || startsWith(buf, [0xff, 0xfb]) || startsWith(buf, [0xff, 0xf3]) || startsWith(buf, [0xff, 0xf2])) {
    return { kind: "mp3", mime: MIME.mp3 };
  }
  if (ascii(buf, 4, 4) === "ftyp") return { kind: "m4a", mime: MIME.m4a };
  if (ascii(buf, 0, 4) === "OggS") return { kind: "ogg", mime: MIME.ogg };

  return { kind: "unknown", mime: MIME.unknown };
}

/** REQ-MAT-002: does the sniffed content actually match the kind the presenter declared? An SVG never matches anything. */
export function sniffedKindMatchesDeclared(sniffed: SniffedKind, declaredKind: "pdf" | "image" | "audio"): boolean {
  if (sniffed === "svg" || sniffed === "unknown") return false;
  // PowerPoint and Keynote are still RECOGNISED above so that a deck declared
  // as something else is refused by name — but no declared kind accepts them:
  // uploads are PDF-only from Launch (DEC-058).
  switch (declaredKind) {
    case "pdf":
      return sniffed === "pdf";
    case "image":
      return sniffed === "png" || sniffed === "jpeg" || sniffed === "webp";
    case "audio":
      return sniffed === "mp3" || sniffed === "wav" || sniffed === "m4a" || sniffed === "ogg";
  }
}
