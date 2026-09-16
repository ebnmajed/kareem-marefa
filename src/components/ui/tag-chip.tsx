"use client";

import type { TagChipProps } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { CloseIcon } from "@/components/ui/icons";

// content's file — `16` §4.2 Status, §9.4 (ask 11, tags).
//
// A tag, optionally a link (to a filtered browse — §9.4's "up to three tag
// chips" on a card, and a facet in the browse rail), optionally removable
// (the proposal form's own chip list, `sessions`' consumer via
// `ui/combobox`'s `allowCreate`).
//
// ★ `count` is a raw `number` in the frozen type, unlike `Stat.value` /
// `Progress.valueText`, which the caller pre-formats "in the org's
// numerals". There is no locale/numerals input here to do the same, and a
// browser-locale-sensitive format (`document.documentElement.lang`, say)
// would render differently server-side (no `document`) and client-side —
// a real hydration mismatch, not a cosmetic one. So this renders `count`
// with a fixed, locale-independent `String()` — identical on the server and
// after hydration, at the cost of never honouring an org's Arabic-Indic
// setting the way the other two primitives do. Flagged in
// `docs/plan/notes/content.md` §6.0 for whoever wires a real facet count.
export function TagChip({ label, href, count, onRemove, removeLabel, selected, removeHref, className = "" }: TagChipProps) {
  const labelNode = <bdi>{label}</bdi>;
  // ★ Gallery finding (390 px review): with no separator this glued to the
  // label as e.g. «أمنة12», reading as a chip literally named that. Fixed
  // two ways at once — an explicit `gap-1` between label and count (JSX
  // places no whitespace between adjacent elements) and parenthesising the
  // count, which is unambiguous and needs no gap to read correctly even if
  // one is later lost to a style change. The count stays muted relative to
  // the label — the label is what is being chosen, the count is a hint —
  // and stays in its own `<bdi>`: a Western-digit count after an Arabic
  // label is a bidi boundary (a digit run beside Arabic text reorders without it).
  const countNode =
    typeof count === "number" ? (
      <span className="text-fg-muted">
        (<bdi>{count}</bdi>)
      </span>
    ) : null;
  // ★ `selected` (R-C2, `sessions`' request): a pressed filter toggle — the
  // timeline's row A of tag/category links. `aria-current="true"` marks the
  // active member of a set of navigational links (the same semantic a
  // breadcrumb's current page uses), which is what a selected filter chip
  // actually is: one of several links, this one already applied. There is
  // no `aria-pressed` here because a link is not a toggle button; a caller
  // wanting a true toggle button renders its own and skips `href` entirely.
  const content = href ? (
    <Link href={href} quiet aria-current={selected ? "true" : undefined} className="inline-flex items-center gap-1 hover:text-fg-heading">
      {labelNode}
      {countNode}
    </Link>
  ) : (
    <span className="inline-flex items-center gap-1">
      {labelNode}
      {countNode}
    </span>
  );
  return (
    // ★ `rounded-field` (6 px), not a pill — the canvas's own chip shape
    // (`Browse`, `Main`'s tag links), the lead's ruling. `selected` swaps the
    // outline for the filled navy/white pair `Progress`'s `info` tone
    // already uses elsewhere, so "applied" reads as more than a border-colour
    // change at a glance (`REQ-UIX-003` — colour is never the only channel;
    // `aria-current` above is the non-colour channel).
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-field border px-3 py-1 text-caption ${
        selected ? "border-navy-900 bg-navy-900 text-white" : "border-edge bg-surface text-fg-body"
      } ${className}`}
    >
      {content}
      {removeHref ? (
        // ★ `removeHref` (R-C2): removal as a LINK, so it works before
        // hydration — `quiet`, the same reasoning as the chip's own link
        // above, and a real navigation the caller's route reads back from
        // (removing this one filter from the query string), not a client
        // handler that does nothing until JS has loaded.
        <Link
          href={removeHref}
          quiet
          aria-label={removeLabel ?? label}
          className="-me-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-silver-100 hover:text-fg-heading"
        >
          <CloseIcon aria-hidden />
        </Link>
      ) : onRemove ? (
        // ★ Hit area `size-6` (24 px) — DEC-123's touch-target sweep: the
        // house standard is 44 px controls, but a chip's own remove glyph is
        // exempt the same way `CertBuilder`/`Studio` chrome is (adjacent to
        // dense inline text, not a primary action) as long as it clears
        // WCAG 2.5.8's 24 px floor, which `size-6` (24 px) does exactly.
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? label}
          className="-me-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-silver-100 hover:text-fg-heading"
        >
          <CloseIcon aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
