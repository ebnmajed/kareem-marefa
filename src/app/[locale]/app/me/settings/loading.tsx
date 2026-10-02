// SCR-029's route skeleton — REQ-UIX-005, REQ-UIX-077. The top row, a card of switches, a card of links: the page's
// own shape. No text and no `getTranslations` — it renders before the page's `setRequestLocale`.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true">
      <Skeleton variant="text" width="9rem" />
      <Skeleton variant="row" count={4} className="mt-6" />
      <Skeleton variant="row" count={2} className="mt-6" />
    </div>
  );
}
