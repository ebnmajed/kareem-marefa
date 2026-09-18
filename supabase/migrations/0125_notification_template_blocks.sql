-- 0125 — a notification template may carry blocks. Two columns and one enum.
--
-- Serves: REQ-NTF-009, REQ-NTF-012, REQ-NTF-013, REQ-NTF-014 · DEC-081, DEC-082,
--         DEC-160 §4, DEC-161 (sync 1: the storage ruling).
-- Author: the lead (row L2), from `notify`'s plan, `docs/plan/notes/notify.md`
--         «Wave 10 plan» §X3.3, as ruled at sync 1. The trigger that validates
--         what these columns hold, and everything that reads them, is `notify`'s
--         and arrives in later files.
--
-- WHY THE BLOCKS LIVE ON THE TEMPLATE'S OWN ROW, and not in a table of designs
-- shared across keys (the plan's first shape, and `02` / `16` §11.6's
-- `notification_template_blocks`) — DEC-161:
--   · BINDINGS. REQ-NTF-012: a binding the key does not offer is refused by the
--     database, for every writer. A design bound to `MSG-reminder_1d` (which
--     offers `venue`) and to `MSG-rsvp_promoted` (which does not) cannot be
--     policed by a trigger on this table — editing the DESIGN later fires
--     nothing here. One row per key has one trigger and one answer.
--   · ONE TEXT. `body` stays `not null`, and for a block template it holds the
--     blocks' generated text alternative in TEMPLATE form (REQ-NTF-013) — which
--     is also what `main`'s worker renders, down its string path, between the
--     owner's push and the Railway redeploy. On a shared design that text goes
--     stale on every bound row the moment the design is edited.
--   · COPY. A family is a SHAPE; what a 7-day, a 1-day and a 2-hour reminder SAY
--     differs per key, so one shared row cannot carry it.
--   A reorder is a whole-document write and no query ever wants one block, so
--   `jsonb`, as `design_documents` settled for posters.
--
-- WHAT A ROW MEANS NOW.
--   `blocks is null`      a STRING template — every row that exists today, byte
--                         for byte. `render`'s string path, unchanged.
--   `blocks is not null`  a BLOCK template: `{ schemaVersion, blocks: [...] }`.
--                         `subject` stays this table's `subject` — one source.
--   `source_family`       provenance: which of DEC-082's eight platform designs
--                         the blocks were duplicated from; null when built from
--                         scratch or converted from a string. The platform
--                         library itself is constants in `@kareem/mail-runtime`,
--                         so `org_id` stays `not null` and there is NO eighth
--                         exception to invariant 5.
--
-- ADDITIVE (wave 10's rule). `org_id`, `key`, `channel`, `locale`, `subject`,
--   `body`, `required_fields`, the unique key, the four policies and the
--   validate trigger's three rules are untouched. `main`'s app writes the six
--   columns it has always written; `main`'s worker reads `{subject, body}` and
--   never sees the new two.
--
-- 03 §8.2 rows:
--   | `POL-notification_templates.blocks.shape` | `blocks` is null or an object carrying `schemaVersion` and an array `blocks`; anything else is refused `23514`, for every writer. `source_family` without `blocks` is refused. |
--   | `POL-notification_templates.blocks.admin_only` | An admin of the org writes `blocks` and `source_family` on its own rows through the existing policies; a moderator, a member and the other org's admin cannot; the column grant names exactly the eight writable columns. |

create type public.email_design_family as enum
  ('announcement', 'reminder', 'rsvp', 'rescheduled', 'cancelled', 'rating', 'certificate', 'recognition');

comment on type public.email_design_family is
  'DEC-082 / REQ-NTF-014: the eight designed platform templates — إعلان جلسة · تذكير · تأكيد حجز · تغيّر موعد · إلغاء · طلب تقييم · شهادة · تكريم. A family is a shape; the copy is per message key.';

alter table public.notification_templates
  add column blocks jsonb
    constraint notification_templates_blocks_shape check (
      blocks is null
      or (jsonb_typeof(blocks) = 'object'
          and blocks ? 'schemaVersion'
          and jsonb_typeof(blocks -> 'blocks') = 'array'
          and char_length(blocks::text) <= 200000)
    ),
  add column source_family public.email_design_family
    constraint notification_templates_family_needs_blocks check (source_family is null or blocks is not null);

comment on column public.notification_templates.blocks is
  'REQ-NTF-009: null = a string template (today''s row). Otherwise { schemaVersion, blocks: [...] } — the ordered, typed blocks; the footer is composed by the renderer and is never in here. `body` then holds the generated text alternative in template form (REQ-NTF-013).';
comment on column public.notification_templates.source_family is
  'Provenance only: the platform design the blocks were duplicated from. The platform library is constants in @kareem/mail-runtime; the original is never mutated because it is not a row.';

-- invariant 6: a column an admin may write needs its grant. 0026 granted update
-- on six columns; column grants add up.
grant update (blocks, source_family) on public.notification_templates to authenticated;
