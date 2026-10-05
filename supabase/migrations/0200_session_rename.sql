-- 0200 · wave 27 (DEC-254 §5, DEC-255 §1, REQ-SES-021, REQ-ADM-023, STORY-SES-014) — a session's name: audited, and
-- fixed once the session is published.
--
-- ★ THE WRITE ALREADY EXISTS. `grant update (title, abstract, level, language)` (0010:469) with `sessions_update_admin`
-- and `sessions_update_presenter` (0010:459-465) has let an admin, and a presenter up to `published`, change a title
-- since M2. Nothing in the product ever did, and nothing recorded it. This file adds the two things the rename needs
-- and no new way to write:
--
--   1. `session.renamed` in the audit log, with the old and the new title — a trigger, so every path that can write is
--      covered (0181's rule: no track writes `audit_log` from the DAL).
--   2. ★ THE OWNER'S RULE (DEC-255 §1): «once the session is published the name is no longer editable». A title change
--      is refused with `session_title_locked` (55000) when the session is `published` or in any later state — for an
--      admin and a presenter alike. That takes the `published` state away from a presenter's retitle, which 0010's
--      policy allowed and no screen offered.
--
-- ★ WHY THE GUARD READS `auth.uid()`. It binds every signed-in caller. A statement with no session — the owner's
-- scoped data fix through the Management API — is not a member renaming a session and is recorded by `write_audit()`
-- with the role `system`, as 0181 has it.
--
-- Because nothing is public, reserved or issued before publication, a rename needs no calendar sync, no poster
-- re-render and no certificate snapshot (DEC-255 §1).
--
-- Additive for `main`, which runs this schema before it runs the code: `main`'s app never writes `sessions.title`, so
-- neither trigger fires on anything it does.
--
-- | Test | Proves |
-- |---|---|
-- | `TRG-sessions.renamed_audited` | A title change by an admin writes one `session.renamed` row: actor, `before.title`, `after.title`. An update that leaves the title equal writes none. |
-- | `TRG-sessions.title_locked_from_published` | A title change to a session in `published`, `in_progress`, `completed`, `archived` or `cancelled` raises `session_title_locked` (55000) for an admin and for its presenter; in every earlier state it succeeds. |

create function public.sessions_title_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.title is distinct from old.title
     and auth.uid() is not null
     and old.state in ('published', 'in_progress', 'completed', 'archived', 'cancelled') then
    raise exception 'session_title_locked' using errcode = '55000';
  end if;
  return new;
end $$;

create trigger sessions_title_guard before update of title on public.sessions
  for each row execute function public.sessions_title_guard();

create function public.sessions_title_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.title is distinct from old.title then
    perform public.write_audit(new.org_id, 'session.renamed', 'session', new.id,
      jsonb_build_object('title', old.title), jsonb_build_object('title', new.title));
  end if;
  return new;
end $$;

create trigger sessions_title_audit after update of title on public.sessions
  for each row execute function public.sessions_title_audit();

revoke execute on function public.sessions_title_guard(), public.sessions_title_audit() from public, anon, authenticated;
