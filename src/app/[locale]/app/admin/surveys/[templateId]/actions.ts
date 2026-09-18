"use server";

import type { Locale } from "@/i18n/routing";
import { deleteSurveyTemplate, saveSurveyTemplate, saveTemplateInput, type SaveTemplateOutcome } from "@/lib/dal/surveys";

// SCR-065's writes. Zod first (REQ-NFR-002), then the one RPC — whose own
// `assert_survey_staff()` is the authority boundary, not this file.
//
// ★ CALLED FROM A TRANSITION, NOT FROM `<form action>` (DEC-149 §1). The editor
// holds the whole template in state, because `ui/reorderable-list` is
// controlled and the order IS state; and `ui/input` carries no controlled-reset
// repair, so React's reset after a `<form action>` submission would empty every
// prompt and every option label the moment a save was refused. The island calls
// this inside `startTransition` and renders the outcome itself.
//
// Nothing here revalidates a tag: Cache Components is off (DEC-013) and these
// screens are dynamic through the DAL's cookies, so the island navigates or
// refreshes and the server component runs again.
//
// A "use server" module exports async functions and nothing else — the outcome
// TYPE is the DAL's.

export async function saveTemplate(locale: Locale, input: unknown): Promise<SaveTemplateOutcome | { status: "generic" }> {
  const parsed = saveTemplateInput.safeParse(input);
  if (!parsed.success) {
    // The editor validates first, so this is a tampered or stale payload rather
    // than something a staff member typed. It never quotes the input back.
    return { status: "generic" };
  }
  try {
    return await saveSurveyTemplate(locale, parsed.data);
  } catch {
    return { status: "generic" };
  }
}

export async function removeTemplate(locale: Locale, templateId: string): Promise<{ status: "ok" | "generic" }> {
  try {
    await deleteSurveyTemplate(locale, templateId);
    return { status: "ok" };
  } catch {
    return { status: "generic" };
  }
}
