"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { toggleReaction } from "@/lib/dal/reactions";
import { reserveSeat } from "@/lib/dal/rsvp";

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
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false };
  }
}

// ★ The owner's ruling (DEC-276, amending DEC-206 §4.57): a member reserves from the feed without leaving it. The
// same RPC the event page calls — every gate is `reserve_seat()`'s and unchanged — and the page is refreshed in the
// same response, so the post re-renders from the server as «محجوز» or «قائمة الانتظار». A refusal is not thrown:
// the refreshed post shows the session's actual state (full → the waitlist, closed → nothing to press).
const reserveInput = z.object({ locale: z.enum(["ar", "en"]), sessionId: z.uuid() });

export async function reserveFromFeed(locale: string, sessionId: string): Promise<void> {
  const parsed = reserveInput.safeParse({ locale, sessionId });
  if (!parsed.success) return;
  try {
    await reserveSeat(parsed.data.locale, parsed.data.sessionId);
  } catch (e) {
    unstable_rethrow(e);
  }
  refresh();
}
