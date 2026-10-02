// A tab's skeleton under the hub — REQ-UIX-005. The header and the strip are the layout's and stay on screen, so this
// draws the tab's body alone. No text and no `getTranslations`: it renders before `setRequestLocale` does.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true">
      <Skeleton variant="row" count={6} />
    </div>
  );
}
