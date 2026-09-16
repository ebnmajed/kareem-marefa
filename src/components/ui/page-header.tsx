import type { PageHeaderProps } from "@/components/ui";
import { ChevronIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";

// The page header — `16` §6.1 note 5, REQ-UIX-001.
//
// ★ EVERY SCREEN USES IT, and that is what makes forty-nine pages feel like one
// product rather than forty-nine `<h1>`s. It owns the page's one `h1`.
//
// The shape is the canvas's (`Browse`, `Schedule`, `Main`): a small muted
// breadcrumb whose separators point in the reading direction, an eyebrow, the
// title, a muted description, and the meta row — status chips, dates — under
// it. Actions sit at the inline end on desktop and wrap under the text on a
// phone, never beside a title they would squeeze.
//
// The title and every breadcrumb label are interpolated values, so each is
// bidi-isolated (`10` §3): a session title that begins with a Latin word must
// not reorder the chevron beside it.

export function PageHeader({ title, eyebrow, description, breadcrumb, breadcrumbLabel, actions, meta, status, className = "" }: PageHeaderProps) {
  return (
    <header className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8 ${className}`}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {breadcrumb?.length ? (
          <nav aria-label={breadcrumbLabel}>
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-muted">
              {breadcrumb.map((crumb, i) => (
                <li key={`${crumb.href}-${i}`} className="flex items-center gap-2">
                  {i > 0 ? <ChevronIcon direction="forward" className="text-[0.75rem] opacity-70" /> : null}
                  <Link href={crumb.href} quiet className="underline-offset-4 hover:text-fg-heading hover:underline">
                    <bdi>{crumb.label}</bdi>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {eyebrow ? (
          <p className="text-label text-fg-muted">
            <bdi>{eyebrow}</bdi>
          </p>
        ) : null}
        {status ? <div className="flex flex-wrap items-center gap-2">{status}</div> : null}
        <h1 className="text-h1 text-fg-heading">
          <bdi>{title}</bdi>
        </h1>
        {description ? <p className="max-w-prose text-body text-fg-muted">{description}</p> : null}
        {meta ? <div className="mt-1 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
