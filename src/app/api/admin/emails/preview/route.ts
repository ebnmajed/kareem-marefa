import { z } from "zod";
import { compileEmailPreview } from "@/lib/dal/notifications";
import { simulateForcedDark } from "./simulate";

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
  /** `dark` appends the forced-dark SIMULATION — see `./simulate.ts`. It is
   *  the one mode whose bytes are not what ships, and it is named everywhere
   *  it appears. */
  simulate: z.enum(["", "dark"]).optional(),
  /** Wave 23 — the builder's canvas: tokens for every binding, a `data-k` on every row, and a policy that lets the
   *  editor READ the frame's geometry (still no script). */
  editor: z.enum(["", "1"]).optional(),
  /** The canvas's tokens, binding → Arabic label, as JSON. The editor's own display words, shown to the admin alone. */
  tokens: z.string().max(4000).optional(),
  /** Wave 23 — «معاينة واختبار»: the org's real session's words. */
  session: z.enum(["", "real"]).optional(),
});

const tokenMap = z.record(z.string().max(80), z.string().max(80));

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

/**
 * ★ The canvas's policy differs in ONE token: `sandbox allow-same-origin`. The builder draws its selection over the
 * frame (the designer's pattern, DEC-017), so it must read where each row is — which an opaque origin forbids. Scripts
 * stay forbidden: `allow-same-origin` without `allow-scripts` lets the PARENT look in and lets nothing in the frame run.
 */
const EDITOR_CSP = PREVIEW_CSP.replace(/sandbox$/, "sandbox allow-same-origin");

function respond(body: string, contentType: string, status = 200, csp = PREVIEW_CSP): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      "content-security-policy": csp,
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
    simulate: form.get("simulate") ?? undefined,
    editor: form.get("editor") ?? undefined,
    tokens: form.get("tokens") ?? undefined,
    session: form.get("session") ?? undefined,
  });
  // Zod before anything else (CLAUDE.md), and a refusal that says nothing: a
  // preview is an admin surface and its errors belong on the screen, not in a
  // frame the admin is looking at for a message.
  if (!parsed.success) return respond("bad_request", "text/plain; charset=utf-8", 400);

  // The origin this request arrived on is the origin the preview's links use —
  // so a preview never shows `localhost` in production or a production URL in
  // development, and never a relative link a mail client cannot follow.
  const origin = new URL(request.url).origin;
  let tokens: Record<string, string> | undefined;
  if (parsed.data.tokens) {
    try {
      const read = tokenMap.safeParse(JSON.parse(parsed.data.tokens));
      tokens = read.success ? read.data : undefined;
    } catch {
      tokens = undefined;
    }
  }
  const editor = parsed.data.editor === "1";
  const preview = await compileEmailPreview("ar", {
    key: parsed.data.key,
    subject: parsed.data.subject,
    body: parsed.data.body,
    blocks: parsed.data.blocks,
    appUrl: origin,
    editor,
    tokens,
    realSession: parsed.data.session === "real",
  });
  // Not an admin, or a key outside `08` §1: the same answer, because a preview
  // must not tell a non-admin which message keys exist.
  if (!preview) return respond("not_found", "text/plain; charset=utf-8", 404);

  if (parsed.data.mode === "text") return respond(preview.text, "text/plain; charset=utf-8");
  const html = parsed.data.simulate === "dark" ? simulateForcedDark(preview.html) : preview.html;
  return respond(html, "text/html; charset=utf-8", 200, editor ? EDITOR_CSP : PREVIEW_CSP);
}
