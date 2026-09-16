import type { UiLinkProps } from "@/components/ui";
import { LinkPendingReporter } from "@/components/ui/route-progress";
import { Link as LocaleLink } from "@/i18n/navigation";

// The house link — `16` §7.1.1, REQ-UIX-006.
//
// Locale-aware (next-intl's `Link`, which renders `next/link`), so an `href`
// is written `/app/sessions` and arrives at `/ar/app/sessions`. Inside it, a
// client child reads THIS link's `useLinkStatus()` — the only place that hook
// can be called — draws a small pending dot, and feeds the store the shell's
// `<RouteProgress>` reads. `quiet` suppresses the dot where it would be noise
// (a card whose whole surface is the link); the store still counts it.
//
// Not `"use client"`: a server page may render it, and the client boundary is
// the reporter alone.

export function Link({ href, children, quiet, ...props }: UiLinkProps) {
  return (
    <LocaleLink href={href} data-quiet={quiet || undefined} {...props}>
      {children}
      <LinkPendingReporter quiet={quiet} />
    </LocaleLink>
  );
}
