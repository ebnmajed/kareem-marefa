-- The public card's image is public to MEMBERS too — a correction to `0080`.
--
-- `0080` gave `exports_storage_read_public_card` to `anon` alone. `anon` is
-- not the only caller: `/api/s/{id}/og` reads the object as WHOEVER asked, and
-- a signed-in member of ANOTHER org is `authenticated`. For them
-- `exports_storage_read` (0037) does not apply — it is org-prefixed — and this
-- policy did not either, so they would have seen a broken image on a card an
-- anonymous stranger sees fine.
--
-- Signing in must never show a person LESS than signing out would. What this
-- opens to a member is exactly what it opens to the street, which is the
-- definition of the word public; the predicate is unchanged, so nothing else
-- in `exports` moves.
--
-- ★ IF `0080` HAS NOT BEEN APPLIED YET, fold the two words into it instead of
-- promoting this file — it is the same policy written once.
--
-- Serves:  REQ-SES-006, REQ-NFR-001
-- Cites:   0037 (exports_storage_read), 0080 (the policy this replaces)
--
-- 03 §8.2 row this REPLACES (the `POL-storage.exports.public_card` row `0080` added):
--   | `POL-storage.exports.public_card` | `anon` reads the `og.png` object of a card-eligible
--     session's poster, and nothing else in `exports` — not the same poster's `master`, `a4` or
--     `cert_*` objects, not the `og` of a draft or cancelled session. A member of ANOTHER org
--     reads the same object and no more: signing in never shows less than being a stranger. |

drop policy if exists "exports_storage_read_public_card" on storage.objects;
create policy "exports_storage_read_public_card" on storage.objects for select to anon, authenticated
  using (bucket_id = 'exports' and public.export_is_public_card(name));
