"use client";

// One brand colour token: a swatch, a hex input, both controlled and kept
// in sync from the same piece of state (REQ-DSG-021, SCR-059). Fully
// controlled rather than `defaultValue` — React re-asserts the DOM value on
// every render, so a failed save action's native form reset (React 19) is
// never visible here, and the live preview updates on every keystroke.
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function ColourField({
  name,
  label,
  value,
  onChange,
  id,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  id: string;
}) {
  const valid = HEX_RE.test(value);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-hidden="true"
        tabIndex={-1}
        value={valid ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-10 shrink-0 cursor-pointer rounded-field border border-edge bg-transparent p-0.5"
      />
      <label className="min-w-0 flex-1 text-label text-fg-heading" htmlFor={id}>
        {label}
        <input
          id={id}
          name={name}
          type="text"
          dir="ltr"
          inputMode="text"
          maxLength={7}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!valid}
          className="mt-1 block w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body-sm text-fg-heading"
        />
      </label>
    </div>
  );
}
