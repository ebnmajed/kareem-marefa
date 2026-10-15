-- 0229 — story_views: no client writes it any more (DEC-297 §2; REQ-VEW-002). 0228 kept 0198's insert policy and grant
-- so `main`'s viewer could still record «seen» between that migration and the merge of the views code; since the
-- merge every view goes through `record_views()`. Pushed after the views code is live.

drop policy if exists "story_views_insert_own" on public.story_views;
revoke insert on public.story_views from authenticated;
