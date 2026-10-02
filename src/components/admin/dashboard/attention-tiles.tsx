import { formatNumber } from "@/components/sessions/numerals";
import { Card } from "@/components/ui/card";
import type { AttentionItem } from "@/lib/dal/admin-dashboard";

// SCR-040's «يحتاج انتباهك» (`REQ-UIX-086`, `DEC-227` §0.1): four tiles, each
// the count, the label and how long the oldest item has waited — and each ONE
// link to the queue it counts (`getAdminAttention()`, contract 3), so what
// waits is reached in one move. The whole tile is the link (`ui/card`'s
// `href`, `REQ-UIX-001`). The count is coral and bold in the body face: the
// display face is the `h1`'s alone in the console (`DEC-228` §6).
export function AttentionTiles({
  items,
  labelFor,
  sinceFor,
}: {
  items: AttentionItem[];
  labelFor: (item: AttentionItem) => string;
  /** `null` when the queue is empty — nothing to be the oldest of. */
  sinceFor: (item: AttentionItem) => string | null;
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const since = sinceFor(item);
        return (
          <li key={item.queue}>
            <Card density="row" href={item.href} className="h-full">
              <span className="flex w-full flex-col gap-1 p-4">
                <span className="text-h2 font-bold text-signal">
                  <bdi>{formatNumber(item.count)}</bdi>
                </span>
                <span className="text-label text-fg-heading">
                  <bdi>{labelFor(item)}</bdi>
                </span>
                {since ? <span className="text-caption text-fg-muted">{since}</span> : null}
              </span>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
