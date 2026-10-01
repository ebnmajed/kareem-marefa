-- 0168 — wave 19 (DEC-214 §1, REQ-PRO-003) — proposed by `sessions`, promoted by the lead.
--
-- ★ THE DEFECT. `proposal_presenters` grants `insert` on the WHOLE row to `authenticated` (`0010:448`), and
-- `proposal_presenters_insert_by_proposer` (`0010:437`) checks only that the caller owns the proposal. So a
-- proposer could insert a co-presenter row with `accepted = true` straight through PostgREST — a colleague on
-- the proposal who never answered. `create_session_from_proposal()` copies accepted rows onto the session
-- (`0020:90`), so that colleague became a presenter, with presenter points and a certificate, without consent.
-- REQ-PRO-003: «Named co-presenters are notified and can decline» — an answer is the co-presenter's alone.
--
-- ★ THE GUARD. Before an insert, a row for anyone but the proposal's proposer is written UNANSWERED —
-- `accepted = false`, `declined_at = null` — whatever the client sent. Silently coerced rather than refused:
-- the only honest value for a new invitation is «no answer yet», and refusing would turn a harmless client
-- default into an error. The proposer's own row — `create_proposal()` writes it accepted (`0012`) — is untouched.
-- An answer still moves only through `proposal_presenters_update_self` (the member's own row, `0010:441`).
--
-- `security definer` with `search_path = ''`: it reads `proposals.proposer_id`, which the caller can read
-- anyway (they own it, or the insert policy refuses them), but a trigger must not depend on the caller's RLS.
-- A trigger function: Postgres refuses to call it directly, so it is outside the definer-exposure sweep.
-- ADD-ONLY for `main`: nothing on `main` inserts an accepted co-presenter; `create_proposal()` and the
-- notification trigger (`0039`, `after insert`) see the same rows they always did.
create function public.proposal_presenters_unanswered() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_proposer uuid;
begin
  -- ★ The lead, at promotion: only a request that carries a member's session is coerced. Every client path —
  -- PostgREST, `create_proposal()`, any definer called by a member — has `auth.uid()`; a direct connection with
  -- no claims (the migration role, the test fixtures that seed an answered co-presenter as `postgres`) is
  -- already trusted with every write and is left alone, so fixtures keep stating the state they test.
  if auth.uid() is null then
    return new;
  end if;
  select p.proposer_id into v_proposer from public.proposals p where p.id = new.proposal_id;
  if new.member_id is distinct from v_proposer then
    new.accepted := false;
    new.declined_at := null;
  end if;
  return new;
end $$;

revoke execute on function public.proposal_presenters_unanswered() from public, anon, authenticated;

create trigger proposal_presenters_unanswered
  before insert on public.proposal_presenters
  for each row execute function public.proposal_presenters_unanswered();
