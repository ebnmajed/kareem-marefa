import type { SectionHeaderProps } from "@/components/ui";
import { formatNumber } from "@/components/sessions/numerals";

// The heading of a section inside a page — `16` §4.2.
//
// The page owns `h1` (`ui/page-header`); a section is `h2`, or `h3` inside a
// section. The `id` is the target the event page's sub-nav and a form
// summary's links jump to, and `globals.css` gives every `[id]` the
// scroll-margin that keeps it out from under the sticky header (`16` §3.1).
//
// ★ A section that can render nothing must not render its header either
// (`16` §5.4.1a(b)): that is the PAGE's condition to apply, and this component
// does not try to guess it.

export function SectionHeader({ title, as: Heading = "h2", id, description, count, actions, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0">
        <Heading id={id} className={`${Heading === "h2" ? "text-h2" : "text-h3"} text-fg-heading`}>
          <bdi>{title}</bdi>
          {/* ★ The count is part of the heading's accessible name, so it needs a
              separator a screen reader can hear: a margin is not one, and
              «هذا الأسبوع» + «1» read as the single word «هذا الأسبوع1». A real
              space (which also carries part of the visual gap) and parentheses
              for the ear only. */}
          {count !== undefined ? " " : null}
          {count !== undefined ? (
            <span className="ms-1.5 align-middle text-label text-fg-muted">
              <span className="sr-only">(</span>
              {formatNumber(count)}
              <span className="sr-only">)</span>
            </span>
          ) : null}
        </Heading>
        {description ? <p className="mt-1.5 max-w-prose text-body text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
