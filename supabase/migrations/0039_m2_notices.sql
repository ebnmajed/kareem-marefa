-- promoted by the lead at wave-2 sync 6 · notify (wave 2, M3) — the last of the notices M2 deferred (DEC-045).
--
-- Serves:  REQ-EVT-007 (a reply to your comment, and being mentioned) ·
--          REQ-EVT-006 (the mention targets `event` already stores) ·
--          REQ-PRO-005 (a decision on a proposal, with its reason) ·
--          REQ-PRO-002 (a co-presenter is invited and can decline) ·
--          REQ-PRO-007 (the assigned presenter is told) ·
--          REQ-EVT-008 (content removed) · REQ-EVT-010 (a report reaches the
--          moderators)
-- Cites:   08 §1.1, §1.2, §1.4 · 0010 (comments.mentions, reports) ·
--          0026 (notify()) · docs/plan/notes/event.md §1 (the `event`
--          teammate stored the mention targets for this)
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `POL-comments.reply_notice` | A reply notifies the parent's author, and replying to yourself
--     notifies nobody. |
--   | `POL-comments.mention_notice` | Every member in `mentions` is notified once; a mention of
--     yourself, of the parent's author you already replied to, or of someone in another org, is
--     not. |
--   | `POL-comments.removal_notice` | A moderator removing a comment tells its author
--     (`MSG-content_removed`, non-optional). |
--   | `POL-proposals.decision_notice` | Approved, rejected and changes-requested each notify the
--     proposer AND the co-presenters, carrying `decision_reason`. |
--   | `POL-proposal_presenters.invite_notice` | Being named as a co-presenter is non-optional; the
--     decline notifies the proposer. |
--   | `POL-session_presenters.assigned_notice` | An assigned presenter is told (`REQ-PRO-007`). |
--   | `POL-reports.filed_notice` | A report reaches every moderator and admin of the org, and
--     nobody else. |
--
-- ── Why these are triggers ──────────────────────────────────────────────────
-- Same reasoning as 0003: each of these has more than one writer (an RPC, a
-- fixture, a future admin screen), and a rule at the table holds for all of
-- them. None of the wave-1 functions is touched.

-- ═══════════════════════════════════════════════════════════════════════════
-- comments_notify — REQ-EVT-007. The half `event` could not build: it stored
-- the mention targets in `comments.mentions` (notes/event.md §1) and left
-- delivery to M3 rather than faking it.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.comments_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s        public.sessions;
  parent   public.comments;
  author   public.members;
  target   uuid;
  notified uuid[] := array[]::uuid[];
begin
  select * into s from public.sessions where id = new.session_id;
  select * into author from public.members where id = new.author_id;

  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    -- Replying to yourself is not news, and neither is replying to a comment
    -- whose author has since been removed from the org.
    if found and parent.author_id <> new.author_id then
      perform public.notify(
        new.org_id, parent.author_id, 'social',
        jsonb_build_object(
          'session_id', new.session_id,
          'title',      s.title,
          'comment_id', new.id,
          'author',     coalesce(author.display_name, '')),
        'MSG-comment_reply');
      notified := notified || parent.author_id;
    end if;
  end if;

  foreach target in array coalesce(new.mentions, array[]::uuid[]) loop
    -- Three exclusions, each a message somebody would otherwise get for no
    -- reason: yourself, the person already told about the reply, and anyone
    -- outside the org (the mention picker is org-scoped, but the column is a
    -- plain uuid[] and a crafted insert is not the schema's problem to trust).
    if target = new.author_id or target = any(notified) then
      continue;
    end if;
    if not exists (select 1 from public.members m where m.id = target and m.org_id = new.org_id) then
      continue;
    end if;
    perform public.notify(
      new.org_id, target, 'social',
      jsonb_build_object(
        'session_id', new.session_id,
        'title',      s.title,
        'comment_id', new.id,
        'name',       coalesce(author.display_name, '')),
      'MSG-mentioned');
    notified := notified || target;
  end loop;

  return new;
end $$;

create trigger comments_notify after insert on public.comments
  for each row execute function public.comments_notify();

-- REQ-EVT-008 / 08 §1.4: content removed is non-optional — an author who does
-- not know their comment was removed cannot contest it. A SELF-delete is not
-- a removal and notifies nobody.
create function public.comments_removal_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null
     and new.deleted_by is not null and new.deleted_by <> new.author_id then
    perform public.notify(
      new.org_id, new.author_id, 'moderation',
      jsonb_build_object('session_id', new.session_id, 'comment_id', new.id),
      'MSG-content_removed');
  end if;
  return new;
end $$;

create trigger comments_removal_notify after update of deleted_at on public.comments
  for each row execute function public.comments_removal_notify();

-- ═══════════════════════════════════════════════════════════════════════════
-- proposals_notify — REQ-PRO-005. The decision AND its reason: `0010`'s check
-- constraint already refuses a rejection or a changes-requested without a
-- `decision_reason`, so the payload can carry it unconditionally.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.proposals_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  msg     text;
  r       record;
  payload jsonb;
begin
  if old.state is not distinct from new.state then
    return new;
  end if;

  if new.state = 'submitted' then
    -- 08 §1.1: the org's admins get the queue notice. Optional, and the only
    -- message in `admin_queue` that reaches them by email.
    for r in select m.id from public.members m
              where m.org_id = new.org_id and m.status = 'active' and m.org_role = 'admin'
    loop
      perform public.notify(
        new.org_id, r.id, 'admin_queue',
        jsonb_build_object('proposal_id', new.id, 'title', new.title,
                           'proposer', (select coalesce(p.display_name, '') from public.members p where p.id = new.proposer_id)),
        'MSG-proposal_submitted');
    end loop;
    return new;
  end if;

  msg := case new.state
    when 'approved'          then 'MSG-proposal_approved'
    when 'rejected'          then 'MSG-proposal_rejected'
    when 'changes_requested' then 'MSG-proposal_changes'
    else null end;
  if msg is null then
    return new;
  end if;

  payload := jsonb_build_object('proposal_id', new.id, 'title', new.title, 'reason', new.decision_reason);

  -- The proposer and every co-presenter: 08 §1.1 says "proposer,
  -- co-presenters" for all three decisions, and a co-presenter who is not
  -- told is a presenter who turns up to a session that was rejected.
  for r in
    select new.proposer_id as member_id
    union
    select pp.member_id from public.proposal_presenters pp
     where pp.proposal_id = new.id and pp.declined_at is null and pp.member_id <> new.proposer_id
  loop
    perform public.notify(new.org_id, r.member_id, 'proposals', payload, msg);
  end loop;

  return new;
end $$;

create trigger proposals_notify after update of state on public.proposals
  for each row execute function public.proposals_notify();

-- ═══════════════════════════════════════════════════════════════════════════
-- proposal_presenters_notify — REQ-PRO-002. Being named as a co-presenter is
-- non-optional (08 §1.7): the member is being asked to stand up in a room.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.proposal_presenters_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.proposals;
begin
  select * into p from public.proposals where id = new.proposal_id;

  if tg_op = 'INSERT' then
    if new.member_id <> p.proposer_id then
      perform public.notify(
        new.org_id, new.member_id, 'proposals',
        jsonb_build_object('proposal_id', p.id, 'title', p.title,
                           'inviter', (select coalesce(m.display_name, '') from public.members m where m.id = p.proposer_id)),
        'MSG-copresenter_invited');
    end if;
    return new;
  end if;

  -- A decline tells the proposer, so they can find someone else before the
  -- session needs one.
  if old.declined_at is null and new.declined_at is not null and p.proposer_id <> new.member_id then
    perform public.notify(
      new.org_id, p.proposer_id, 'proposals',
      jsonb_build_object('proposal_id', p.id, 'title', p.title,
                         'name', (select coalesce(m.display_name, '') from public.members m where m.id = new.member_id)),
      'MSG-copresenter_declined');
  end if;
  return new;
end $$;

create trigger proposal_presenters_notify after insert or update of declined_at on public.proposal_presenters
  for each row execute function public.proposal_presenters_notify();

-- ═══════════════════════════════════════════════════════════════════════════
-- session_presenters_notify — REQ-PRO-007. An admin can create a session and
-- assign a presenter to it; that presenter finds out from us or not at all.
-- Non-optional (08 §1.7), and it carries the time and place because the first
-- question anyone asks is "when".
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_presenters_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = new.session_id;
  perform public.notify(
    new.org_id, new.member_id, 'proposals',
    jsonb_build_object(
      'session_id', new.session_id,
      'title',      s.title,
      'startsAt',   s.starts_at,
      'venue',      public.session_venue_label(s.venue_id, s.custom_venue_name)),
    'MSG-presenter_assigned');
  return new;
end $$;

create trigger session_presenters_notify after insert on public.session_presenters
  for each row execute function public.session_presenters_notify();

-- ═══════════════════════════════════════════════════════════════════════════
-- reports_notify — REQ-EVT-010, 08 §1.4. To moderators AND admins, because
-- `03` defines the moderation queue as staff work and an org may have no
-- moderator at all.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.reports_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select m.id from public.members m
     where m.org_id = new.org_id and m.status = 'active' and m.org_role in ('admin', 'moderator')
       -- Reporting something yourself is not a notification to yourself.
       and m.id <> new.reporter_id
  loop
    perform public.notify(
      new.org_id, r.id, 'admin_queue',
      jsonb_build_object('report_id', new.id, 'target', new.target::text, 'reason', new.reason),
      'MSG-report_filed');
  end loop;
  return new;
end $$;

create trigger reports_notify after insert on public.reports
  for each row execute function public.reports_notify();
