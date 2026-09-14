"use server";

import { redirect } from "next/navigation";
import {
  badgeUpdateInput,
  levelUpdateInput,
  manualBadgeAwardInput,
  perkUpdateInput,
  streakRuleUpdateInput,
  submitManualBadgeAward,
  updateBadge,
  updateLevel,
  updatePerk,
  updateStreakRule,
} from "@/lib/dal/scoring-admin";

// SCR-054. `"use server"` modules export async functions and types alone.

const SCREEN = "/ar/app/admin/recognition";

export async function saveBadge(formData: FormData) {
  const parsed = badgeUpdateInput.safeParse({
    badgeId: formData.get("badgeId")?.toString(),
    description: formData.get("description")?.toString() || null,
    issuesCertificate: formData.get("issuesCertificate") === "on",
    retired: formData.get("retired") === "on",
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);
  try {
    await updateBadge("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}

export async function saveLevel(formData: FormData) {
  const parsed = levelUpdateInput.safeParse({
    levelId: formData.get("levelId")?.toString(),
    thresholdPoints: Number.parseInt(formData.get("thresholdPoints")?.toString() ?? "", 10),
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);
  try {
    await updateLevel("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}

export async function savePerk(formData: FormData) {
  const parsed = perkUpdateInput.safeParse({
    perkId: formData.get("perkId")?.toString(),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);
  try {
    await updatePerk("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}

export async function saveStreakRule(formData: FormData) {
  const parsed = streakRuleUpdateInput.safeParse({
    streakRuleId: formData.get("streakRuleId")?.toString(),
    requiredCount: Number.parseInt(formData.get("requiredCount")?.toString() ?? "", 10),
    bonusPoints: Number.parseInt(formData.get("bonusPoints")?.toString() ?? "", 10),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);
  try {
    await updateStreakRule("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}

export async function saveManualBadgeAward(formData: FormData) {
  const parsed = manualBadgeAwardInput.safeParse({
    memberId: formData.get("memberId")?.toString(),
    badgeId: formData.get("badgeId")?.toString(),
    reason: formData.get("reason")?.toString() ?? "",
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);
  try {
    await submitManualBadgeAward("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}
