# 05 — Session stories

**Serves:** the owner's decision that stories are **generated from session activity and attendee
photos, with no authored frames**. Every frame below is a projection of rows that already exist;
stories add a query, a ring row on `SCR-010` and a viewer. No new content type.
**Reference:** `prototypes/stories.html` (ring row, four ring states, the viewer with all eight frame
types).

## Frame types

| # | Frame | Created when | Reads | Shown to |
|---|---|---|---|---|
| 1 | **الإعلان** | the session reaches `published` | `sessions`, `session_posters` (master artifact), `session_presenters` | every member |
| 2 | **العد التنازلي** | the morning of `starts_at` (org time zone) | `starts_at`, venue, `session_tasks` + the viewer's `task_completions` (reminder only, never counted) | every member; the tasks part only to a member with a reservation |
| 3 | **جارية الآن** | the transition to `in_progress` (`session_state_transitions`) | live `check_ins` count vs confirmed `rsvps` | every member; the CTA to members who may check in (relation + phase — `REQ-UIX-015`) |
| 4 | **صورة** | each `photos` row in the window with `exif_stripped = true`, not hidden, not removed | `photos`, uploader (member tier fields only — `REQ-PRF-004`) | every member |
| 5 | **الملخص** | the transition to `completed` | `check_ins` count, `points_ledger` rows for the session (sum), `photos` count, the rating aggregate **only at or above `rating_min_aggregate`** (`REQ-RAT-006`), top reaction from `reactions` | every member |
| 6 | **المواد** | the first `after` material becomes visible (`REQ-MAT-006`, per scope) | `materials` (respecting `allow_download`) | every member |
| 7 | **الشهادات** | the session's certificates reach `issued` | `certificates` count for the session; **the viewer's own certificate** (serial, kind) | every member sees the count; the personal line only to a recipient |
| 8 | **الفريق** | the company ledger rows for the session are written (`company_points_ledger`) | company gain, current race standing | every member |

Rules that follow from the requirements and must not be re-derived in the component:

- Frames are generated in the order above, then by time; a frame never appears before its trigger.
- Frame 4 is the only one with many instances. Cap at the last 12 photos in the window, newest last,
  so a busy session does not become a 60-frame story.
- Frame 5's rating cell shows «بعد 3» with the current count when below the minimum; it never shows a
  value derived from fewer than three ratings, and it never shows who rated.
- Frame 7 shows nothing personal to a non-recipient. The serial is `dir="ltr"` inside `<bdi>`.
- A photo that is hidden by a takedown (`photo_takedowns`) or removed disappears from the story on the
  next fetch and on the live channel; the viewer never keeps a frame whose row it can no longer read.
- Cancelled sessions have no story; their ring disappears and the event page carries the banner.

## Window, ordering, seen state

- **Window:** from 24 hours before `starts_at` to 24 hours after `ends_at` (per day for multi-day
  sessions, `REQ-SES-015`). Outside it the ring is gone; the recap lives on the session page.
- **Ring order:** `in_progress` first, then sessions starting today, then the rest of the week by
  start time, then completed-within-24h. Unseen before seen within each group.
- **Seen state:** a ring is seen when its last frame was reached or the member swiped past it. Two
  options; pick one in the DEC:
  - **A. `story_views`** — `(org_id, member_id, session_id, last_frame_key, seen_at)`, RLS self-only,
    written by a small RPC. Cross-device, survives reload. One tiny table.
  - **B. client-only** — `localStorage` keyed by session id, guarded. Zero schema, per device.
  Recommendation: A, because the ring row is the first thing on the home screen and a wrong "unseen"
  ring every morning is the kind of small lie people notice.

## The viewer

Behaviour as in the prototype, mirrored for RTL:

- Full-screen inside the app shell; the tab bar is hidden while open; `role="dialog"`, focus trapped,
  `Escape` closes and returns focus to the ring.
- Progress segments at the top, one per frame, filling right-to-left by `scaleX` over the frame's
  duration (5s; photos 4.2s; recap 6s). The segment is informational, so it still progresses under
  reduced motion; crossfades collapse.
- Tap the **left** half → next frame; tap the **right** half → previous (restarts the current frame if
  more than 1.5s in). Hold ≥ 220ms → pause with a «متوقفة» pill. Swipe right (dx > 60) → next session;
  swipe left → previous. Arrow keys follow the reading direction (`ArrowLeft` = next). Space pauses.
- When a session's frames end, the viewer moves to the next ring; after the last, it closes.
- Every frame has one action in its footer, from the relation and phase: reserve / booked / check-in
  (signal) / react (stickers) / download materials / view certificate / open the board. Photo frames
  also carry «أزلني» (`REQ-EVT-012`: hides instantly, then review).
- Header: session ring, title (single-line ellipsis in a mark-safe container), presenter and company,
  time-ago; close button 36px.
- Poster frames use the team colour as the ground with ink text; photo frames put a legibility
  gradient over the top and bottom of the photo; every other frame is on `--bg`.

## Data access

One DAL function, server-only (`src/lib/dal/stories.ts`):

```
getStoryFeed(orgId, memberId) →
  { sessions: [{ id, title, teamColor, presenter, company, status, startsAt, endsAt,
                 seen: boolean, frames: Frame[] }] }
```

- Built from a single query over sessions in the window joined to the counts above, plus the
  member's own relation (reservation, check-in, certificate). RLS does the filtering; the DAL never
  adds a permission check the policies do not already make.
- Realtime (`REQ-EVT-015`): the live count on frame 3 and new photo frames subscribe to the session's
  channel the event page already uses; nothing new is broadcast.
- Photos use a `story` derivative (1080 px on the long side, WebP) produced by the existing photo
  job; the grid derivatives are too small for a full-screen frame.
- Budget: the ring row is part of `SCR-010`'s budget; the viewer's first frame paints from data
  already in the feed response, and frames 4+ load their image lazily.

## Where it lands

- `SCR-010` home: the ring row under the header, above the timeline (`REQ-UIX-021` keeps one column:
  the row is 92px tall and scrolls horizontally inside it).
- `SCR-012` event page: a «القصة» entry in the sub-nav while the session is in its window.
- Admin: nothing. There is no story editor and no story queue; moderation of photos already covers
  frame 4.

## Tests

- RLS: a member of org A receives no story from org B; a hidden photo is absent from the feed for
  everyone; a held certificate produces no frame 7; a rating aggregate below the minimum produces the
  «بعد 3» cell.
- jsdom: the viewer opens on the right frame, `ArrowLeft` advances, `Escape` closes and returns focus,
  the tab bar is hidden while open.
- Playwright at 390px: tap zones, hold-to-pause, swipe to the next session, all with `page.click()` and
  `page.mouse` only.
