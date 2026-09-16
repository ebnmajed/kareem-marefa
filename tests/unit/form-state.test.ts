// `src/lib/form-state.ts` — `16` §8.2 item 6, REQ-UIX-009, REQ-UIX-010.
//
// The behaviour under test is the one React 19 breaks by default: a form whose
// action resolves is RESET, so everything the member typed is gone unless the
// returned state carries it back. Everything else here — the attempt counter,
// the page-ordered summary — exists to make the recovery announceable.
import { describe, expect, it } from "vitest";
import {
  emptyFormState,
  formStateFrom,
  hasAttempted,
  hasFailed,
  summaryErrors,
  was,
  wasList,
  withErrors,
  withFormError,
  zodErrors,
  type FormState,
} from "@/lib/form-state";

// The propose form's own fields, in the order SCR-017 renders them.
const FIELDS = ["title", "abstract", "categoryId", "level", "targetAudience", "expectedDurationMinutes", "adminNotes"] as const;
type Field = (typeof FIELDS)[number];

function submission(over: Record<string, string | string[]> = {}): FormData {
  const fd = new FormData();
  fd.set("title", "كيف اختصرنا وقت إعداد التقارير");
  fd.set("abstract", "نبذة طويلة عن التجربة");
  fd.set("categoryId", "");
  fd.set("level", "introductory");
  fd.set("targetAudience", "");
  fd.set("expectedDurationMinutes", "45");
  fd.set("adminNotes", "");
  for (const [k, v] of Object.entries(over)) {
    fd.delete(k);
    for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
  }
  return fd;
}

describe("emptyFormState", () => {
  it("is a clean slate that has neither failed nor been attempted", () => {
    const state = emptyFormState<Field>();
    expect(state).toEqual({ errors: {}, formError: null, values: {}, lists: {}, attempt: 0 });
    expect(hasFailed(state)).toBe(false);
    expect(hasAttempted(state)).toBe(false);
  });

  it("is a fresh object every call, so two forms never share one", () => {
    const a = emptyFormState();
    const b = emptyFormState();
    expect(a).not.toBe(b);
    expect(a.errors).not.toBe(b.errors);
  });
});

describe("formStateFrom", () => {
  it("carries back every declared field, which is the whole point", () => {
    const state = formStateFrom(submission(), { fields: FIELDS });
    expect(was(state, "title")).toBe("كيف اختصرنا وقت إعداد التقارير");
    expect(was(state, "abstract")).toBe("نبذة طويلة عن التجربة");
    expect(was(state, "expectedDurationMinutes")).toBe("45");
  });

  it("does not trim — what comes back is what was typed", () => {
    const state = formStateFrom(submission({ title: "  مسافة متعمدة  " }), { fields: FIELDS });
    expect(was(state, "title")).toBe("  مسافة متعمدة  ");
  });

  it("reads multi-value controls with getAll, separately from the scalars", () => {
    const state = formStateFrom(submission({ coPresenters: ["a", "b"] }), { fields: FIELDS, lists: ["coPresenters"] });
    expect(wasList(state, "coPresenters")).toEqual(["a", "b"]);
    expect(state.values).not.toHaveProperty("coPresenters");
  });

  it("gives a declared list nobody ticked an empty array, not undefined", () => {
    const state = formStateFrom(submission(), { fields: FIELDS, lists: ["coPresenters"] });
    expect(state.lists.coPresenters).toEqual([]);
    expect(wasList(state, "coPresenters")).toEqual([]);
  });

  it("omits an absent field rather than inventing an empty string for it", () => {
    const fd = submission();
    fd.delete("adminNotes");
    const state = formStateFrom(fd, { fields: FIELDS });
    expect("adminNotes" in state.values).toBe(false);
    // `was()` still answers «empty», so no caller has to narrow.
    expect(was(state, "adminNotes")).toBe("");
  });

  it("ignores a File — a file input cannot be handed its value back", () => {
    const fd = submission();
    fd.set("title", new File(["bytes"], "report.pdf", { type: "application/pdf" }));
    const state = formStateFrom(fd, { fields: FIELDS });
    expect("title" in state.values).toBe(false);
    expect(was(state, "title")).toBe("");
  });

  it("reads nothing the form did not declare", () => {
    const state = formStateFrom(submission({ startsAt: "2026-10-01" }), { fields: FIELDS });
    // REQ-PRO-001: there is no date on this form, and a smuggled one is not
    // handed back as though there were.
    expect(state.values).not.toHaveProperty("startsAt");
  });

  it("starts unfailed even when the previous attempt failed", () => {
    const failed = withErrors(formStateFrom(submission(), { fields: FIELDS }), { title: "titleRequired" });
    const next = formStateFrom(submission(), { fields: FIELDS, previous: failed });
    expect(hasFailed(next)).toBe(false);
    expect(next.attempt).toBe(1); // the count carries; the failure does not
  });
});

describe("the attempt counter", () => {
  it("counts a failed round trip, and only a failed one", () => {
    const captured = formStateFrom(submission(), { fields: FIELDS });
    expect(captured.attempt).toBe(0);
    expect(withErrors(captured, { categoryId: "categoryRequired" }).attempt).toBe(1);
    expect(withFormError(captured, "failed").attempt).toBe(1);
  });

  it("keeps counting across round trips, so the summary re-focuses each time", () => {
    let state: FormState<Field> = emptyFormState<Field>();
    for (const n of [1, 2, 3]) {
      state = withErrors(formStateFrom(submission(), { fields: FIELDS, previous: state }), { categoryId: "categoryRequired" });
      expect(state.attempt).toBe(n);
    }
  });

  it("does not double-count when both kinds of failure are applied", () => {
    const captured = formStateFrom(submission(), { fields: FIELDS });
    const both = withErrors(withFormError(captured, "failed"), { title: "titleRequired" });
    expect(both.attempt).toBe(1);
  });

  it("is what turns on blur validation, and not before the first submit", () => {
    const captured = formStateFrom(submission(), { fields: FIELDS });
    expect(hasAttempted(captured)).toBe(false);
    expect(hasAttempted(withErrors(captured, { title: "titleRequired" }))).toBe(true);
  });
});

describe("withErrors / withFormError", () => {
  it("keeps every typed value alongside the failure", () => {
    const state = withErrors(formStateFrom(submission(), { fields: FIELDS }), { categoryId: "categoryRequired" });
    expect(was(state, "abstract")).toBe("نبذة طويلة عن التجربة");
    expect(state.errors.categoryId).toBe("categoryRequired");
    expect(hasFailed(state)).toBe(true);
  });

  it("keeps the ticked list alongside the failure too", () => {
    const captured = formStateFrom(submission({ coPresenters: ["m1"] }), { fields: FIELDS, lists: ["coPresenters"] });
    expect(wasList(withFormError(captured, "failed"), "coPresenters")).toEqual(["m1"]);
  });

  it("does not mutate the state it is given", () => {
    const captured = formStateFrom(submission(), { fields: FIELDS });
    withErrors(captured, { title: "titleRequired" });
    expect(captured.errors).toEqual({});
    expect(captured.attempt).toBe(0);
  });

  it("merges rather than replaces, so a second rule can add to the first", () => {
    const captured = formStateFrom(submission(), { fields: FIELDS });
    const state = withErrors(withErrors(captured, { title: "titleRequired" }), { level: "levelRequired" });
    expect(state.errors).toEqual({ title: "titleRequired", level: "levelRequired" });
  });

  it("carries a message KEY, never a rendered message", () => {
    const state = withErrors(formStateFrom(submission(), { fields: FIELDS }), { title: "titleRequired" });
    // The action cannot call useTranslations; the form renders the key.
    expect(state.errors.title).not.toMatch(/[؀-ۿ]/);
  });
});

describe("zodErrors", () => {
  const key = (field: Field, code: string, empty: boolean) =>
    field === "title" ? (empty ? "titleRequired" : code === "too_big" ? "titleTooLong" : "titleTooShort") : `${field}Invalid`;

  it("distinguishes «missing» from «too short» on one Zod code", () => {
    const issues = [{ path: ["title"], code: "too_small" }];
    expect(zodErrors(  { issues }, key, { title: "" })).toEqual({ title: "titleRequired" });
    expect(zodErrors({ issues }, key, { title: "قصير" })).toEqual({ title: "titleTooShort" });
  });

  it("treats null and undefined as empty, the way an optional field arrives", () => {
    const issues = [{ path: ["title"], code: "too_small" }];
    expect(zodErrors({ issues }, key, { title: null })).toEqual({ title: "titleRequired" });
    expect(zodErrors({ issues }, key, {})).toEqual({ title: "titleRequired" });
  });

  it("takes the first issue per field and ignores the rest", () => {
    const issues = [
      { path: ["title"], code: "too_small" },
      { path: ["title"], code: "too_big" },
      { path: ["level"], code: "invalid_value" },
    ];
    expect(zodErrors({ issues }, key, { title: "قصير" })).toEqual({ title: "titleTooShort", level: "levelInvalid" });
  });

  it("ignores an issue with no path rather than writing an empty key", () => {
    expect(zodErrors({ issues: [{ path: [], code: "custom" }] }, key)).toEqual({});
  });

  it("reads only the first path segment, so a nested issue lands on its field", () => {
    expect(zodErrors({ issues: [{ path: ["level", 0, "value"], code: "invalid_value" }] }, key)).toEqual({ level: "levelInvalid" });
  });
});

describe("summaryErrors — ask 5", () => {
  const options = {
    fields: FIELDS,
    label: (f: Field) => ({ title: "العنوان", abstract: "النبذة", categoryId: "الفئة", level: "المستوى", targetAudience: "الفئة المستهدفة", expectedDurationMinutes: "المدة", adminNotes: "الملاحظات" })[f],
    message: (k: string) => ({ titleRequired: "فضلًا أدخل عنوان موضوعك", categoryRequired: "اختر تصنيفًا", levelRequired: "اختر مستوى الجلسة" })[k] ?? k,
  };

  it("reads «الفئة: اختر تصنيفًا» — the label, then the message", () => {
    const state = withErrors(formStateFrom(submission(), { fields: FIELDS }), { categoryId: "categoryRequired" });
    expect(summaryErrors(state, options)).toEqual([{ fieldId: "categoryId", label: "الفئة", message: "اختر تصنيفًا" }]);
  });

  it("★ lists failures in PAGE order, not in the order the errors arrived", () => {
    const state = withErrors(formStateFrom(submission(), { fields: FIELDS }), {
      level: "levelRequired",
      title: "titleRequired",
      categoryId: "categoryRequired",
    });
    // `title` is the first control on SCR-017 and must be the first link, even
    // though Zod reported `level` first.
    expect(summaryErrors(state, options).map((e) => e.fieldId)).toEqual(["title", "categoryId", "level"]);
  });

  it("appends a failure on an undeclared field rather than dropping it", () => {
    const state = withErrors(formStateFrom(submission(), { fields: FIELDS }), {
      title: "titleRequired",
      coPresenters: "coPresentersTooMany",
    } as Partial<Record<Field, string>>);
    const ids = summaryErrors(state, { ...options, label: (f) => options.label(f) ?? String(f) }).map((e) => e.fieldId);
    expect(ids).toEqual(["title", "coPresenters"]);
  });

  it("targets the control's own id when the form ids differ from the names", () => {
    const state = withErrors(formStateFrom(submission(), { fields: FIELDS }), { title: "titleRequired" });
    expect(summaryErrors(state, { ...options, fieldId: (f) => `propose-${f}` })[0].fieldId).toBe("propose-title");
  });

  it("is empty when nothing failed, and empty for a whole-form failure", () => {
    const captured = formStateFrom(submission(), { fields: FIELDS });
    expect(summaryErrors(captured, options)).toEqual([]);
    // ★ A failed WRITE has no control to link to; the form renders it as its
    // own alert instead of inventing a focus target.
    expect(summaryErrors(withFormError(captured, "failed"), options)).toEqual([]);
    expect(hasFailed(withFormError(captured, "failed"))).toBe(true);
  });
});
