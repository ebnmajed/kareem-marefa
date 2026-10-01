// The rate screen's skeleton — REQ-UIX-005, `16` §7.1 layer 2 — in `Rate.dc.html`'s shape (wave 19):
// the top row, the session's mini-row, two star rows, the comment, the anonymity panel.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale` does for the real page.
// Direction-agnostic, `aria-hidden`.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true" className="flex max-w-xl flex-col gap-5">
      <div className="flex items-center gap-2.5 pt-1">
        <Skeleton variant="row" width="2.75rem" />
        <Skeleton variant="text" width="9rem" />
      </div>
      <Skeleton variant="card" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i}>
          <Skeleton variant="text" width="7rem" />
          <Skeleton variant="row" width="16rem" className="mt-2" />
        </div>
      ))}
      <div>
        <Skeleton variant="text" width="6rem" />
        <Skeleton variant="row" className="mt-2" />
      </div>
      <Skeleton variant="card" />
    </div>
  );
}
