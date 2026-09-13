import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Report and flag (REQ-EVT-008). Reported items stay visible pending
// review — this module never hides anything, it only files the report.
// "The reporter's identity is never shown to the reported member" is
// already structural: no policy lets a non-staff member select `reports`
// at all. The moderation queue UI (`app/admin/**`) is `console`'s, wave 3
// — out of scope here.

export const reportCommentInput = z.object({
  commentId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
});
export type ReportCommentInput = z.infer<typeof reportCommentInput>;

export async function reportComment(locale: string, input: ReportCommentInput): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase.from("reports").insert({
    org_id: session.orgId,
    target: "comment",
    comment_id: input.commentId,
    reporter_id: session.memberId,
    reason: input.reason,
  });
  if (error) throw new Error(error.code === "42501" ? "not_permitted" : `reports: ${error.message}`);
}

/** So the UI can offer "reported" instead of the report action again — reads
 *  only the viewer's own report (reports_read_staff_or_reporter already
 *  scopes this; no separate check needed). */
export async function hasReportedComment(locale: string, commentId: string): Promise<boolean> {
  if (!z.uuid().safeParse(commentId).success) return false;
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("reports").select("id").eq("comment_id", commentId).eq("reporter_id", session.memberId).maybeSingle();
  if (error) throw new Error(`reports: ${error.message}`);
  return Boolean(data);
}

/** Batch form of the above, for rendering a whole comment thread at once. */
export async function getReportedCommentIds(locale: string, commentIds: string[]): Promise<Set<string>> {
  if (commentIds.length === 0) return new Set();
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("reports").select("comment_id").eq("reporter_id", session.memberId).in("comment_id", commentIds);
  if (error) throw new Error(`reports: ${error.message}`);
  return new Set((data ?? []).map((r) => r.comment_id as string).filter(Boolean));
}
