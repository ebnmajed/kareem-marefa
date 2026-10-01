import type { ActionBarProps } from "@/components/ui";

// The bottom bar of an immersive screen — REQ-UIX-057, `M10a.md` §7 and §10,
// `Event.dc.html`, `EventLive.dc.html`, `EventDone.dc.html`.
//
// ★ ONE PRIMARY AND AT MOST TWO SECONDARY CONTROLS, and it decides none of them.
// The primary takes the free width; the others follow it in reading order. Every
// control is the caller's node — a `SessionCta`, a `SubmitButton`, an
// `IconButton` — so the bar holds no state, reads no data and names no string.
// The tuple type makes a third secondary a type error rather than a review note.
//
// ★ IT IS NEVER TRANSFORMED, FILTERED OR CLIPPED (DEC-188 §5). A `fixed` element
// is fixed to its nearest transformed ancestor, and a moment's thud or rise moves
// an element INSIDE a slot, never the bar. So no transform, filter or overflow
// class is set on it, and a scope test holds that.
//
// ★ `data-action-bar` IS THE SHELL'S CONTRACT (`globals.css`): while the bar is on
// the page `--tabbar-h` takes its height below `md`, and `<main>` and the scroll
// padding clear it — so nothing at the end of a page, and no focused control,
// sits behind the bar. It is an attribute, not a class, and it is set only when
// the bar is fixed: a `static` bar in the gallery must not pad the gallery.
//
// The safe area is padded here, with the tab bar's own formula, so a phone with
// a home indicator never puts the primary under it.
//
// `role="group"` with a name, never a landmark: the screen owns its regions (the
// event page's «الحضور»), and a second `contentinfo` or `navigation` would be a lie.

const HIDE = { md: "md:hidden", lg: "lg:hidden" } as const;

// ★ Wave 19 (DEC-214 §3): on `/app/propose` the bar stands ON the tab bar. `globals.css` sets
// `--stacked-bar-offset` (the tab bar's height) only while both are on the page below `lg`; unset, this is 0 and
// every other screen's bar sits where it always did. Stacked, the tab bar also carries the safe area, so the bar
// rises by it too: `min(offset, safe area)` is the safe area when stacked and 0 when not.
const STACKED_BOTTOM =
  "calc(var(--stacked-bar-offset, 0px) + min(var(--stacked-bar-offset, 0px), env(safe-area-inset-bottom, 0px)))";

export function ActionBar({ label, primary, secondary, note, position = "fixed", hideFrom, className = "" }: ActionBarProps) {
  const fixed = position === "fixed";
  return (
    <div
      role="group"
      aria-label={label}
      data-action-bar={fixed ? "" : undefined}
      data-position={position}
      className={`${fixed ? "fixed inset-x-0 bottom-0 z-30" : "relative"} border-t border-edge bg-surface px-4 pt-3 ${hideFrom ? HIDE[hideFrom] : ""} ${className}`}
      style={{ paddingBlockEnd: "calc(1rem + env(safe-area-inset-bottom, 0px))", ...(fixed ? { bottom: STACKED_BOTTOM } : null) }}
    >
      <div data-slot="row" className="mx-auto flex max-w-xl items-center gap-2">
        <div data-slot="primary" className="min-w-0 flex-1">
          {primary}
        </div>
        {secondary?.map((control, index) =>
          control ? (
            <div key={index} data-slot="secondary" className="shrink-0">
              {control}
            </div>
          ) : null,
        )}
      </div>
      {note ? (
        <div data-slot="note" className="mx-auto mt-2 max-w-xl text-center text-caption text-fg-muted">
          {note}
        </div>
      ) : null}
    </div>
  );
}
