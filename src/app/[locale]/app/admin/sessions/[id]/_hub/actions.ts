"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publishSession, renameSession, sessionRenameInput, transitionSession } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";
import type { LifecycleState } from "./lifecycle-state";
import type { RenameState } from "./rename-state";

// The hub header's lifecycle action — REQ-UIX-089, REQ-SES-001, REQ-SES-010, DEC-228 §4.2.
//
// Authority is the two RPCs' (`publish_session()`, `transition_session()`, both over `assert_fresh_admin()`); Zod
// checks shape. A cancellation needs its written reason here, for the field's message, and again in the RPC.
// ★ The whole hub is revalidated as a LAYOUT: the header, the strip and the tab all say the new state.
// ★ No `export type` from this module — a re-exported type breaks the build while tsc stays clean; the state's type
// lives in `./lifecycle-state`.

function revalidateHub(locale: Locale, sessionId: string) {
  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}`, "layout");
  revalidatePath(`/${locale}/app/sessions/${sessionId}`);
}

export async function publishFromHub(locale: Locale, sessionId: string, _prev: LifecycleState, _formData: FormData): Promise<LifecycleState> {
  if (!z.uuid().safeParse(sessionId).success) return { error: "failed", done: null, reason: "" };
  try {
    await publishSession(locale, sessionId);
  } catch {
    return { error: "failed", done: null, reason: "" };
  }
  revalidateHub(locale, sessionId);
  return { error: null, done: "published", reason: "" };
}

export async function cancelFromHub(locale: Locale, sessionId: string, _prev: LifecycleState, formData: FormData): Promise<LifecycleState> {
  const typed = formData.get("reason")?.toString() ?? "";
  const parsed = z.object({ sessionId: z.uuid(), reason: z.string().trim().min(1).max(2000) }).safeParse({ sessionId, reason: typed });
  if (!parsed.success) return { error: parsed.error.issues.some((i) => i.path[0] === "reason") ? "reasonRequired" : "failed", done: null, reason: typed };
  try {
    await transitionSession(locale, parsed.data.sessionId, "cancel", parsed.data.reason);
  } catch {
    return { error: "failed", done: null, reason: typed };
  }
  revalidateHub(locale, sessionId);
  return { error: null, done: "cancelled", reason: "" };
}

// wave 27 — the rename (REQ-SES-021, DEC-255). Authority is the database's: `0010`'s column grant and
// `sessions_update_admin`, and the lead's guard refusing a title from `published` on. Zod checks the bounds so the field
// says it first; what the header then shows is the title the row holds.
export async function renameFromHub(locale: Locale, sessionId: string, _prev: RenameState, formData: FormData): Promise<RenameState> {
  const typed = formData.get("title")?.toString() ?? "";
  if (!z.uuid().safeParse(sessionId).success) return { error: "failed", saved: null, title: typed };
  const parsed = sessionRenameInput.safeParse({ title: typed });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.code === "too_big" ? "tooLong" : issue?.code === "too_small" ? "tooShort" : "failed", saved: null, title: typed };
  }
  let result;
  try {
    result = await renameSession(locale, sessionId, parsed.data.title);
  } catch {
    return { error: "failed", saved: null, title: typed };
  }
  if (!result.ok) {
    // A locked title means the session was published since the dialog opened: the header re-renders without the control.
    if (result.reason === "locked") revalidateHub(locale, sessionId);
    return { error: result.reason === "locked" ? "locked" : "failed", saved: null, title: typed };
  }
  revalidateHub(locale, sessionId);
  revalidatePath(`/${locale}/app/admin/sessions`);
  return { error: null, saved: result.title, title: "" };
}
