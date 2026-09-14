-- promoted by the lead at wave-3 sync 6 · console (wave 3, M7) — the fourth, offset-agnostic reminder message
-- (DEC-047, console.md's story order item 3): "08 §1.2 defines exactly
-- THREE reminder messages … `reminder_message_key()` picks the nearest by
-- magnitude … a fourth, offset-agnostic message is the honest fix, left to
-- M7-console" (notify's own note, `0034`'s header, and `notes/notify.md`
-- §5.2). An org that sets a custom offset — say 3 days — currently gets a
-- subject reading «بعد أسبوع» (a week) for a reminder that fires in three
-- days, because `reminder_message_key()` always rounds to the nearest of
-- the three fixed messages. Every default org (offsets {10080,1440,120}
-- exactly) is completely unaffected by this migration — the new branch
-- only ever fires for a genuinely custom offset.
--
-- Serves:  08 §1.2, §4.1 · REQ-NTF-004
-- Cites:   0026 (notification_matrix, notify), 0034 (reminder_message_key)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Widens each of the three fixed messages to a ±20% tolerance band around
-- its exact offset, rather than "nearest by magnitude" unconditionally —
-- an offset outside all three bands gets the new generic message instead
-- of borrowing a specific-sounding one that would be wrong. 20% keeps every
-- exact default (10080/1440/120) deep inside its own band with room for an
-- admin's small deliberate adjustment (org_settings has no validation
-- forcing round numbers) to still read as "the week-before message."
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.reminder_message_key(p_offset int) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when p_offset between 8064  and 12096 then 'MSG-reminder_7d'    -- 10080 ± 20%
    when p_offset between 1152  and 1728  then 'MSG-reminder_1d'    -- 1440  ± 20%
    when p_offset between 96    and 144   then 'MSG-reminder_2h'    -- 120   ± 20%
    else                                        'MSG-reminder_generic'
  end
$$;

-- `notify()` (0026) raises `unknown_message_key` for anything not in this
-- matrix — the new key needs a row here before `reminder_message_key()` can
-- ever return it. Same category and channels as the other three reminder
-- messages (REQ-NTF-004 covers all of them alike); `create or replace`
-- rather than an `insert`, since this is a SQL function's body, not a
-- table — the DEC-047 pattern for hooking into an earlier wave's function.
create or replace function public.notification_matrix()
  returns table (key text, category text, in_app boolean, email boolean, optional boolean)
  language sql immutable parallel safe set search_path = '' as $$
  values
    -- 08 §1.1 proposals
    ('MSG-proposal_submitted',    'admin_queue',  true,  true,  true ),
    ('MSG-copresenter_invited',   'proposals',    true,  true,  false),
    ('MSG-copresenter_declined',  'proposals',    true,  false, true ),
    ('MSG-proposal_changes',      'proposals',    true,  true,  false),
    ('MSG-proposal_approved',     'proposals',    true,  true,  false),
    ('MSG-proposal_rejected',     'proposals',    true,  true,  false),
    -- 08 §1.2 sessions
    ('MSG-session_published',     'new_sessions', true,  true,  true ),
    ('MSG-presenter_assigned',    'proposals',    true,  true,  false),
    ('MSG-session_changed',       'my_sessions',  true,  true,  false),
    ('MSG-session_cancelled',     'my_sessions',  true,  true,  false),
    ('MSG-reminder_7d',           'reminders',    true,  true,  true ),
    ('MSG-reminder_1d',           'reminders',    true,  true,  true ),
    ('MSG-reminder_2h',           'reminders',    true,  true,  true ),
    ('MSG-reminder_generic',      'reminders',    true,  true,  true ),  -- new: console, DEC-047
    ('MSG-rsvp_nudge',            'new_sessions', true,  false, true ),
    -- 08 §1.3 RSVP
    ('MSG-rsvp_confirmed',        'my_sessions',  true,  false, true ),
    ('MSG-rsvp_waitlisted',       'my_sessions',  true,  false, true ),
    ('MSG-rsvp_promoted',         'my_sessions',  true,  true,  false),
    ('MSG-rsvp_deadline_soon',    'my_sessions',  true,  false, true ),
    ('MSG-priority_window',       'new_sessions', true,  false, true ),
    -- 08 §1.4 during and after
    ('MSG-check_in_confirmed',    'my_sessions',  true,  false, true ),
    ('MSG-rating_prompt',         'ratings',      true,  true,  true ),
    ('MSG-materials_added',       'my_sessions',  true,  true,  true ),
    ('MSG-comment_reply',         'social',       true,  true,  true ),
    ('MSG-mentioned',             'social',       true,  true,  true ),
    ('MSG-photo_hidden',          'moderation',   true,  false, false),
    ('MSG-content_removed',       'moderation',   true,  false, false),
    ('MSG-report_filed',          'admin_queue',  true,  false, true ),
    -- 08 §1.5 recognition and certificates
    ('MSG-badge_earned',          'recognition',  true,  true,  true ),
    ('MSG-level_reached',         'recognition',  true,  true,  true ),
    ('MSG-streak_completed',      'recognition',  true,  false, true ),
    ('MSG-points_adjusted',       'recognition',  true,  false, false),
    ('MSG-leaderboard_closed',    'recognition',  true,  false, true ),
    ('MSG-certificate_issued',    'certificates', true,  true,  false),
    ('MSG-certificate_revoked',   'certificates', true,  true,  false),
    -- 08 §1.6 account
    ('MSG-role_changed',          'account',      true,  true,  false),
    ('MSG-account_deactivated',   'account',      false, true,  false),
    ('MSG-calendar_disconnected', 'account',      true,  false, false),
    ('MSG-export_ready',          'account',      true,  true,  false)
$$;
