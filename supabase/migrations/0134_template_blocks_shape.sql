-- 0134 — `notification_templates.blocks`: an object with no `blocks` key is refused.
--
-- Serves: REQ-NTF-009, REQ-NFR-001 · corrects `0125` (DEC-161). Found by `notify`
-- while writing the `03` §8.2 rows `0125` reserved for it.
--
-- `0125`'s check said «an object carrying `schemaVersion` and an array `blocks`»
-- and let `{"schemaVersion": 1}` through. On an object WITHOUT the key,
-- `blocks -> 'blocks'` is SQL NULL, so `jsonb_typeof(NULL)` is NULL, the
-- conjunction is NULL — and a CHECK rejects only on FALSE. One conjunct,
-- `blocks ? 'blocks'`, makes that row FALSE; every other verdict is unchanged
-- (`notify` measured all seven shapes against both predicates, three-valued).
--
-- A new file and not an edit of `0125`: `0125` is on the wave's branch, and a
-- migration is forward-only from the moment anyone else can have applied it
-- (invariant 3). Nothing crashed meanwhile — the binding scanner and the
-- compiler both treat a missing array as empty — but the column could hold a
-- document the constraint, and `03`, promise it cannot.
--
-- No row can violate the new check: `blocks` has existed for hours and nothing
-- writes it yet. `add constraint` validates regardless.
--
-- 03 §8.2 row (already reserved by `0125`, now true as written):
--   | `POL-notification_templates.blocks.shape` | … an object with `schemaVersion` and NO `blocks` key is refused `23514` too. |

alter table public.notification_templates
  drop constraint notification_templates_blocks_shape;

alter table public.notification_templates
  add constraint notification_templates_blocks_shape check (
    blocks is null
    or (jsonb_typeof(blocks) = 'object'
        and blocks ? 'schemaVersion'
        and blocks ? 'blocks'
        and jsonb_typeof(blocks -> 'blocks') = 'array'
        and char_length(blocks::text) <= 200000)
  );
