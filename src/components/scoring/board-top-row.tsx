import type { ReactNode } from "react";

// The boards' own top row — `Board.dc.html` / `Companies.dc.html` (wave 20, contract 1 as amended: `/app/leaderboards`
// owns its phone top row and draws no hub strip). scoring's file. The page's one `h1` at every width; on the week,
// the window's end («حتى الجمعة», formatted from the week's own last day, never typed); and, where a window has
// per-category boards, the category menu (REQ-LDR-003, `M10c.md` §7 — a menu in the header, not a tab).

export function BoardTopRow({ title, until, menu }: { title: string; until?: ReactNode | null; menu?: ReactNode | null }) {
  return (
    <div className="flex items-center gap-3">
      <h1 className="min-w-0 flex-1 font-display text-play-md font-extrabold text-fg-heading">{title}</h1>
      {until ? <span className="shrink-0 text-caption text-fg-muted">{until}</span> : null}
      {menu ? <div className="shrink-0">{menu}</div> : null}
    </div>
  );
}
