"use server";

import { redirect } from "next/navigation";
import { manualAdjustmentInput, scoringRuleUpdateInput, submitManualAdjustment, updateScoringRule } from "@/lib/dal/scoring-admin";

// SCR-053. `"use server"` modules export async functions and types alone
// (CLAUDE.md's own rule for this repository's build gate).

const SCREEN = "/ar/app/admin/scoring";

export async function saveScoringRule(formData: FormData) {
  const parsed = scoringRuleUpdateInput.safeParse({
    ruleId: formData.get("ruleId")?.toString(),
    points: Number.parseInt(formData.get("points")?.toString() ?? "", 10),
    enabled: formData.get("enabled") === "on",
    capPerSession: formData.get("capPerSession") ? Number.parseInt(formData.get("capPerSession")!.toString(), 10) : null,
    cooldownSeconds: formData.get("cooldownSeconds") ? Number.parseInt(formData.get("cooldownSeconds")!.toString(), 10) : null,
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);

  try {
    await updateScoringRule("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}

export async function saveManualAdjustment(formData: FormData) {
  const parsed = manualAdjustmentInput.safeParse({
    memberId: formData.get("memberId")?.toString(),
    amount: Number.parseInt(formData.get("amount")?.toString() ?? "", 10),
    reason: formData.get("reason")?.toString() ?? "",
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);

  try {
    await submitManualAdjustment("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}
