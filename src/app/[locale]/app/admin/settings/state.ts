import type { SettingsState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptySettingsState: SettingsState = { error: null, saved: false };
