import type { StickerFill, StickerProps } from "@/components/ui";

// content's file — REQ-UIX-031, DEC-183, DEC-186 §4 – §5. The die-cut sticker:
// joy, never truth. «محجوز», «مستوى جديد», «+50 عند الحضور» are stickers; a
// session's lifecycle is a BADGE and is never drawn here (REQ-UIX-003) — the
// badge's sober 6 px rectangle and the sticker's rotated pill are how the two
// are told apart without colour.
//
// It renders every state from props and reads nothing. It is STATIC this wave:
// the overshoot is the moments' wave's (DEC-186 §4), so nothing here moves.
//
// ★ THE RIM IS DRAWN FROM THE GROUND IT SITS ON. `shadow-sticker` is two rings —
// `--sticker-ground`, then the scope's text colour (DEC-186 §5). Whatever it
// sits on sets `--sticker-ground`: a poster sets its team colour, and with
// nothing set the rim is the surface. The component never guesses its ground.
//
// ★ Decoration by default: `aria-hidden`, so a screen reader does not hear
// «محجوز» twice beside the state that already says it. `informative` is for the
// one case where the sticker says something nothing else on the surface says.
//
// Its fill comes from the allowed set BY NAME and the text on every one is ink
// (6.25:1 or better, `globals.css`) — the component holds no colour.

const FILL: Record<StickerFill, string> = {
  accent: "bg-sticker-accent",
  signal: "bg-sticker-signal",
  cyan: "bg-sticker-cyan",
  gold: "bg-sticker-gold",
  violet: "bg-sticker-violet",
  bone: "bg-sticker-bone",
};

const SIZE: Record<NonNullable<StickerProps["size"]>, string> = {
  sm: "px-2.5 py-0.5 text-base",
  md: "px-3 py-1 text-xl",
};

/** A rotation in degrees, clamped to [-6, 6] (REQ-UIX-031). A non-number is no rotation. */
export function stickerRotation(rotate: number): number {
  if (!Number.isFinite(rotate)) return 0;
  return Math.min(6, Math.max(-6, rotate));
}

export function Sticker({ children, fill = "accent", rotate = -4, size = "md", informative, className = "" }: StickerProps) {
  return (
    <span
      aria-hidden={informative ? undefined : true}
      className={`inline-flex w-fit shrink-0 items-center rounded-pill font-display font-extrabold leading-[1.15] text-on-sticker shadow-sticker ${FILL[fill]} ${SIZE[size]} ${className}`}
      style={{ rotate: `${stickerRotation(rotate)}deg` }}
    >
      <bdi>{children}</bdi>
    </span>
  );
}
