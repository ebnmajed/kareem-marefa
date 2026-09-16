// The form state every Server Action returns and every form re-hydrates from —
// `16` §8.2 item 6, REQ-UIX-009, REQ-UIX-010, DEC-091.
//
// ★ THE BUG THIS EXISTS TO STOP. React 19 RESETS a form once its action
// resolves. An uncontrolled `<textarea>` therefore comes back EMPTY on a
// validation failure, which throws away the 2000-character abstract the member
// just spent five minutes writing — while the copy on screen promises
// «بياناتك ما زالت في النموذج». `tests/e2e/sessions-propose.spec.ts` found it
// at M2 and nothing else would have. The fix was `was()` in
// `app/propose/proposal-form.tsx`: every field reads its `defaultValue` back
// out of the returned state, so the reset restores instead of clearing.
//
// That fix lived in one form. Fourteen other forms in the product do not have
// it. This module is that pattern generalised, so no form has to remember.
//
// ★ NO `import "server-only"`, deliberately, and NO zod import either.
//
// Both halves of the round trip use this file: the Server Action CAPTURES with
// `formStateFrom()` and the client form READS with `was()`. Marking it
// server-only would break the reading half. And `zodErrors()` takes the error
// STRUCTURALLY — `{ issues: [{ path, code }] }` — rather than importing
// `ZodError`, so a client form that imports `was()` does not drag zod into the
// browser bundle for a type it never uses at runtime.

import type { FormSummaryError } from "@/components/ui";

/**
 * What comes back from a failed round trip.
 *
 * `F` is the form's field names, so `errors`, `values` and every read are
 * checked against the fields the form actually declares — a typo in
 * `was("abstrct")` is a compile error rather than a silently empty textarea.
 */
export interface FormState<F extends string = string> {
  /**
   * field → message KEY under the form's namespace, never a rendered message.
   *
   * A Server Action cannot call `useTranslations`, and a message that crosses
   * the action boundary is a message that cannot be re-rendered when the
   * locale changes. The action names the failure; the form renders it.
   */
  errors: Partial<Record<F, string>>;
  /** A whole-form failure — the write itself failed. Same key space. */
  formError: string | null;
  /** What the member typed, handed straight back. See the note above. */
  values: Partial<Record<F, string>>;
  /** Multi-value controls — a checkbox group, a multi-select. */
  lists: Record<string, string[]>;
  /**
   * How many FAILED round trips this form has made. ★ It earns its place three
   * times and none of them are cosmetic:
   *
   * 1. FOCUS. `<FormSummary key={state.attempt}>` remounts on every failure, so
   *    the summary's own mount effect focuses it exactly once per round trip —
   *    including two consecutive failures carrying identical errors, where an
   *    effect keyed on the error list would not fire.
   * 2. §8.2 ITEM 5 — «inline validation on blur, AFTER THE FIRST SUBMIT ATTEMPT
   *    ONLY». `hasAttempted()` is that fact, and it survives the round trip,
   *    which a `useState` flag set in an `onSubmit` handler does not.
   * 3. It distinguishes the initial state from one that came back, which
   *    nothing else in this shape does.
   */
  attempt: number;
}

/** The `useActionState` initial value. Fresh each call — never shared. */
export function emptyFormState<F extends string = string>(): FormState<F> {
  return { errors: {}, formError: null, values: {}, lists: {}, attempt: 0 };
}

export interface CaptureOptions<F extends string> {
  /**
   * Every field the form declares, IN THE ORDER THEY APPEAR ON THE PAGE.
   *
   * The order is not decoration: `summaryErrors()` lists failures in it, so the
   * summary's first link is the first problem on the page rather than the first
   * key Zod happened to report.
   */
  fields: readonly F[];
  /** Fields read with `getAll()` rather than `get()`. */
  lists?: readonly string[];
  /** The previous state, so `attempt` keeps counting across round trips. */
  previous?: FormState<F>;
}

/**
 * Read the whole form out of `FormData` once, at the top of the action.
 *
 * ★ Nothing is trimmed. A trim here would silently change what the member
 * typed and hand it back as though they had typed it — and the schema is where
 * trimming belongs, because only the schema knows which fields tolerate it.
 *
 * A field that is absent from the `FormData` (a disabled control, a checkbox
 * nobody ticked) is absent from `values` rather than present-and-empty, so
 * `was()` returning `""` means «empty» and not «unknown».
 */
export function formStateFrom<F extends string>(formData: FormData, options: CaptureOptions<F>): FormState<F> {
  const values: Partial<Record<F, string>> = {};
  for (const field of options.fields) {
    const raw = formData.get(field);
    // A File is not a value a form re-hydrates — a file input cannot be given
    // one back, by design, and `String(file)` would put "[object File]" in the
    // box. `ui/file-drop` owns that surface (REQ-MAT-001) and it is `content`'s.
    if (raw === null || typeof raw !== "string") continue;
    values[field] = raw;
  }

  const lists: Record<string, string[]> = {};
  for (const field of options.lists ?? []) {
    lists[field] = formData.getAll(field).filter((v): v is string => typeof v === "string");
  }

  return { errors: {}, formError: null, values, lists, attempt: options.previous?.attempt ?? 0 };
}

/** True once anything has failed — the form has something to announce. */
export function hasFailed<F extends string>(state: FormState<F>): boolean {
  return state.formError !== null || Object.keys(state.errors).length > 0;
}

/**
 * True once the member has submitted at least once and been refused.
 *
 * §8.2 item 5: inline validation on blur starts HERE and not before. Validating
 * a field the member has not finished with yet — and has never submitted —
 * tells them they are wrong while they are still typing.
 */
export function hasAttempted<F extends string>(state: FormState<F>): boolean {
  return state.attempt > 0;
}

// Idempotent: a state that already carries a failure does not count a second
// one. `withErrors` and `withFormError` are mutually exclusive by construction
// in every action written so far, but a caller that chains them must not push
// the summary's remount key two steps in one round trip.
const nextAttempt = <F extends string>(state: FormState<F>) => (hasFailed(state) ? state.attempt : state.attempt + 1);

/** Return the captured state with per-field failures, and one more attempt. */
export function withErrors<F extends string>(state: FormState<F>, errors: Partial<Record<F, string>>): FormState<F> {
  return { ...state, errors: { ...state.errors, ...errors }, attempt: nextAttempt(state) };
}

/**
 * Return the captured state with a whole-form failure, and one more attempt.
 *
 * ★ This does NOT go in `<FormSummary>`. `FormSummaryError.fieldId` is the
 * link target and the focus target, and a failed write has no control to
 * focus. The form renders it as its own alert — see the note on
 * `summaryErrors()`.
 */
export function withFormError<F extends string>(state: FormState<F>, key: string): FormState<F> {
  return { ...state, formError: key, attempt: nextAttempt(state) };
}

/**
 * What the member typed, for `defaultValue`. The whole point of the module.
 */
export function was<F extends string>(state: FormState<F>, field: F): string {
  return state.values[field] ?? "";
}

/** The same, for a multi-value control — `defaultChecked={wasList(…).includes(id)}`. */
export function wasList<F extends string>(state: FormState<F>, field: string): string[] {
  return state.lists[field] ?? [];
}

/**
 * A Zod failure, mapped to message keys — FIRST ISSUE PER PATH WINS.
 *
 * The error is taken structurally rather than as a `ZodError` so this module
 * imports zod neither at runtime nor at type level (see the header).
 *
 * `key` is the caller's own mapping, because Zod raises ONE code for two
 * different member-facing facts: a member reading «العنوان قصير جدًا» when they
 * left the box empty is being told the wrong thing. `errorKey()` in
 * `app/propose/actions.ts` is already exactly this function.
 */
export function zodErrors<F extends string>(
  error: { issues: readonly { path: readonly PropertyKey[]; code: string }[] },
  key: (field: F, code: string, empty: boolean) => string,
  raw?: Partial<Record<F, unknown>>,
): Partial<Record<F, string>> {
  const errors: Partial<Record<F, string>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "") as F;
    if (!field || field in errors) continue;
    const value = raw?.[field];
    errors[field] = key(field, issue.code, value === null || value === undefined || value === "");
  }
  return errors;
}

export interface SummaryOptions<F extends string> {
  /** The page order. See `CaptureOptions.fields`. */
  fields: readonly F[];
  /** The field's label, so the summary reads «الفئة: اختر تصنيفًا». */
  label: (field: F) => string;
  /** The message key → the rendered sentence. */
  message: (key: string) => string;
  /** The control's DOM id. Defaults to the field name, which is the house rule. */
  fieldId?: (field: F) => string;
}

/**
 * `FormState` → the list `<FormSummary>` renders. Ask 5, joined up.
 *
 * ★ ORDERED BY THE PAGE, NOT BY THE ERROR OBJECT. `Object.keys(errors)` is
 * Zod's issue order, which is schema order, which usually matches the page and
 * is not the same fact. A summary whose first link is not the first problem
 * sends the member upward through a form they have already filled in.
 *
 * ★ A failure on a field the form did not declare is APPENDED rather than
 * dropped. It has no link target on the page, but a message the member cannot
 * see is worse than one that does not scroll anywhere, and silently losing a
 * server error is how a form comes to refuse a submission for no stated reason.
 *
 * `formError` is deliberately absent — see `withFormError()`.
 */
export function summaryErrors<F extends string>(state: FormState<F>, options: SummaryOptions<F>): FormSummaryError[] {
  const id = options.fieldId ?? ((field: F) => field);
  const entry = (field: F, key: string): FormSummaryError => ({
    fieldId: id(field),
    label: options.label(field),
    message: options.message(key),
  });

  const declared = new Set<string>(options.fields);
  const summary: FormSummaryError[] = [];
  for (const field of options.fields) {
    const key = state.errors[field];
    if (key) summary.push(entry(field, key));
  }
  for (const [field, key] of Object.entries(state.errors) as [F, string | undefined][]) {
    if (key && !declared.has(field)) summary.push(entry(field, key));
  }
  return summary;
}
