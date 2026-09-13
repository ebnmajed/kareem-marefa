"use server";

import { redirect } from "next/navigation";
import { profileInput, updateMyProfile } from "@/lib/dal/members";

// Zod first, then the DAL (REQ-NFR-002). Authority is not in the form: the
// DAL writes the session's own row, and the column grant refuses the rest.
export async function saveProfile(formData: FormData) {
  const parsed = profileInput.safeParse({
    displayName: formData.get("displayName")?.toString() ?? "",
    companyId: formData.get("companyId")?.toString() || null,
    jobTitle: formData.get("jobTitle")?.toString() || null,
    bio: formData.get("bio")?.toString() || null,
    leaderboardOptOut: formData.get("leaderboardOptOut") === "on",
  });
  if (!parsed.success) redirect("/ar/app/me?error=1");
  await updateMyProfile("ar", parsed.data);
  redirect("/ar/app/me?saved=1");
}
