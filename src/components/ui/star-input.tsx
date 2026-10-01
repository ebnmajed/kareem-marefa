import type { StarInputEditableProps, StarInputProps, StarInputReadOnlyProps } from "@/components/ui";
import { AlertCircleIcon, StarIcon } from "@/components/ui/icons";

// The star input — REQ-UIX-064, `M10b.md` §2 and §7, `DEC-213` §5.124, `DEC-214` §3. It replaces
// `components/event/star-rating.tsx`, which held the same guarantees for SCR-015 alone.
//
// ★★ STARS FILL FROM THE RIGHT IN ARABIC, AND NOTHING PHYSICAL DOES IT. A row that fills
// left-to-right in an RTL layout reads as one star when the member meant five — a silent,
// systematic data error (`09` SCR-015). Star 1 is FIRST in DOM order in a plain flex row, and a
// flex row starts at the INLINE START: the right in Arabic, the left in English. «Fill stars 1…n»
// therefore fills from the right in Arabic with the same code. `flex-row-reverse` here would UNDO
// that — the temptation is real enough to write down twice.
//
// ★ FIVE NATIVE RADIOS, not buttons with `role="radio"`: one tab stop, the browser's own arrow keys
// (in an RTL group ← moves to the next radio in DOM order, so ← increases — no key handler, which
// would be a second keyboard model to keep in step), a real value in the FormData, and a form
// reset that restores the default the page rendered. An empty row submits nothing: «no opinion» is
// not zero (REQ-RAT-002).
//
// ★ THE FILL, THE HOVER PREVIEW AND THE READ-BACK ARE CSS (`:has()`), so they are right before
// hydration and right after React resets the form — and this file is server-safe: no hook, no
// "use client", no message catalogue. A star is filled when its radio or a LATER sibling's is
// checked. While a pointer hovers the row, a star is filled when it or a later sibling is hovered,
// and the stars after the hovered one are not — the `:not(:hover)` gives that rule the weight to
// win over a checked fill. Nothing scales on hover (DEC-183 §2), and nothing animates.
//
// A filled star is `--signal` (DEC-214 §3) — never a company's colour, which never carries a
// second meaning. The outline is `edge-strong`.
//
// Strings arrive as props: the five counts (six ICU forms, formatted by the caller), the legend,
// «مطلوب», the error, and the read-only face's whole name.

const STARS = [1, 2, 3, 4, 5] as const;

const STAR_BOX = { md: "size-11 text-[1.75rem]", lg: "size-12 text-[2.75rem]" } as const;
const FACE = { md: "text-[1.25rem]", lg: "text-[2rem]" } as const;

const FILLED = "text-signal [&_path]:fill-current";

/** Each line is literal so the stylesheet sees it: one read-back per checked value. */
const READ_BACK = [
  "group-has-[input[value='1']:checked]/stars:block",
  "group-has-[input[value='2']:checked]/stars:block",
  "group-has-[input[value='3']:checked]/stars:block",
  "group-has-[input[value='4']:checked]/stars:block",
  "group-has-[input[value='5']:checked]/stars:block",
] as const;

const STAR_CLASS = [
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-pill text-edge-strong",
  // Chosen: this star, or any star after it in the row.
  "[&:has(:checked)]:text-signal [&:has(:checked)_path]:fill-current",
  "[&:has(~label_:checked)]:text-signal [&:has(~label_:checked)_path]:fill-current",
  // The hover preview, on a device that hovers: up to the hovered star, and none after it.
  "[@media(hover:hover)]:[&:hover]:text-signal [@media(hover:hover)]:[&:hover_path]:fill-current",
  "[@media(hover:hover)]:[&:has(~label:hover)]:text-signal [@media(hover:hover)]:[&:has(~label:hover)_path]:fill-current",
  "[@media(hover:hover)]:[label:hover~&:not(:hover)]:text-edge-strong [@media(hover:hover)]:[label:hover~&:not(:hover)_path]:fill-none",
  // The radio is visually hidden, so its focus ring is drawn on the star.
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]",
  "has-[:disabled]:cursor-default",
].join(" ");

export function StarInput(props: StarInputProps) {
  return props.readOnly ? <StarFace {...props} /> : <StarGroup {...props} />;
}

function StarGroup({ name, legend, starLabels, defaultValue, required, requiredLabel, error, disabled, size = "md", className = "" }: StarInputEditableProps) {
  const legendId = `${name}-legend`;
  const errorId = `${name}-error`;
  return (
    // Named from its legend by id and marked invalid as a group, as `ui/radio-group` does.
    // `id={name}` is the summary link's target; it focuses the first radio inside.
    <fieldset
      id={name}
      role="radiogroup"
      aria-labelledby={legendId}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
      disabled={disabled}
      className={`group/stars min-w-0 ${className}`}
    >
      <legend id={legendId} className="text-label text-fg-heading">
        {legend}
        {required && requiredLabel ? (
          <>
            {" "}
            <span className="ms-2 text-caption font-normal text-fg-muted">{requiredLabel}</span>
          </>
        ) : null}
      </legend>
      <div className="mt-2 flex gap-2">
        {STARS.map((star) => (
          <label key={star} className={`${STAR_CLASS} ${STAR_BOX[size]}`}>
            <input type="radio" name={name} value={star} defaultChecked={defaultValue === star} className="sr-only" />
            <StarIcon />
            <span className="sr-only">{starLabels[star - 1]}</span>
          </label>
        ))}
      </div>
      {/* The count read back, for the eye: the checked radio already speaks it, so this is never read twice. */}
      <p aria-hidden="true" data-slot="read-back" className="mt-1 min-h-[1.5em] text-caption text-fg-muted">
        {STARS.map((star) => (
          <span key={star} data-value={star} className={`hidden ${READ_BACK[star - 1]}`}>
            {starLabels[star - 1]}
          </span>
        ))}
      </p>
      {error ? (
        <p id={errorId} className="mt-2 flex items-start gap-2 text-caption text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}

/** A saved rating, read-only — the closed window and the receipt. One image; the row fills from the right, like the input. */
function StarFace({ value, label, starLabels, legend, size = "md", className = "" }: StarInputReadOnlyProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span aria-hidden="true" className="text-body-sm text-fg-muted">
        {legend}
      </span>
      <span role="img" aria-label={label} className={`inline-flex gap-1 ${FACE[size]}`}>
        {STARS.map((star) => (
          <StarIcon key={star} filled={star <= value} className={star <= value ? FILLED : "text-edge-strong"} />
        ))}
      </span>
      <span aria-hidden="true" className="text-caption text-fg-muted">
        {starLabels[value - 1]}
      </span>
    </div>
  );
}
