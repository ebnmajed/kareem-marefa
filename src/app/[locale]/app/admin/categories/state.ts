import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and nothing else.
//
// ★ Replaces the old `CategoryState = { error: string | null }` — moved onto
// `lib/form-state`'s shared model for wave 7 (`DEC-137`), same as
// `admin/venues/state.ts`.

export const CATEGORY_FIELDS = ["name"] as const;
export type CategoryField = (typeof CATEGORY_FIELDS)[number];
export const CATEGORY_REQUIRED_FIELDS: readonly CategoryField[] = ["name"];

export type CategoryState = FormState<CategoryField>;
export const emptyCategoryState: CategoryState = emptyFormState<CategoryField>();
