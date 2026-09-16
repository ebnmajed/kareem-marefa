"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { AlertCircleIcon, StarIcon } from "@/components/ui/icons";

// The star input — SCR-015, REQ-RAT-002, wave 7 (DEC-137, DEC-141).
//
// ★★ STARS FILL FROM THE RIGHT IN ARABIC, AND NOTHING PHYSICAL DOES IT. A row
// that fills left-to-right in an RTL layout reads as one star when the member
// meant five — a silent, systematic data error (`09` SCR-015). Star 1 is FIRST
// in DOM order in a plain flex row, and a flex row starts at the INLINE START:
// the right in Arabic, the left in English. «Fill stars 1…n» therefore fills
// from the right in Arabic with the same code and the same DOM. `flex-row-reverse`
// here would UNDO that and reintroduce the bug — the temptation is real enough
// to write down twice.
//
// ★ NATIVE RADIOS, not buttons with `role="radio"`. The old control was a
// radiogroup in ARIA only: five tab stops, no arrow keys, a name of a bare
// digit, and with no JavaScript the form submitted «0». A real
// `<input type="radio">` per star gives the group one tab stop, the browser's
// own arrow keys (the e2e measures which way they go in RTL rather than
// assuming it), a real value in the FormData, and a form reset that restores
// the default the page rendered.
//
// ★ THE FILL IS CSS, `:has()`, so it is right before hydration and after React
// resets the form: a star is filled when its own radio is checked or when a
// LATER sibling's is. No state to fall out of step with the inputs.
//
// Each radio's name is a count with all six plural forms — «نجمتان», «5 نجوم» —
// so the group reads as a scale, not as five digits.

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export function StarRating({
  name,
  legend,
  defaultValue,
  required,
  error,
  disabled,
}: {
  name: string;
  legend: string;
  /** The value the page rendered with — a saved rating, or what came back from a failed round trip. */
  defaultValue?: number;
  required?: boolean;
  /** A rendered message, adjacent and icon-marked (REQ-UIX-010). */
  error?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("ratings.form");
  const tField = useTranslations("ui.field");
  const errorId = `${name}-error`;
  const legendId = useId();

  return (
    // The group is named from its legend by id and marked invalid as a group, as
    // `ui/radio-group` does. `id={name}` is the summary link's target; it
    // focuses the first radio inside.
    <fieldset
      id={name}
      role="radiogroup"
      aria-labelledby={legendId}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
      disabled={disabled}
    >
      <legend id={legendId} className="text-label text-fg-heading">
        {legend}
        {required ? (
          <>
            {" "}
            <span className="ms-2 text-caption font-normal text-fg-muted">{tField("required")}</span>
          </>
        ) : null}
      </legend>
      <div className="mt-2 flex gap-1">
        {STAR_VALUES.map((star) => (
          <label
            key={star}
            className={[
              "relative inline-flex size-11 cursor-pointer items-center justify-center rounded-field text-[1.75rem]",
              "text-fg-muted hover:bg-silver-100",
              // Filled when this star, or any star after it in the row, is chosen.
              "[&:has(:checked)]:text-fg-heading [&:has(:checked)_path]:fill-current",
              "[&:has(~label_:checked)]:text-fg-heading [&:has(~label_:checked)_path]:fill-current",
              // The radio is visually hidden, so its focus ring is drawn here.
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]",
            ].join(" ")}
          >
            {/* ui-lint-disable-next-line field — a self-labelling radio in a legend-named group, the `ui/radio-group` shape: a <Field> label around it would name it twice */}
            <input
              type="radio"
              name={name}
              value={star}
              defaultChecked={defaultValue === star}
              className="sr-only"
            />
            <StarIcon />
            <span className="sr-only">{t("starCount", { count: star, value: formatNumber(star) })}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="mt-2 flex items-start gap-2 text-caption text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}

/** A saved rating, read-only — the closed window and the receipt. The row fills from the right, like the input. */
export function StarDisplay({ value, label }: { value: number; label: string }) {
  const t = useTranslations("ratings.form");
  return (
    <span role="img" aria-label={`${label}: ${t("starCount", { count: value, value: formatNumber(value) })}`} className="inline-flex gap-0.5 text-[1.25rem]">
      {STAR_VALUES.map((star) => (
        <StarIcon key={star} filled={star <= value} className={star <= value ? "text-fg-heading" : "text-fg-muted"} />
      ))}
    </span>
  );
}
