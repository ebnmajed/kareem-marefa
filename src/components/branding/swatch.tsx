import type { CSSProperties } from "react";

// One colour on SCR-059 — a swatch AND its value written, never colour alone (REQ-UIX-116, SC 1.4.1). The hex is an
// LTR token inside an RTL line, so it is isolated (`<bdi dir="ltr">`); a team colour also carries its name.
//
// ★ The artboard's shape: a 16 px rounded square (rx 4), not a circle.
// ★ The colour reaches the DOM only as `--team` on the swatch, the one way data becomes a style (`REQ-UIX-043`'s
// pattern, `bg-team` reads it) — never a hex in a class.

export function Swatch({ color, name }: { color: string; name?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="inline-block size-4 shrink-0 rounded-[4px] border border-edge-strong bg-team" style={{ "--team": color } as CSSProperties} />
      <span className="flex min-w-0 flex-col leading-tight">
        {name ? <span className="text-caption text-fg-body">{name}</span> : null}
        <bdi dir="ltr" className="self-start font-mono text-caption text-fg-muted">
          {color.toUpperCase()}
        </bdi>
      </span>
    </span>
  );
}
