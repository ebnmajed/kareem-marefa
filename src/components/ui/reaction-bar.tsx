"use client";

import type { ReactionBarProps } from "@/components/ui";

// content's file — REQ-UIX-034, REQ-EVT-004, REQ-UIX-024, DEC-183, DEC-186 §4 –
// §5. A like and the house reactions, each with its count.
//
// ★ A REACTION EARNS NOTHING, so nothing here reads as an achievement. The
// acknowledgement is the PRESSED STATE, shown in place: nothing pops, nothing
// pulses and nothing transitions this wave (DEC-186 §4). A count changes in
// place, as text.
//
// ★ It decides nothing and holds no state. The SET is the caller's — the kinds,
// their words and their glyphs arrive as props, and the primitive names none.
// Optimism is the caller's too (`event/comment-item.tsx` uses `useOptimistic`):
// this renders whatever `pressed` and `count` it is handed.
//
// ★ Pressed is never colour alone. `aria-pressed` carries it for a screen
// reader; on screen the caller passes the glyph's `filled` form when pressed
// (the heart, the flame, the bolt and the star all have one), and the pill's
// border steps up to the heading ink. Every pill is at least 44 px.
//
// Each button is named by its word and its count — «إعجاب 12» — with the count
// in Western digits inside `<bdi>`. A read-only bar (a frozen thread, a
// cancelled session) shows the counts that exist and offers nothing to press,
// the rule `comment-item.tsx` already follows.

function formatCount(count: number): string {
  return Number.isFinite(count) && count > 0 ? Math.floor(count).toLocaleString("en-US") : "0";
}

const PILL = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-pill border px-3 text-label font-bold";

export function ReactionBar({ label, items, onToggle, readOnly, pending, className = "" }: ReactionBarProps) {
  return (
    <div role="group" aria-label={label} aria-busy={pending || undefined} className={`flex flex-wrap items-center gap-2 ${className}`}>
      {items.map((item) => {
        const shown = Number.isFinite(item.count) && item.count > 0;
        const count = shown ? (
          <bdi data-slot="count" className="tabular-nums">
            {formatCount(item.count)}
          </bdi>
        ) : null;

        if (readOnly) {
          // Nothing to press: only a reaction that has a count is shown, as text.
          if (!shown) return null;
          return (
            <span key={item.kind} data-kind={item.kind} className={`${PILL} border-edge text-fg-muted`}>
              {item.icon}
              <span className="sr-only">{`${item.label} `}</span>
              {count}
            </span>
          );
        }

        return (
          <button
            key={item.kind}
            type="button"
            data-kind={item.kind}
            aria-pressed={item.pressed}
            // The name is written out, «إعجاب 12»: built from the children, the word and the count
            // join with no space, since each node's text is trimmed. The visible count is in it (SC 2.5.3).
            aria-label={shown ? `${item.label} ${formatCount(item.count)}` : item.label}
            onClick={() => onToggle?.(item.kind)}
            className={`${PILL} hover:bg-hover ${item.pressed ? "border-fg-heading bg-raised text-fg-heading" : "border-edge bg-surface text-fg-body"}`}
          >
            {item.icon}
            {count}
          </button>
        );
      })}
    </div>
  );
}
