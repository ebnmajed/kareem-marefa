import type { SaveReceipt } from "@/lib/dal/admin-settings";
import type { BadgeRule } from "@/lib/dal/scoring-admin";
import { emptyFormState, type FormState } from "@/lib/form-state";

// SCR-054's form states and field names — a "use server" module exports async functions alone, so they live here.
// `receipt` is the server's answer to a save (`DEC-232` §3.2): the history rows it wrote, and nothing else says «حُفظ».

export type RecognitionState = FormState<string> & { receipt: SaveReceipt | null };
export const emptyRecognitionState: RecognitionState = { ...emptyFormState<string>(), receipt: null };

/** Everything edit mode opened, with each row's `updated_at` — the stale check (`DEC-232` §3.3). A badge carries its
 *  whole record, so a save of its name or switch writes its rule and certificate flag back exactly as they were. */
export interface RecognitionOpened {
  levels: { id: string; name: string; thresholdPoints: number; updatedAt: string }[];
  badges: { id: string; name: string; description: string | null; issuesCertificate: boolean; rule: BadgeRule; retired: boolean; updatedAt: string }[];
  perks: { id: string; key: "priority_rsvp" | "can_host"; enabled: boolean; requiredLevelId: string | null; requiredBadgeId: string | null; updatedAt: string }[];
  streaks: { id: string; requiredCount: number; enabled: boolean; updatedAt: string }[];
}

/** A posted field's name, and its control's id. */
export const field = (kind: "level" | "badge" | "perk" | "streak", id: string, name: string) => `${kind}-${id}-${name}`;
