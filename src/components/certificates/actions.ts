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

export async function releaseAchievements(formData: FormData) {
  const ids = formData.getAll("id").map((v) => v.toString());
  const parsed = releaseInput.safeParse({ ids });
  if (!parsed.success) return;
  await releaseCertificates("ar", parsed.data);
  revalidatePath("/[locale]/app/admin/recognition", "page");
}
