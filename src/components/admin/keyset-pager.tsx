import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";

// «أقدم» and «عُد إلى الأحدث» over a keyset cursor — the audit log and the
// email delivery log. Never an offset: both logs are appended to while they
// are read, and an offset page skips or repeats rows as they arrive. A newest-
// first log needs no «newer» step: the way back is the first page itself.
//
// Renders nothing when there is nowhere to go, so a one-page log carries no
// empty navigation landmark.
export function KeysetPager({
  label,
  olderHref,
  olderLabel,
  newestHref,
  newestLabel,
}: {
  label: string;
  olderHref: string | null;
  olderLabel: string;
  /** Present only once the reader has paged away from the newest rows. */
  newestHref: string | null;
  newestLabel: string;
}) {
  if (!olderHref && !newestHref) return null;
  return (
    <nav aria-label={label} className="mt-6 flex flex-wrap items-center gap-3">
      {newestHref ? (
        <ButtonLink href={newestHref} variant="ghost" size="sm">
          {newestLabel}
        </ButtonLink>
      ) : null}
      {olderHref ? (
        <ButtonLink href={olderHref} variant="secondary" size="sm" className="ms-auto">
          {olderLabel}
          <ArrowIcon direction="forward" />
        </ButtonLink>
      ) : null}
    </nav>
  );
}
