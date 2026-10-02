-- content · wave 20, PR C — the photo award's trigger on `photos` (DEC-220 §2, DEC-222 §1.1). Applies AFTER
-- `scoring`'s file, whose two functions it calls. The migration number is the lead's, at promotion.
--
-- ★ THE AWARD FOLLOWS VISIBILITY — `hidden_at` and `removed_at` both null. `content` decides WHEN; `scoring` decides
-- what is paid, the epoch, the cap and visibility at the moment it runs (wave 12's contract-2 shape, one writer per
-- function):
--
--   insert, visible                       → award_photo_points(id)                        — the first award
--   update: hidden_at set, not removed    → reverse_photo_points(id, 'أُخفيت الصورة')     — a takedown request, or staff
--   update: hidden_at cleared, not removed→ award_photo_points(id, true)                  — restored; re-pays only what was reversed
--
-- ★ No «processing» row exists: `check (exif_stripped)` (0037:169) and, since 0174 (DEC-221), `record_photo_upload()`
-- as the ONLY writer — so an insert IS the stripped photo becoming visible (REQ-EVT-010, REQ-EVT-011).
--
-- ★ `new.removed_at is null` ON BOTH UPDATE CLAUSES IS LOAD-BEARING. `remove_photo()` (0059) sets `removed_at` AND
-- `hidden_at` in one update; removal is `scoring`'s alone (0059's `photos_reverse_points`, «حُذف المحتوى»), so this
-- trigger never reaches it, and an unhide of a removed photo never pays.
--
-- Fires on nothing else: not `hidden_reason`, `removal_reason` or a re-scope (`session_day_id`, 0115), and not on
-- delete — rows go only by a session's or org's cascade, and deleting a session with its awarded points is carried
-- (DEC-216 §7), never reversed here.
--
-- `security definer`: `scoring`'s two functions are granted to `service_role` only, and the actor of a hide is a
-- requester or staff, of an insert the worker. It writes no ledger row itself.
--
-- Serves: REQ-UIX-083, REQ-PTS-013, REQ-EVT-010 … 012, REQ-EVT-014
-- 03 §8.2 rows this adds:
--   | `POL-photos.points.insert`  | a stripped photo inserted by `record_photo_upload()` pays its uploader one `photo` award |
--   | `POL-photos.points.hide`    | a visible photo hidden (takedown or staff) reverses the standing award once, «أُخفيت الصورة» |
--   | `POL-photos.points.restore` | a hidden photo restored is paid again — once more, never twice net |
--   | `POL-photos.points.removal` | a removal never reaches this trigger; `scoring`'s path reverses it |

create function public.photos_points() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.award_photo_points(new.id);
  elsif new.hidden_at is not null then
    perform public.reverse_photo_points(new.id, 'أُخفيت الصورة');
  else
    perform public.award_photo_points(new.id, true);
  end if;
  return null;
end $$;
revoke all on function public.photos_points() from public, anon, authenticated;

create trigger photos_points_insert after insert on public.photos
  for each row
  when (new.hidden_at is null and new.removed_at is null)
  execute function public.photos_points();

create trigger photos_points_visibility after update of hidden_at on public.photos
  for each row
  when (new.removed_at is null and (old.hidden_at is null) <> (new.hidden_at is null))
  execute function public.photos_points();
