-- supabase/proposed/event/01_realtime_authorization.sql
-- Realtime authorization for the event page (03 §7, DEC-021, DEC-022) and the
-- broadcast triggers that make comments and reactions live (REQ-EVT-015, A18).
--
-- Serves: REQ-EVT-015
-- 03 §8.2 rows this proves (tests/rls/realtime.test.ts):
--   POL-realtime.channel_private   — enforced client-side (src/lib/realtime/channel.ts),
--                                    not by SQL; the test asserts an anonymous subscribe
--                                    to `session:%` is refused by these policies regardless.
--   POL-realtime.messages.select   — a member of org A subscribing to org B's session topic
--                                    receives nothing.
--   POL-realtime.messages.insert   — a member cannot broadcast into another org's session topic.
--   POL-realtime.host_topic        — a checked-in (non-staff, non-presenter) member gets nothing.
--   POL-realtime.payload_shape     — the reactions trigger sends totals, never rows.
--
-- Verified against the LOCAL database rather than memory (2026-09-14): `realtime.messages`
-- already has relrowsecurity = true, relforcerowsecurity = false, and zero policies (so today
-- it is deny-all for authenticated/anon despite holding table grants); `realtime.broadcast_changes`
-- and `realtime.send` were introspected with pg_get_functiondef to confirm their exact argument
-- order and that `send()` inserts directly into `realtime.messages`.

-- ── §7.2 RLS on realtime.messages ───────────────────────────────────────────
-- Idempotent — Supabase already enables RLS on this table.
alter table realtime.messages enable row level security;

-- session:{session_id} — the event page: comments, reactions, and (from the
-- checkin/sessions tracks) RSVP and check-in counts. Any member of the
-- session's org may receive. The insert policy exists for the same
-- boundary even though nothing in this product broadcasts from the browser
-- into a session topic today (comments/reactions travel through their own
-- table policies and a server-side trigger) — a future presence/typing
-- feature inherits the boundary instead of needing to invent it.
create policy "realtime_session_select" on realtime.messages for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and topic like 'session:%'
    and exists (
      select 1 from public.sessions s
       where s.id = split_part(topic, ':', 2)::uuid
         and s.org_id = public.auth_org_id()
    )
  );

create policy "realtime_session_insert" on realtime.messages for insert to authenticated
  with check (
    extension = 'broadcast'
    and topic like 'session:%'
    and exists (
      select 1 from public.sessions s
       where s.id = split_part(topic, ':', 2)::uuid
         and s.org_id = public.auth_org_id()
    )
  );

-- host:{session_id} — the host view's live check-in count (checkin's SCR-016).
-- Staff or that session's own presenter only (OQ-013): a member who could
-- listen here could infer who has and has not arrived yet, exactly what
-- POL-check_ins.select.member (03 §5.4b, "checkins_read") hides at the table.
--
-- DEVIATES from 03 §7.2's literal sample by one clause, on purpose: that
-- sample gates on `is_staff() or is_presenter_of(...)` alone. is_staff()
-- checks only the CALLER's own role, never the session's org, so as
-- literally written any admin or moderator of ANY org could subscribe to
-- ANY org's host topic — a cross-org leak of live check-in counts, caught by
-- tests/rls/realtime.test.ts ("a member of org B cannot read org A's host
-- topic"). Flagged to the lead in docs/plan/notes/event.md §3 for a
-- DECISIONS.md entry and a fix to `03` itself; this file carries the
-- corrected version so the isolation guarantee actually holds meanwhile.
create policy "realtime_host_select" on realtime.messages for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and topic like 'host:%'
    and exists (
      select 1 from public.sessions s
       where s.id = split_part(topic, ':', 2)::uuid
         and s.org_id = public.auth_org_id()
    )
    and (public.is_staff() or public.is_presenter_of(split_part(topic, ':', 2)::uuid))
  );

-- ── §7.3 / §7.4 broadcast from the database ─────────────────────────────────
-- Comments: a REVIEWED payload (03 §7.4: "comment created/edited"), built
-- with realtime.send() rather than realtime.broadcast_changes() — the raw
-- row alone is not enough for the client to render a comment it just
-- received from someone else, because it names `author_id`, not a display
-- name, and the client has no other channel to resolve one without an
-- extra round trip per stranger who ever posts. The join here is exactly
-- the same one src/lib/dal/comments.ts's own initial fetch does
-- (`members!comments_author_id_fkey`), so realtime and first-paint render
-- identically shaped data. camelCase keys on purpose: this is consumed
-- directly by TypeScript, not re-mapped from snake_case on arrival.
-- AFTER, not BEFORE: comments_guard() (0010) has already stamped edited_at
-- by the time this fires. No DELETE case — there is no delete policy on
-- comments; every removal is the soft-delete UPDATE REQ-EVT-005 specifies.
create function public.comments_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row     record := coalesce(new, old);
  v_author  record;
begin
  select m.display_name, m.avatar_url into v_author from public.members m where m.id = v_row.author_id;
  perform realtime.send(
    jsonb_build_object(
      'id', v_row.id,
      'sessionId', v_row.session_id,
      'parentId', v_row.parent_id,
      'authorId', v_row.author_id,
      'authorDisplayName', v_author.display_name,
      'authorAvatarUrl', v_author.avatar_url,
      'body', v_row.body,
      'mentions', to_jsonb(v_row.mentions),
      'createdAt', v_row.created_at,
      'editedAt', v_row.edited_at,
      'deletedAt', v_row.deleted_at
    ),
    tg_op,
    'session:' || v_row.session_id::text
  );
  return v_row;
end $$;

create trigger comments_broadcast after insert or update on public.comments
  for each row execute function public.comments_broadcast();

-- Reactions: TOTALS, never rows (03 §7.4) — a reaction row names a member,
-- and the entire point of broadcasting a count instead is to not put that on
-- the wire on every click. Session-level and comment-level reactions both
-- resolve to a session topic: the row's own session_id for a session-level
-- reaction, the parent comment's session_id for a comment-level one (the
-- table's check constraint guarantees exactly one of the two is set).
create function public.reactions_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_comment_id      uuid := coalesce(new.comment_id, old.comment_id);
  v_own_session_id  uuid := coalesce(new.session_id, old.session_id);
  v_session_id      uuid;
  v_totals          jsonb;
begin
  if v_comment_id is not null then
    select c.session_id into v_session_id from public.comments c where c.id = v_comment_id;
  else
    v_session_id := v_own_session_id;
  end if;

  select coalesce(jsonb_object_agg(t.kind, t.total), '{}'::jsonb) into v_totals
    from (
      select r.kind, count(*) as total
        from public.reactions r
       where r.comment_id is not distinct from v_comment_id
         and r.session_id is not distinct from v_own_session_id
       group by r.kind
    ) t;

  perform realtime.send(
    jsonb_build_object('commentId', v_comment_id, 'sessionId', v_own_session_id, 'totals', v_totals),
    'reaction_totals',
    'session:' || v_session_id::text
  );
  return coalesce(new, old);
end $$;

create trigger reactions_broadcast after insert or delete on public.reactions
  for each row execute function public.reactions_broadcast();

-- Supabase already grants these to `authenticated` on the live project and
-- locally (verified: information_schema.role_table_grants), so this line
-- changes nothing at runtime — it exists so scripts/policy-diff.mjs can see
-- the grant a policy above relies on (invariant 6: a policy without a
-- matching grant fails 42501; 0002 is the whole reason that check exists).
grant select, insert on realtime.messages to authenticated;
