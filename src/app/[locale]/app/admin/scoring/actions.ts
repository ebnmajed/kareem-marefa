"use server";

import { redirect } from "next/navigation";
import {
  companyHostingRuleUpdateInput,
  companyPercentRuleUpdateInput,
  manualAdjustmentInput,
  scoringRuleUpdateInput,
  sessionHostCompanyInput,
  setSessionHostCompany,
  submitManualAdjustment,
  updateCompanyHostingRule,
  updateCompanyPercentRule,
  updateScoringRule,
} from "@/lib/dal/scoring-admin";

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

export async function saveCompanyHostingRule(formData: FormData) {
  const parsed = companyHostingRuleUpdateInput.safeParse({
    ruleId: formData.get("ruleId")?.toString(),
    enabled: formData.get("enabled") === "on",
    points: Number.parseInt(formData.get("points")?.toString() ?? "", 10),
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);

  try {
    await updateCompanyHostingRule("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}

export async function saveCompanyPercentRule(formData: FormData) {
  const parsed = companyPercentRuleUpdateInput.safeParse({
    ruleId: formData.get("ruleId")?.toString(),
    enabled: formData.get("enabled") === "on",
    pointsPerPercent: Number.parseFloat(formData.get("pointsPerPercent")?.toString() ?? ""),
    capPoints: Number.parseInt(formData.get("capPoints")?.toString() ?? "", 10),
    minActiveMembers: Number.parseInt(formData.get("minActiveMembers")?.toString() ?? "", 10),
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);

  try {
    await updateCompanyPercentRule("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}

export async function saveSessionHostCompany(formData: FormData) {
  const companyId = formData.get("companyId")?.toString();
  const parsed = sessionHostCompanyInput.safeParse({
    sessionId: formData.get("sessionId")?.toString(),
    companyId: companyId ? companyId : null,
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);

  try {
    await setSessionHostCompany("ar", parsed.data);
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
