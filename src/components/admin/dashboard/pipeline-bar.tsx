import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";

// SCR-040's «مسار المقترحات» (`AdminDashboard.dc.html`): one segmented bar —
// the only chart on the page (`REQ-UIX-086`) — and its counts in the caption.
// The bar is a picture of the caption, so it is hidden from assistive
// technology; each count in the caption is the link to the proposals queue
// (`REQ-ADM-004`: every figure opens its list). A segment's length is its
// count, as `flex-grow`; nothing grows into place (`REQ-UIX-053`). The
// segments wear semantic names only — a status colour is never an accent.
export interface PipelineSegment {
  key: string;
  label: string;
  count: number;
  /** A semantic background class — never a raw palette name. */
  fill: string;
  href: string;
}

export function PipelineBar({ title, segments, countLabel }: { title: string; segments: PipelineSegment[]; countLabel: (segment: PipelineSegment) => string }) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return (
    <section aria-labelledby="pipeline-heading">
      <Panel>
        <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between md:gap-6">
          <h2 id="pipeline-heading" className="text-label text-fg-heading">
            {title}
          </h2>
          <p className="flex flex-wrap gap-x-2 gap-y-1 text-caption text-fg-muted">
            {segments.map((s, i) => (
              <span key={s.key} className="inline-flex items-baseline gap-2">
                {i > 0 ? <span aria-hidden>·</span> : null}
                <Link href={s.href} quiet className="hover:text-fg-heading hover:underline">
                  <bdi>{countLabel(s)}</bdi>
                </Link>
              </span>
            ))}
          </p>
        </div>
        <div aria-hidden className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-pill bg-raised">
          {total > 0 ? segments.filter((s) => s.count > 0).map((s) => <span key={s.key} className={`h-full ${s.fill}`} style={{ flexGrow: s.count }} />) : null}
        </div>
      </Panel>
    </section>
  );
}
