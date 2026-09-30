import { Link } from "@/components/ui/link";
import { RouteProgress } from "@/components/ui/route-progress";
import type { DemoGround } from "../ground";

// The gallery's `route-progress` demo — wave 17, contract 3 (DEC-199 §3).
//
// ★ THERE IS NO BAR IN THIS PICTURE, AND THAT IS ITS RESTING STATE. The bar is
// drawn only while a navigation has been pending past `delayMs`, which no prop
// can hold still, and it is fixed to the top of the viewport, not to this box.
// So the demo mounts the real thing — `delayMs={0}`, beside a house link that
// feeds it — and the gallery spec stalls that link's navigation and captures
// the viewport's top edge (sync 1).
//
// One bar for the page: the two grounds read one store, so two would be the same
// bar drawn twice in the same place. It stands in the dark ground, the default.

export function RouteProgressDemo({ ground }: { ground: DemoGround }) {
  return (
    <div data-demo="route-progress" className="flex flex-col gap-2">
      {ground === "dark" ? <RouteProgress delayMs={0} /> : null}
      <p className="text-body-sm text-fg-muted">الشريط يظهر أعلى الشاشة حين يتأخر الانتقال، ولا يظهر قبل ذلك.</p>
      <p className="text-body text-fg-heading">
        <Link href="/ui?from=route-progress" className="underline underline-offset-4">
          انتقل، وراقب أعلى الشاشة
        </Link>
      </p>
    </div>
  );
}
