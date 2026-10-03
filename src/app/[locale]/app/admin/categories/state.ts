import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";

// A "use server" module may export async functions and nothing else.

export const CATEGORY_FIELDS = ["name"] as const;
export type CategoryField = (typeof CATEGORY_FIELDS)[number];
export const CATEGORY_REQUIRED_FIELDS: readonly CategoryField[] = ["name"];

export type CategoryState = SavedFormState<CategoryField>;
export const emptyCategoryState: CategoryState = emptySavedState<CategoryField>();
