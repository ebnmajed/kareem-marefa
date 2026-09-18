import { z } from "zod";
import { compileEmailPreview } from "@/lib/dal/notifications";

// POST /api/admin/emails/preview — SCR-058's live preview (REQ-NTF-010,
// `16` §11.4, DEC-161, `04` §4).
//
// ★ «THERE IS EXACTLY ONE MAIL RENDERER; THE PREVIEW IS NOT A SECOND
// IMPLEMENTATION.» This handler calls `renderEmail()` from
// `@kareem/mail-runtime` — the same function the worker calls — over the same
// sample payloads `tests/unit/mail-pinned/` pins. So the message an admin
// approves is the message that ships, which is the discipline `DEC-017` bought
// for posters, one medium over.
//
// ★ A ROUTE HANDLER, AND A FORM POST — not a Server Action and not `srcdoc`.
//   · The iframe needs a URL, and the draft it previews is UNSAVED blocks,
//     which do not fit a query string. So the editor posts a form into a NAMED
//     sandboxed iframe (`<form method="post" target="mail-preview">`) and this
//     response is a real navigation, carrying its OWN headers (DEC-161, D2).
//   · Never `srcdoc` and never `blob:`. Both inherit the PARENT's CSP, and
//     every cell of a mail is an inline `style=` by constraint (`08` §3.1) —
//     so the moment `src/proxy.ts`'s report-only policy is enforced, a
//     `srcdoc` preview would render UNSTYLED and an admin would approve a
//     message that is not the one that ships. That is the exact failure
//     `16` §11.4 names.
//   · `/api/**` is outside `proxy.ts`'s matcher, so nothing else sets headers
//     here. This sets its own, including `sandbox`, so the document is
//     sandboxed even if someone opens it top-level.

export const runtime = "nodejs";

const previewInput = z.object({
  key: z.string().min(3).max(80),
  subject: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
  /** The editor's unsaved document, as JSON. Absent renders the string path. */
  blocks: z.string().max(200_000).optional(),
  mode: z.enum(["html", "text"]).default("html"),
});

/**
 * The preview's own policy. `default-src 'none'` because a mail loads nothing
 * of its own; `style-src 'unsafe-inline'` because inline CSS is what a mail IS;
 * `img-src` for the two URLs contract 8 permits, both same-origin, plus `data:`
 * which nothing emits today and which costs nothing to keep out.
 */
const PREVIEW_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "sandbox",
].join("; ");

function respond(body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      "content-security-policy": PREVIEW_CSP,
      // `SAMEORIGIN` and not `DENY`: our own editor frames this, and nobody
      // else may. `frame-ancestors 'self'` above says the same to a browser
      // that reads CSP; this is for the ones that read the header.
      "x-frame-options": "SAMEORIGIN",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  if (!form) return respond("bad_request", "text/plain; charset=utf-8", 400);

  const parsed = previewInput.safeParse({
    key: form.get("key"),
    subject: form.get("subject") ?? undefined,
    body: form.get("body") ?? undefined,
    blocks: form.get("blocks") ?? undefined,
    mode: form.get("mode") ?? undefined,
  });
  // Zod before anything else (CLAUDE.md), and a refusal that says nothing: a
  // preview is an admin surface and its errors belong on the screen, not in a
  // frame the admin is looking at for a message.
  if (!parsed.success) return respond("bad_request", "text/plain; charset=utf-8", 400);

  // The origin this request arrived on is the origin the preview's links use —
  // so a preview never shows `localhost` in production or a production URL in
  // development, and never a relative link a mail client cannot follow.
  const origin = new URL(request.url).origin;
  const preview = await compileEmailPreview("ar", { ...parsed.data, appUrl: origin });
  // Not an admin, or a key outside `08` §1: the same answer, because a preview
  // must not tell a non-admin which message keys exist.
  if (!preview) return respond("not_found", "text/plain; charset=utf-8", 404);

  return parsed.data.mode === "text"
    ? respond(preview.text, "text/plain; charset=utf-8")
    : respond(preview.html, "text/html; charset=utf-8");
}
