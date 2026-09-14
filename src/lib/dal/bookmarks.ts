import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Bookmarks — REQ-DSC-006, 02 §4.15, SCR-024. `p3_self_*`/`p7_self_read`
// (0037) are the entire authority: a plain insert/delete/select scoped to
// the caller's own `member_id`, with a composite primary key
// (`member_id, session_id`) that makes "bookmarked" a pure boolean rather
// than something with its own id to track. Never referenced by the scoring
// engine — REQ-DSC-006's "earn no points" is true by omission, the same
// way REQ-TSK-002 is for tasks (src/lib/dal/tasks.ts's own header).

export interface BookmarkedSession {
  id: string;
  title: string;
  abstract: string;
  startsAt: string | null;
  state: string;
  bookmarkedAt: string;
}

export interface BookmarksPageData {
  sessions: BookmarkedSession[];
  numerals: "western" | "arabic_indic";
}

/** SCR-024 — the member's own saved sessions, most recently bookmarked first. */
export async function getBookmarksPageData(locale: string): Promise<BookmarksPageData> {
  const { session, supabase } = await sessionClient(locale);
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase
      .from("bookmarks")
      .select("created_at, sessions(id, title, abstract, starts_at, state)")
      .eq("member_id", session.memberId)
      .order("created_at", { ascending: false }),
    supabase.from("org_settings").select("numerals").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (error) throw new Error(`bookmarks: ${error.message}`);

  const sessions = (data ?? [])
    .map((row) => {
      const s = (row as unknown as { sessions: { id: string; title: string; abstract: string; starts_at: string | null; state: string } | null }).sessions;
      if (!s) return null;
      return { id: s.id, title: s.title, abstract: s.abstract, startsAt: s.starts_at, state: s.state, bookmarkedAt: row.created_at as string };
    })
    .filter((s): s is BookmarkedSession => s !== null);

  return { sessions, numerals: (settings?.numerals as "western" | "arabic_indic" | undefined) ?? "western" };
}

const toggleInput = z.object({ sessionId: z.uuid(), bookmarked: z.boolean() });

/** REQ-DSC-006: private to the member — no RPC needed, `bookmarks`' own composite primary key
 *  makes a second bookmark attempt a harmless no-op conflict rather than something this needs to
 *  guard against itself. */
export async function toggleBookmark(locale: string, input: z.infer<typeof toggleInput>): Promise<boolean> {
  const { sessionId, bookmarked } = toggleInput.parse(input);
  const { session, supabase } = await sessionClient(locale);
  if (bookmarked) {
    const { error } = await supabase.from("bookmarks").upsert({ org_id: session.orgId, member_id: session.memberId, session_id: sessionId }, { onConflict: "member_id,session_id" });
    if (error) throw new Error(`bookmarks: ${error.message}`);
  } else {
    const { error } = await supabase.from("bookmarks").delete().eq("member_id", session.memberId).eq("session_id", sessionId);
    if (error) throw new Error(`bookmarks: ${error.message}`);
  }
  return true;
}

/** Whether the CURRENT member has bookmarked this one session — for a `BookmarkButton` embedded
 *  on a session card or the event page, wherever another track places it. */
export async function isSessionBookmarked(locale: string, sessionId: string): Promise<boolean> {
  if (!z.uuid().safeParse(sessionId).success) return false;
  const { session, supabase } = await sessionClient(locale);
  const { data } = await supabase.from("bookmarks").select("session_id").eq("member_id", session.memberId).eq("session_id", sessionId).maybeSingle();
  return !!data;
}
