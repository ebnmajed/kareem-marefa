import "server-only";
import { setPreference, type CategoryPreference, type NotificationCategory } from "@/lib/dal/notifications";

// SCR-029's writes — every one through `setPreference()`, the function that has written preferences since M3,
// unchanged (`REQ-UIX-077`: «every preference it wrote is still written»).
//
// ★ Every email write sets `in_app = true` beside it (`DEC-218` §2.1): in-app is not a setting, and a member who
// switched the inbox off under the old matrix gets it back the first time they touch the row.
//
// ★ A failure REVERTS what this call wrote, in reverse order, to what the row held before (`DEC-219` §1: the master
// «reverts it as one»). That is compensation, not a transaction: a revert that itself fails leaves the rows mixed, and
// the screen re-derives the switch from a fresh read, so a mixed set reads «off» — the accepted limit (M4).

type Write = { category: NotificationCategory; channel: "email" | "in_app"; enabled: boolean; was: boolean };

/** Writes `email = enabled` and `in_app = true` for each category. True when all landed; false when one failed and
 *  the ones before it were put back. */
export async function writeEmail(locale: string, categories: CategoryPreference[], enabled: boolean): Promise<boolean> {
  const plan: Write[] = categories.flatMap((row) => [
    { category: row.category, channel: "email" as const, enabled, was: row.enabled.email },
    { category: row.category, channel: "in_app" as const, enabled: true, was: row.enabled.inApp },
  ]);
  const done: Write[] = [];
  try {
    for (const write of plan) {
      await setPreference(locale, { category: write.category, channel: write.channel, enabled: write.enabled });
      done.push(write);
    }
    return true;
  } catch {
    for (const write of done.reverse()) {
      try {
        await setPreference(locale, { category: write.category, channel: write.channel, enabled: write.was });
      } catch {
        // M4: nothing more can be done here; the switch re-derives from what the database holds.
      }
    }
    return false;
  }
}
