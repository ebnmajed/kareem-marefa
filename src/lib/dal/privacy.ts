import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// The member's own privacy surface — REQ-PRF-006, REQ-PRF-007, REQ-NFR-013,
// REQ-NFR-005, 12 §5.4.
//
// ★ SELF-SERVICE EXPORT: YES. SELF-SERVICE DELETION: NO — and the screen says
// which, plainly, rather than offering a "delete account" that quietly means
// something else. A member's sessions, materials and comments are content
// other members depend on: a hard delete would tear holes in other people's
// event pages, a pre-read vanishing from a session someone is preparing for,
// a comment thread losing its first message. Anonymisation honours the
// erasure interest without doing that (12 §5.4).
//
// Every function here goes through `sessionClient()`, so the boundary is the
// member's own session plus RLS — `data_export_read_self` is already exactly
// the right policy and no definer function widens it.

export type ExportStatus = "queued" | "building" | "ready" | "failed" | "expired";

export interface DataExportRequest {
  id: string;
  status: ExportStatus;
  requestedAt: string;
  completedAt: string | null;
  byteSize: number | null;
  error: string | null;
  /**
   * REQ-NFR-005, decided here rather than in the screen: reading the clock
   * during render is an impure call, and a member should learn that the limit
   * applies BEFORE they press a button, not from an error afterwards. The RPC
   * enforces it either way — this only tells the truth earlier.
   */
  canRequestAgain: boolean;
}

type ExportRow = {
  id: string | null;
  status: ExportStatus;
  requested_at: string;
  completed_at: string | null;
  byte_size: number | string | null;
  error: string | null;
};

const count = (v: number | string | null): number | null => (v === null ? null : typeof v === "number" ? v : Number(v));

/** The member's most recent request, or null if they have never asked. */
export async function getMyExportRequest(locale: string): Promise<DataExportRequest | null> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("my_data_export");
  if (error || !data) return null;
  const r = data as ExportRow;
  if (!r.id) return null;
  return {
    id: r.id,
    status: r.status,
    requestedAt: r.requested_at,
    completedAt: r.completed_at,
    byteSize: count(r.byte_size),
    error: r.error,
    canRequestAgain: Date.parse(r.requested_at) < Date.now() - 24 * 60 * 60 * 1000,
  };
}

export type PrivacyResult = { status: "ok" } | { status: "failed"; message: string };

/**
 * REQ-PRF-006 + REQ-NFR-005. The rate limit lives in the RPC, not here: a
 * limit enforced in a Route Handler is a limit a second caller races past,
 * and the insert it guards is in the same transaction as the check.
 */
export async function requestMyExport(locale: string): Promise<PrivacyResult> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("request_data_export");
  if (!error) return { status: "ok" };
  return { status: "failed", message: error.message.includes("export_rate_limited") ? "export_rate_limited" : "failed" };
}

/**
 * The archive itself, as the member's own row. Returns null when there is
 * nothing ready — the Route Handler turns that into a 404 rather than an
 * explanation, because there is nothing here a stranger should learn.
 */
export async function getMyExportPayload(locale: string): Promise<{ payload: unknown; requestedAt: string } | null> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("my_data_export");
  if (error || !data) return null;
  const r = data as ExportRow & { payload: unknown };
  if (!r.id || r.status !== "ready" || r.payload === null) return null;
  return { payload: r.payload, requestedAt: r.requested_at };
}

export const deactivationReason = z.string().trim().min(3).max(500);

/**
 * REQ-PRF-007: a member REQUESTS deactivation; an org admin performs it
 * (`REQ-AUT-008`). The request writes `member.deactivation_requested` to the
 * org's own audit log, where an admin already reads every other act on the
 * org — a fourth entity for a queue nobody would check is worse than a row in
 * the log they do check.
 */
export async function requestDeactivation(locale: string, reason: string): Promise<PrivacyResult> {
  const parsed = deactivationReason.safeParse(reason);
  if (!parsed.success) return { status: "failed", message: "reason_required" };
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("request_deactivation", { p_reason: parsed.data });
  return error ? { status: "failed", message: "failed" } : { status: "ok" };
}
