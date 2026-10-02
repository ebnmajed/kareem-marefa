-- 0174 · wave 20 (REQ-EVT-011, REQ-EVT-010, DEC-221) — a member can no longer insert a photos row directly.
--
-- ★ THE DEFECT, live since 0037. `grant insert on photos to authenticated` (0037:522) and `photos_insert_checked_in`
-- (0037:510) admit a direct insert from any checked-in member, presenter or staff — and `exif_stripped` is only a
-- boolean the CALLER sends. `photos_storage_write` (0037:657) lets the same member PUT any object under
-- `photos/{org}/sessions/{session}/`, and `photos_storage_read` (0037:646, amended 0156) opens an object as soon as a
-- photos row exists whose id is the object's file name. So: PUT the ORIGINAL image as `<uuid>.jpg`, insert a row with
-- that id and `exif_stripped = true`, and the org reads the photograph with its GPS position and device data — the
-- exact thing REQ-EVT-011 forbids («never retrievable before its EXIF strip completes»). Found by `content` while
-- measuring for the photo award, which would have turned the same door into a points farm.
--
-- ★ THE FIX. The only legitimate writer is `record_photo_upload()` (0050) — `security definer`, service_role-only,
-- called by the worker after it has stripped the bytes and written them back to the same path. Nothing under `src/`
-- inserts into photos. So the direct door closes: the policy is dropped and the grant revoked. A definer function is
-- unaffected by either. There is no storage `update` policy on the bucket (none in any migration), so a processed
-- photo's object cannot be overwritten either; an orphan PUT with no row stays unreadable to everyone.
--
-- `select` and the staff/moderation column `update` grants are unchanged. `03` §5.6c changes with this file.
--
-- Additive in effect for `main`: main's app never inserts a photos row (it uploads, then the worker records), and
-- main's worker calls the same definer function. Nothing on main does anything different.

drop policy "photos_insert_checked_in" on public.photos;
revoke insert on public.photos from authenticated;
