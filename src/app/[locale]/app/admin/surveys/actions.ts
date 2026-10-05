"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { deleteSurveyTemplate } from "@/lib/dal/surveys";

// SCR-065's one write from the list — the second step of «احذف القالب» (REQ-UIX-106, REQ-SUR-001). Zod first
// (REQ-NFR-002); the authority is `survey_template_delete()`'s own `assert_survey_staff()`.
//
// ★ The record is the database's: the lead's trigger on `survey_templates` writes `survey_template.deleted` with the
// actor from the claims (`DEC-231` §4, `DEC-232` §2.5). Nothing here writes `audit_log`, so nothing is written twice.
//
// ★ The outcome travels in the URL (`?deleted=1`, `?error=generic`): the list is re-read either way, it survives a
// reload, and the form needs no island. A survey already copied from the template keeps every question (`0124`'s
// `on delete set null`).

const target = z.uuid();

export async function deleteFromList(locale: Locale, templateId: string): Promise<void> {
  let ok = false;
  if (target.safeParse(templateId).success) {
    try {
      await deleteSurveyTemplate(locale, templateId);
      ok = true;
    } catch (e) {
      unstable_rethrow(e);
      ok = false;
    }
  }
  redirect({ href: { pathname: "/app/admin/surveys", query: ok ? { deleted: "1" } : { error: "generic" } }, locale });
}
