import type { CategoryState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptyCategoryState: CategoryState = { error: null };
