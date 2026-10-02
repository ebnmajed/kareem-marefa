import { formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import type { TopRow } from "@/lib/dal/admin-dashboard";

// SCR-040's three top lists in one panel (`AdminDashboard.dc.html`). ★ Kept
// from wave 6 (row 10): the name and the count are TWO children of the row,
// the count at the edge, never inside the name's link — a column of numbers
// scans; a number trailing each name does not. Each name is a link to the list
// behind it (`REQ-ADM-004`).
export interface TopList {
  id: string;
  title: string;
  rows: TopRow[];
  hrefFor: (row: TopRow) => string;
}

export function TopLists({ lists, emptyLabel }: { lists: TopList[]; emptyLabel: string }) {
  return (
    <Panel>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {lists.map((list) => (
          <section key={list.id} aria-labelledby={`${list.id}-heading`}>
            <h2 id={`${list.id}-heading`} className="text-label text-fg-heading">
              {list.title}
            </h2>
            {list.rows.length === 0 ? (
              <p className="mt-3 text-body-sm text-fg-muted">{emptyLabel}</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {list.rows.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3 text-body-sm">
                    <Link href={list.hrefFor(row)} quiet className="min-w-0 text-fg-body hover:text-fg-heading hover:underline">
                      <bdi>{row.label}</bdi>
                    </Link>
                    <span className="shrink-0 font-bold text-fg-heading">
                      <bdi>{formatNumber(row.count)}</bdi>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </Panel>
  );
}
