// The registry `ui-playground.test.ts` checks `src/components/ui/` against — DEC-199 §4, REQ-UIX-050.
//
// ★ THIS FILE IS NOT THE LIST OF PRIMITIVES. The directory is. The test reads the
// directory and fails on a file that has no entry here, and on an entry whose file
// is gone. What this file holds is what a directory cannot say about a file: HOW
// it wears the playground, and where that is proved and shown.
//
// ★ THERE IS NO «PENDING» KIND, AND NO ALLOWLIST. A file is one of four things:
//
//   variant         it carries `pg:` classes — what the scope adds beside what it had.
//   tokens          it reads semantic names only, and `reads` names the ones that make
//                   it the playground's. Checked: no `pg:` (that would be `variant`),
//                   no raw palette name, no hex, no literal duration; every name in
//                   `reads` is in the source.
//   composes        it draws no colour, face or radius of its own: what it looks like
//                   is `of`'s. Checked: it imports each of them, and each is itself an
//                   entry that passes (or, outside `ui/`, a file that does).
//   infrastructure  it renders no pixel. `why` says so, and it needs neither a test
//                   inside the scope nor a demo.
//
// Every entry but `infrastructure` names a TEST that imports the primitive and
// speaks of the scope, and a DEMO the gallery imports. An exemption from any of
// this is a line changed in this file, with its reason, in a diff the lead reads.
//
// The lead's file. A track that adds a primitive, renames one, or changes how one
// is treated writes the request (contract 2).

export type Treatment =
  | { kind: "variant" }
  | { kind: "tokens"; reads: readonly string[] }
  | { kind: "composes"; of: readonly string[] }
  | { kind: "infrastructure"; why: string };

export interface Entry {
  treatment: Treatment;
  /** Under `tests/components/ui/`. Absent only for `infrastructure`. */
  test?: string;
  /** Under `src/app/[locale]/(dev)/ui/demos/`. Absent only for `infrastructure`. */
  demo?: string;
}

const variant = (name: string, test = `${name}-scope.test.tsx`, demo = `${name}.tsx`): Entry => ({ treatment: { kind: "variant" }, test, demo });
const tokens = (name: string, reads: readonly string[], test = `${name}.test.tsx`): Entry => ({ treatment: { kind: "tokens", reads }, test, demo: `${name}.tsx` });
const composes = (name: string, of: readonly string[]): Entry => ({ treatment: { kind: "composes", of }, test: `${name}-scope.test.tsx`, demo: `${name}.tsx` });

export const REGISTRY: Record<string, Entry> = {
  // ── the lead's ──
  "button.tsx": variant("button"),
  "dialog.tsx": variant("dialog"),
  "icon-button.tsx": variant("icon-button"),
  // The house set is already what the playground asks of a glyph — a 24 px grid, stroke 2, the
  // text's colour — so the file carries no class for the scope and no colour of its own.
  "icons.tsx": tokens("icons", ["currentColor"], "icons-scope.test.tsx"),
  // A link draws nothing: its colour and underline are its caller's. Its one drawn part is the
  // pending dot, which is `route-progress`'s.
  "link.tsx": composes("link", ["ui/route-progress"]),
  "page-header.tsx": variant("page-header"),
  "prose.tsx": variant("prose"),
  // No surface of its own: a row is the caller's, and its controls are the icon button.
  "reorderable-list.tsx": composes("reorderable-list", ["ui/icon-button"]),
  "route-error.tsx": variant("route-error"),
  "route-progress.tsx": variant("route-progress"),
  "section-header.tsx": variant("section-header"),
  "skeleton.tsx": variant("skeleton"),
  // `ui/button` with `type="submit"` and the form's pending state.
  "submit-button.tsx": composes("submit-button", ["ui/button"]),
  "toast.tsx": variant("toast"),
  "scope.tsx": { treatment: { kind: "infrastructure", why: "it IS the scope: the one element that carries the scope's class and the display face's variable" } },
  "scope-portal.tsx": { treatment: { kind: "infrastructure", why: "a context and a `display: contents` landing element for portals; it draws nothing (DEC-188)" } },

  // ── `content`'s ──
  "avatar.tsx": variant("avatar"),
  "badge.tsx": variant("badge"),
  "card.tsx": variant("card"),
  "empty-state.tsx": variant("empty-state"),
  "file-drop.tsx": variant("file-drop"),
  "panel.tsx": variant("panel"),
  "progress.tsx": variant("progress"),
  "stat.tsx": variant("stat"),
  "tag-chip.tsx": variant("tag-chip"),
  // Born inside the scope in wave 15: no class of theirs exists outside it.
  "poster.tsx": tokens("poster", ["bg-team", "text-on-team", "rounded-tile", "font-display"]),
  "progress-bar.tsx": tokens("progress-bar", ["bg-raised", "bg-accent", "bg-team", "rounded-pill"]),
  "reaction-bar.tsx": tokens("reaction-bar", ["bg-raised", "border-edge", "rounded-pill", "text-fg-heading"]),
  "sticker.tsx": tokens("sticker", ["bg-sticker", "text-on-sticker", "shadow-sticker", "font-display", "rounded-pill"]),
  "story-ring.tsx": tokens("story-ring", ["border-team", "border-accent", "border-signal", "font-display"]),
  // wave 18 (DEC-207): born inside the scope.
  "feed-item.tsx": tokens("feed-item", ["bg-surface", "bg-raised", "rounded-tile", "text-accent"], "feed-item-scope.test.tsx"),
  // Its faces are `avatar`'s; what it draws itself is the gap between them and the count line.
  "attendee-stack.tsx": tokens("attendee-stack", ["ring-canvas", "text-fg-muted"], "attendee-stack-scope.test.tsx"),
  // wave 19 (DEC-214): born inside the scope — the viewer's page, controls and rail; its ground is the screen's.
  "page-viewer.tsx": tokens("page-viewer", ["bg-chrome", "outline-accent", "accent-accent"], "page-viewer-scope.test.tsx"),

  // ── `sessions'` ──
  "field.tsx": variant("field"),
  "checkbox.tsx": variant("checkbox"),
  "radio-group.tsx": variant("radio-group"),
  "switch.tsx": variant("switch"),
  "form-summary.tsx": variant("form-summary"),
  // One face, `controlClass()`, which is `field`'s.
  "input.tsx": composes("input", ["ui/field"]),
  "select.tsx": composes("select", ["ui/field"]),
  "textarea.tsx": composes("textarea", ["ui/field"]),
  "session-cta.tsx": variant("session-cta", "session-cta.test.tsx"),
  "code-input.tsx": variant("code-input", "code-input.test.tsx"),
  // wave 18 (DEC-207): born inside the scope — the bar of an immersive screen; its controls are the caller's.
  "action-bar.tsx": tokens("action-bar", ["bg-surface", "border-edge", "text-fg-muted"], "action-bar-scope.test.tsx"),
  // wave 19 (DEC-214): the current step coral or lime, a done step by its glyph too; its `pg:` classes make it a variant.
  "stepper.tsx": variant("stepper"),

  // ── `console`'s ──
  "data-table.tsx": variant("data-table"),
  "combobox.tsx": variant("combobox"),
  "menu.tsx": variant("menu"),
  "tabs.tsx": variant("tabs"),
  "sheet.tsx": variant("sheet"),
  // A wrapper with one class: every visible token is the picker's (DEC-186 §8).
  "date-time.tsx": composes("date-time", ["admin/rtl-datetime-picker"]),

  // ── `scoring`'s ──
  "rank-row.tsx": variant("rank-row"),
  "race-bar.tsx": variant("race-bar"),
  "level-card.tsx": tokens("level-card", ["rounded-panel", "font-display", "text-on-level", "bg-raised"], "level-card-scope.test.tsx"),
  // wave 18 (DEC-207): it draws its own tiles — a figure is a node, which `stat` cannot take (W4) —
  // and composes `progress-bar`; its accent figures take the light ground's heading through `pg-light:`.
  "week-hud.tsx": variant("week-hud"),
  // wave 19 (DEC-214): born inside the scope; the drop is `color-mix()` of its own fill, no token per fill.
  "badge-medallion.tsx": tokens("badge-medallion", ["--color-sticker-", "--color-level-", "color-mix", "text-fg-heading", "rounded-pill"], "badge-medallion-scope.test.tsx"),
  // wave 20 (DEC-218, REQ-UIX-081): `scoring`'s two.
  "ledger-row.tsx": variant("ledger-row"),
  "podium.tsx": variant("podium"),
  // wave 20 (DEC-218, REQ-UIX-081): `notify`'s first — it composes `switch` and `link` as they are.
  "settings-group.tsx": composes("settings-group", ["ui/switch", "ui/link"]),

  // ── wave 21 (DEC-225 §2, DEC-227, DEC-228): the console's three ──
  // The lead's: born inside the scope, semantic names only, no animation (`console-register` reads it).
  "admin-rail.tsx": tokens("admin-rail", ["bg-raised", "bg-signal", "text-on-signal", "border-edge", "rounded-pill"], "admin-rail-scope.test.tsx"),
  // `sessions'`: landed by the lead as stubs with their signatures; `sessions` writes them to its plan.
  "split-view.tsx": tokens("split-view", ["border-accent", "bg-raised", "bg-hover"], "split-view-scope.test.tsx"),
  "kv-card.tsx": tokens("kv-card", ["rounded-panel", "bg-surface", "border-edge", "divide-edge", "text-fg-muted"], "kv-card-scope.test.tsx"),

  // ── `event`'s — its first (wave 19, DEC-214) ──
  "star-input.tsx": tokens("star-input", ["text-signal", "text-edge-strong", "text-fg-muted", "text-error"], "star-input-scope.test.tsx"),
};
