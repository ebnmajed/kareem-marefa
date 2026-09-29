// A team colour's swatch — a small filled circle, never the only channel: it
// always sits beside the colour's name in words (REQ-UIX-043). Shared by the
// table's per-row menu and, since wave 16, the add form (DEC-195 §3).
export function Swatch({ hex }: { hex: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 shrink-0 rounded-full border border-edge-strong"
      style={{ backgroundColor: hex ?? "transparent" }}
    />
  );
}
