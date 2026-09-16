// STUB — lead's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// lead REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { PageHeaderProps } from "@/components/ui";

export function PageHeader({ title, eyebrow, description, breadcrumb, actions, meta, className = "" }: PageHeaderProps) {
  return (
    <header className={className}>
      {breadcrumb?.length ? (
        <nav>
          {breadcrumb.map((b) => (
            <a key={b.href} href={b.href}>
              <bdi>{b.label}</bdi>
            </a>
          ))}
        </nav>
      ) : null}
      {eyebrow ? <p>{eyebrow}</p> : null}
      <h1><bdi>{title}</bdi></h1>
      {description ? <p>{description}</p> : null}
      {meta}
      {actions}
    </header>
  );
}
