"use client";

import { createContext, useContext, useId } from "react";
import { useTranslations } from "next-intl";
import type { FieldProps, Size } from "@/components/ui";
import { AlertCircleIcon } from "@/components/ui/icons";

// ★ THE ONLY WRAPPER — `16` §8.2 item 1, REQ-UIX-009, REQ-UIX-011.
//
// Label, optional hint, the control, the error. It wires `htmlFor`,
// `aria-describedby`, `aria-invalid` and `aria-required` ITSELF, so no screen
// can get them wrong. Fourteen screens each re-declared
// `const FIELD = "mt-2 block w-full rounded-field border border-edge-strong …"`
// and each wired the aria by hand; the class string alone appears in 65 files,
// which is why nobody has ever changed the focus ring.
//
// ★★ CONTEXT, NOT `cloneElement`, AND THAT IS A CORRECTNESS DECISION.
// `FieldProps.children` is `ReactNode`, and the obvious implementation —
// cloning the single child and injecting the aria — works only while the child
// IS the control. It is not, on the propose form's duration field, which is
// `<div class="flex"><Input/><span>دقيقة</span></div>`: cloning would put
// `aria-invalid` on a `<div>` and the input would carry nothing. So the wiring
// travels down a context and `Input` / `Textarea` / `Select` read it. An
// explicit prop on the control always wins, and a control used outside a
// `<Field>` is an ordinary control.
//
// ★ `"use client"` costs nothing here: this component calls `useId()` to
// generate the id when one is not passed, and `useId` is a client hook. The
// day-one stub called it with no directive, which would have thrown the first
// time a Server Component rendered it.
//
// ★ PASS THE ID TO `<Field>`, NOT TO THE CONTROL. `Field` owns `htmlFor`; a
// control that sets a different `id` of its own leaves the label pointing at
// nothing. That misuse is not silent — it is an `axe` `label` violation, and
// every track in this milestone runs axe in its component tests.

/** What `<Field>` hands its control. Read it with `useFieldWiring()`. */
export interface FieldWiring {
  id: string;
  /** The hint and the error, in the order they should be read. */
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldWiring | null>(null);

/** The control's side of the contract. `null` outside a `<Field>`. */
export function useFieldWiring(): FieldWiring | null {
  return useContext(FieldContext);
}

// The one place the control class string is written down (`ui-lint` excludes
// `src/components/ui/` for exactly this reason, DEC-087). Everything else in
// the product imports it from here.
//
// `--edge-strong` is #767f8c rather than the silver the page uses elsewhere
// because an input border on white must meet 3:1 (SC 1.4.11) — globals.css
// says so on the token itself. The focus ring is the global `:focus-visible`
// rule; no control redeclares it.
const controlBase =
  "block w-full rounded-field border bg-canvas text-fg-heading placeholder:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60";

// 44 px is the floor for a touch target (REQ-NFR-007). `sm` is for dense
// console rows where the row itself is the target; it is never a form control
// a member fills in on a phone.
const controlSizes: Record<Size, string> = {
  sm: "min-h-9 px-3 py-1.5 text-caption",
  md: "min-h-11 px-4 py-2.5 text-body",
  lg: "min-h-12 px-4 py-3 text-body",
};

/**
 * The control's classes. Invalid is a 1 px `--color-error-border`, and it is
 * never the only channel — the message, the glyph and `aria-invalid` carry it
 * too (`16` §8.2 item 3).
 */
export function controlClass(invalid = false, size: Size = "md", extra = "") {
  return `${controlBase} ${controlSizes[size]} ${invalid ? "border-error-border" : "border-edge-strong"} ${extra}`;
}

export function Field({ id, label, hint, error, required, children, className = "" }: FieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const t = useTranslations("ui");

  // The error first: when focus lands on a control the member was sent to, the
  // problem is the thing to say before the advice.
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="text-label text-fg-heading">
        {label}
        {/* ★ «مطلوب», never an asterisk (REQ-UIX-011): an asterisk collides
            with the RTL run, and marking required positively means a member
            never has to infer it from the ABSENCE of «اختياري».

            It is NOT `aria-hidden`, although `aria-required` below says the
            same thing. The small redundancy buys the one piece of wiring that
            survives misuse: `htmlFor` associates the label with ANY control,
            including a raw `<input>` a screen drops in here, whereas the
            context reaches only this file's own controls. It does mean the
            control's accessible name ends «… مطلوب», so a test querying by
            label matches on the whole string. */}
        {required ? (
          <>
            {/* A literal space, not only the margin: the margin is layout and
                contributes nothing to the accessible name, which would
                otherwise run the two words together. */}{" "}
            <span className="ms-2 text-caption font-normal text-fg-muted">{t("field.required")}</span>
          </>
        ) : null}
      </label>

      {hint ? (
        <p id={hintId} className="mt-1 text-caption text-fg-muted">
          {hint}
        </p>
      ) : null}

      <div className="mt-2">
        <FieldContext.Provider value={{ id: fieldId, describedBy, invalid: Boolean(error), required: Boolean(required) }}>
          {children}
        </FieldContext.Provider>
      </div>

      {/* ★ NO `role="alert"` HERE, and the day-one stub had one. `<FormSummary>`
          is already `role="alert"`; a six-error submission would announce seven
          times. The summary is the announcement. This is the detail found on
          ARRIVAL — it is in the control's `aria-describedby`, so it is read the
          moment focus lands, which is exactly where the summary's link sends
          the member. */}
      {error ? (
        <p id={errorId} className="mt-2 flex items-start gap-2 text-caption text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
