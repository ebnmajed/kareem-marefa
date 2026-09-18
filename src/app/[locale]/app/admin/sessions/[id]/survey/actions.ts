"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { attachSurvey, detachSurvey } from "@/lib/dal/surveys";

// SCR-064's two writes. Zod first (REQ-NFR-002); the authority is
// `assert_survey_staff()` inside each RPC, and the outcomes are envelopes
// (DEC-043) rather than exceptions, so «this session already has one» and «a
// member has answered» can reach the screen as sentences.
//
// ★ THE OUTCOME TRAVELS IN THE URL, not in client state. Attaching and
// detaching change what the whole page shows, so the screen is re-read from the
// database either way; `?attached=1` / `?error=has_responses` is the same shape
// SCR-015's receipt uses (`?rated=1`, DEC-141), it survives a reload, and it
// needs no island for a form with one control.
//
// Both writes are audited in SQL — `survey.attached` and `survey.detached`, one
// row each (sync 1, Q5): they change what members are asked, and by whom.

const target = z.object({ sessionId: z.uuid(), templateId: z.uuid().optional() });

function back(locale: Locale, sessionId: string, query: Record<string, string>): never {
  // `redirect()` throws, which is how a Server Action navigates; TypeScript
  // needs to be told that this function therefore never returns.
  redirect({ href: { pathname: `/app/admin/sessions/${sessionId}/survey`, query }, locale });
  throw new Error("unreachable");
}

export async function attach(locale: Locale, sessionId: string, formData: FormData): Promise<void> {
  const parsed = target.safeParse({ sessionId, templateId: formData.get("templateId") });
  if (!parsed.success || !parsed.data.templateId) back(locale, sessionId, { error: "generic" });

  let outcome;
  try {
    outcome = await attachSurvey(locale, parsed.data.sessionId, parsed.data.templateId);
  } catch {
    back(locale, sessionId, { error: "generic" });
  }
  back(locale, sessionId, outcome.status === "ok" ? { attached: "1" } : { error: outcome.status });
}

export async function detach(locale: Locale, sessionId: string): Promise<void> {
  const parsed = target.safeParse({ sessionId });
  if (!parsed.success) back(locale, sessionId, { error: "generic" });

  let outcome;
  try {
    outcome = await detachSurvey(locale, parsed.data.sessionId);
  } catch {
    back(locale, sessionId, { error: "generic" });
  }
  back(locale, sessionId, outcome.status === "ok" ? { detached: "1" } : { error: outcome.status });
}
