"use server";

import { revalidatePath } from "next/cache";
import { releaseCertificates, releaseInput } from "@/lib/dal/certificates";

// The `<HeldAchievements>` slot's one write. It lives beside the component
// rather than in the host page's folder, so the recognition screen renders
// the slot and imports nothing else — the TEAM.md §2 contract, extended to
// a slot that acts.
//
// `revalidatePath` rather than a redirect: the slot does not own the route
// it renders on, so it must not decide where the browser goes next.
//
// ★ It ANSWERS (wave 8, `console`'s R-D1): an empty or malformed selection is
// `invalid`, a refusal is `not_authorized`, a release says how many — so the
// confirm that called it can close on a result and say which, instead of
// closing on nothing and saying nothing.
//
// `"use server"` modules export async functions and types alone.

export type AchievementReleaseResult = { status: "ok"; count: number } | { status: "not_authorized" } | { status: "invalid" };

export async function releaseAchievements(formData: FormData): Promise<AchievementReleaseResult> {
  const ids = formData.getAll("id").map((v) => v.toString());
  const parsed = releaseInput.safeParse({ ids });
  if (!parsed.success) return { status: "invalid" };
  const result = await releaseCertificates("ar", parsed.data);
  if (result.status !== "ok") return { status: "not_authorized" };
  revalidatePath("/[locale]/app/admin/recognition", "page");
  return { status: "ok", count: result.count };
}
