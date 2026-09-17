"use server";

import { revalidatePath } from "next/cache";
import { createTask, rescopeTask, submitTaskFormResponse, toggleTaskCompletion, type CreateTaskInput } from "@/lib/dal/tasks";

// REQ-TSK-001/003/004 — small, non-upload mutations, so Server Actions
// (not Route Handlers) are the right shape here, matching
// src/components/materials/actions.ts's own convention.

export async function toggleTaskCompletionAction(locale: string, sessionId: string, taskId: string, completed: boolean): Promise<{ error: string | null }> {
  try {
    await toggleTaskCompletion(locale, { taskId, completed });
    revalidatePath(`/${locale}/app/sessions/${sessionId}`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}

export async function submitTaskFormResponseAction(
  locale: string,
  sessionId: string,
  taskId: string,
  response: Record<string, string>,
): Promise<{ error: string | null }> {
  try {
    await submitTaskFormResponse(locale, { taskId, response });
    revalidatePath(`/${locale}/app/sessions/${sessionId}`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}

export async function createTaskAction(locale: string, input: CreateTaskInput): Promise<{ error: string | null }> {
  try {
    await createTask(locale, input);
    revalidatePath(`/${locale}/app/sessions/${input.sessionId}`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}

// REQ-SES-018/DEC-121 — the scope chip, matching `materials/actions.ts`'s own
// `rescopeMaterialAction` shape.
export async function rescopeTaskAction(locale: string, sessionId: string, taskId: string, sessionDayId: string | null): Promise<{ error: string | null }> {
  try {
    await rescopeTask(locale, { taskId, sessionDayId });
    revalidatePath(`/${locale}/app/sessions/${sessionId}`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}
