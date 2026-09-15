"use client";

import type { EmptyStateProps } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";

// content's file — `16` §4.2 Status, principle 5 "never a dead end",
// REQ-UIX-012.
//
// ★ `action` is REQUIRED in the type on purpose, not optional: every empty
// state names what to do next and links to it. There is no "empty, full
// stop" rendering path — the type does not allow building one.
//
// A filtered-empty state additionally passes `clearFilter`, offered BESIDE
// the primary action, never instead of it — dropping one filter is not
// always what a member wants, and the primary action (propose a session,
// clear ALL filters, etc.) still has to be there.
//
// `"use client"`: `action.onClick` is a plain function, which only a client
// module can wire to a `<button>` — `action.href` alone would not need it,
// but the type allows either and a caller should not have to know which.
export function EmptyState({ title, description, action, clearFilter, icon, size = "md", className = "" }: EmptyStateProps) {
  const compact = size === "sm";
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-card border border-edge px-6 text-center ${compact ? "py-8" : "py-14"} ${className}`}
    >
      {icon ? (
        <span aria-hidden className="text-[1.75rem] text-fg-muted">
          {icon}
        </span>
      ) : null}
      <p className={`font-medium text-fg-heading ${compact ? "text-label" : "text-h3"}`}>{title}</p>
      {description ? <p className="max-w-prose text-body-sm text-fg-muted">{description}</p> : null}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-4">
        {action.href ? (
          <ButtonLink href={action.href} variant="primary" size={compact ? "sm" : "md"}>
            {action.label}
          </ButtonLink>
        ) : (
          <Button type="button" variant="primary" size={compact ? "sm" : "md"} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {clearFilter ? (
          <Link
            href={clearFilter.href}
            className="inline-flex items-center gap-1 text-label text-fg-muted underline decoration-edge-strong underline-offset-4 hover:text-fg-heading"
          >
            <CloseIcon aria-hidden className="text-[0.85em]" />
            {clearFilter.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
