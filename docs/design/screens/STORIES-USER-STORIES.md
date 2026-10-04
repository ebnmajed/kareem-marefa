# Session stories — user stories

For `01-prd.md` (`REQ-STO-*`) and `wave-24-lead.md` PR D. Design: `05-stories.md`,
`prototypes/stories.html`, rows N of the canvas (`m13/Story*.dc.html`, `m13/AdminAttendance.dc.html`).
Rulings: `DEC-NEXT-40`, `DEC-NEXT-41`. Numerals Western; copy per `DEC-NEXT-25`.

## A. What a story is
- **STO-01** As a member, every session has one story — its session's, never a person's — so I can
  catch a session's day without opening its page. *AC:* a story exists for every session from
  publication; it has no author; it carries frames in time order.
- **STO-02** As a member, a frame disappears 24 h after its trigger, so the ring row stays current.
  *AC:* a frame is hidden at `triggered_at + 24h`; the ring loses its state when its last frame
  expires; expired frames are retained for the admin only (see E).
- **STO-03** As a member, I see only my org's stories. *AC:* RLS on `story_frames` by org; the
  public card and verify pages carry none.

## B. Generated frames (`05-stories.md` §3 — the eight)
- **STO-04** As a member, a frame appears within a minute of each trigger: published · registration
  opens / closes · 24 h reminder · live (with the live count) · each attendee photo · completed
  (recap with attended / rating / materials) · materials added. *AC:* each trigger produces exactly
  one frame, idempotent on retry; the live frame updates its count while live; the recap renders
  the three stats and the first three photos.
- **STO-05** As a member, reactions on a frame are the four emoji and count as `REQ-SCR-021`'s
  structural zero. *AC:* one reaction per member per frame; no points; counts visible.

## C. The ring and the viewer
- **STO-06** As a member, the ring row on home shows each session's state — live (coral), unseen
  (team colour), seen (line), none — ordered live first, then newest. *AC:* `story-ring` states;
  seen = every frame viewed by me.
- **STO-07** As a member, tapping a ring (or «شاهد القصة» on a live event page) opens the viewer
  on the first unseen frame. *AC:* `story-viewer`: segmented progress, session avatar with team
  ring, title, presenter · company · age, close; frames advance on timer (photo 5 s, video its
  length, text 6 s); tap start-third = previous, elsewhere = next; hold pauses; swipe down closes;
  ← → Home End on desktop; `prefers-reduced-motion` removes the slide.
- **STO-08** As a member, the viewer's one action takes me where the frame points — «افتح الجلسة»
  on live/upcoming frames, «حمّل المواد» on the recap. *AC:* the action deep-links to the section.
- **STO-09** As a member on desktop, the viewer opens centred at phone width on the ink ground
  with the same keys. *AC:* no desktop-only chrome.
- **STO-10** As a member, a frame I viewed is marked so I'm not shown it again first. *AC:*
  `story_views` (member, frame, viewed_at), migration `0192`; views are private to the member.

## D. Attendee frames (`DEC-NEXT-41`)
- **STO-11** As a checked-in attendee, I can add a frame from the viewer — a photo (tap) or a
  video up to 15 s (hold), from the camera or my gallery, with one caption line — from session
  start until 24 h after. *AC:* `story-capture`; «أضف» exists only inside the window and only for
  checked-in attendees; 0:15 cap enforced in capture and on upload.
- **STO-12** As an attendee, my photo frame is also a photo in the session's album, with the
  album's points and cap; my video is a story frame only. *AC:* photo path reuses the album
  upload (EXIF stripped, 10 pt, 2 per session); video earns nothing and does not enter the album.
- **STO-13** As a member, an attendee frame shows who posted it, when, the caption, and `0:12` for
  video; it behaves like any frame (24 h, reactions). *AC:* avatar with team ring, name, age.
- **STO-14** As a person who appears in a frame, «أزلني» hides it for everyone immediately, video
  included. *AC:* same mechanism as photos (`REQ-PHO-*`); audited.
- **STO-15** As a member, I can report an attendee frame; it is hidden on first report and goes
  to the photo reports queue. *AC:* reports and takedowns reuse `050`/`051`; video plays in the
  moderation detail.
- **STO-16** As the platform, a video is ≤ 15 s and ≤ 60 MB, transcoded to one MP4 rendition,
  served from the asset bucket, deleted with the session. *AC:* the lead names the transcoding
  path and its cost; a failed transcode shows «تعذّر» to the poster and nothing to others.

## E. Admin
- **STO-17** As an admin, the session's الحضور tab shows «قصص الحضور» — every attendee frame,
  kept after the 24 h, with the poster and «أزل». *AC:* removal pulls the frame from the story and
  the album; audited (`REQ-ADM-010`).
- **STO-18** As an admin, generated frames need nothing from me; cancelling a session ends its
  story. *AC:* cancel hides all frames; the ring goes to none.

## F. Out of scope
Authored text frames, stickers, drawing, music, member-owned stories, story notifications, points
for reactions or video, cross-org stories, public stories.
