// The four things BOTH mail paths need — the string path (`render.ts`) and the
// block compiler (`compile.ts`).
//
// ★ WHY THEY LIVE IN THEIR OWN FILE. `compile.ts` needs them and `render.ts`
// calls `compile.ts`, so leaving them in `render.ts` would make the two modules
// import each other. ESM tolerates a cycle until one of them grows a top-level
// side effect, and then it fails in a way that reads as a bug somewhere else.
// One leaf module, imported by both, and there is no cycle to reason about.
//
// Extracted from `render.ts` with their bodies unchanged; the 116 files under
// `tests/unit/mail-pinned/` are what proves it.

// D3a item 1: a mail renders in the READER's fonts — invariant 12 does not
// reach an inbox and `@font-face` is stripped by Gmail and Outlook — so the
// stack is declared and ends in a generic that exists on Windows, macOS, iOS,
// Android and Gmail's web client. Both paths use THIS constant: two stacks
// would be two chances for an Arabic face to fall back silently to one that
// breaks lam-alef.
export const FALLBACK_STACK = `'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif`;

/**
 * The stack a DESIGNED mail declares (D3 finding F4, block path only).
 *
 * `Segoe UI` and `Tahoma` are Windows, and `Tahoma`'s Arabic is solid — but
 * **iOS and Android ship none of the three**, so on the majority of readers
 * every Arabic run falls through `sans-serif` to the platform's glyph-level
 * fallback: Geeza Pro on iOS, Noto Naskh Arabic on Android. It WORKS, because
 * a fallback face shapes its own run and lam-alef survives. It is DISCOVERED
 * rather than declared, and this repository's standard is the opposite
 * (`06` §5.1). A platform reordering its fallbacks would change our Arabic
 * silently, on most readers, and nothing would tell us.
 *
 * ★ Why the string path keeps the stack above: `FALLBACK_STACK` is in every
 * cell of both paths, so widening it there would move all 116 pinned files —
 * changing the mail every org already sends, on a claim nobody here can verify
 * without opening iOS Mail. That is what `REQ-NTF-009` forbids this wave. The
 * string path leaves in M13 regardless.
 */
export const DESIGN_STACK = `'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, 'Geeza Pro', 'Noto Naskh Arabic', Arial, sans-serif`;

// `latn` named explicitly: `ar`'s CLDR default is `arab`, the digits the owner
// forbade everywhere (DEC-124).
const numberFormat = new Intl.NumberFormat("ar-u-nu-latn");

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Resolve `a.b.c` against the payload. */
export function lookup(payload: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) return (node as Record<string, unknown>)[part];
    return undefined;
  }, payload);
}

/**
 * One resolved value, as a template sees it — a count in Western digits, a
 * boolean in Arabic, and an absent value as the empty string rather than a
 * leaked `{{placeholder}}` in a member's inbox.
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  return String(value);
}
