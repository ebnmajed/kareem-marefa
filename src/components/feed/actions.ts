"use server";

import { z } from "zod";
import { toggleReaction } from "@/lib/dal/reactions";

// The feed's one write — a like on a session (REQ-EVT-003, DEC-206 §4.51). A reaction earns nothing
// (REQ-EVT-004); the session's own event page reads the same rows. Validation is shape; `reactions`' own
// policies decide who may write (`p3_self_insert`, `p3_self_delete`). Only `like` is written this wave.

const input = z.object({ locale: z.enum(["ar", "en"]), sessionId: z.uuid() });

export async function toggleSessionLike(locale: string, sessionId: string): Promise<{ ok: true; liked: boolean } | { ok: false }> {
  const parsed = input.safeParse({ locale, sessionId });
  if (!parsed.success) return { ok: false };
  try {
    const result = await toggleReaction(parsed.data.locale, { sessionId: parsed.data.sessionId }, "like");
    return { ok: true, liked: result === "added" };
  } catch {
    return { ok: false };
  }
}
