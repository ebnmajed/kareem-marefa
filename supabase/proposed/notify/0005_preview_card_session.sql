-- proposed by `notify` (wave 10) — one session whose public card has actually
-- been rendered, for the two surfaces that show an admin what a mail looks
-- like before anyone receives one.
--
-- Serves:  REQ-NTF-010 (the preview is the production renderer over sample
--          data), REQ-NTF-011 («أرسل اختبارًا»)
-- Cites:   0080 (session_public_card — the rule, ASKED not copied), 0005
--          (auth_org_id), DEC-161, contract F3
--
-- ── 03 §8.2 rows this migration needs ───────────────────────────────────────
--   | `RPC-preview_card_session.own_org_only` | An authenticated caller naming another org is
--     refused `42501`; the worker (`service_role`, no claims) may name any org, because it is the
--     one caller that already knows which org it is sending for. |
--   | `RPC-preview_card_session.asks_the_rule` | A session whose poster has NOT finished rendering
--     is skipped and the next candidate tried — `og_path is null` is «not rendered yet», which a
--     state check on the session would call ready. |
--   | `RPC-preview_card_session.none_is_null` | An org with no card-bearing session returns null
--     rather than a session id whose image would 404. |
--
-- ★ WHY THIS IS A FUNCTION AND NOT A LOOP IN EACH CALLER.
--
-- Three surfaces render the same mail: the worker's real send, the preview,
-- and the test send. The real send already knows its session. The other two do
-- not — their payload is SAMPLE data whose session id names no row — so each
-- must find a real one, and «find a real one» written twice is how the logo
-- came to be resolved by the worker and by nobody else.
--
-- ★ AND IT ASKS THE RULE RATHER THAN RESTATING IT (contract F3). A session is
-- offered only when `session_public_card()` answers with an `og_path`. That is
-- not the same as «the session is published»: a poster that has not finished
-- rendering has no path yet, and a state check would hand back a session whose
-- image 404s — which in a mail is a broken image, and in a preview is an admin
-- concluding the card is broken when the truth is that it is not ready.

create or replace function public.preview_card_session(p_org uuid)
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_caller uuid := public.auth_org_id();
  r        record;
  v_og     text;
begin
  -- A definer bypasses RLS, so the org must be checked here or this becomes a
  -- way to learn that a session exists in someone else's org. `auth_org_id()`
  -- is null for the worker, which has no claims and is the one caller that
  -- legitimately names an org other than its own — it has no own.
  if v_caller is not null and p_org is distinct from v_caller then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  -- Ten, newest first. Not one, because the newest session is often the one
  -- whose poster is still rendering; not all, because this runs while an admin
  -- waits.
  --
  -- ★ And NOT pre-filtered by state, though a draft can never have a card.
  -- Filtering here would restate part of the rule the loop then asks for —
  -- contract F3 — and the two would drift the day the rule changes. A wider
  -- window and one question per candidate costs a few stable index reads and
  -- keeps the rule in one place.
  for r in
    select s.id
      from public.sessions s
     where s.org_id = p_org
     order by s.starts_at desc
     limit 10
  loop
    select c.og_path into v_og from public.session_public_card(r.id) c;
    if v_og is not null then
      return r.id;
    end if;
  end loop;

  -- No candidate. Both callers then render one row fewer, which is what the
  -- real send does for a session with no card and is true for this org.
  return null;
end $$;

-- `authenticated` for the preview (the body refuses another org), and
-- `service_role` for the test-send job. `anon` never: it names no org of its
-- own, so the caller check above would not constrain it.
revoke execute on function public.preview_card_session(uuid) from public, anon;
grant  execute on function public.preview_card_session(uuid) to authenticated, service_role;

comment on function public.preview_card_session(uuid) is
  'REQ-NTF-010/011: one session of p_org whose public card has actually rendered, for the preview and the test send, both of which carry sample payloads naming no real session. Asks session_public_card() rather than restating its rule.';
