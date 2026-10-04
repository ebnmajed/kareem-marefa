import type { CSSProperties } from "react";

// One colour on SCR-059 — a swatch AND its value written, never colour alone (REQ-UIX-116, SC 1.4.1). The hex is an
// LTR token inside an RTL line, so it is isolated (`<bdi dir="ltr">`); a team colour also carries its name.
//
// ★ The colour reaches the DOM only as `--team` on the swatch, the one way data becomes a style (`REQ-UIX-043`'s
// pattern, `bg-team` reads it) — never a hex in a class.

export function Swatch({ color, name }: { color: string; name?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="inline-block size-4 shrink-0 rounded-full border border-edge-strong bg-team" style={{ "--team": color } as CSSProperties} />
      {name ? <span className="text-body-sm text-fg-body">{name}</span> : null}
      <bdi dir="ltr" className="font-mono text-caption text-fg-muted">
        {color.toUpperCase()}
      </bdi>
    </span>
  );
}
