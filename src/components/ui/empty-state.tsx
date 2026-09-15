// STUB — content's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// content REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { EmptyStateProps } from "@/components/ui";

export function EmptyState({ title, description, action, clearFilter, className = "" }: EmptyStateProps) {
  return (
    <div className={className}>
      <p>{title}</p>
      {description ? <p>{description}</p> : null}
      {action.href ? <a href={action.href}>{action.label}</a> : <button type="button" onClick={action.onClick}>{action.label}</button>}
      {clearFilter ? <a href={clearFilter.href}>{clearFilter.label}</a> : null}
    </div>
  );
}
