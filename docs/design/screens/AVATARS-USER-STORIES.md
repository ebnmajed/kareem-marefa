# The profile picture — user stories

For `01-prd.md` (`REQ-PRF-008` … `REQ-PRF-011`, `STORY-PRF-005`'s upload half) and PRs A and B of `docs/design/LEAD-PROMPT-avatars-transitions.md`.
Design: `AVATARS.md`, row O of the canvas — `avatars/AvatarPicker.dc.html` (a library avatar is
current), `avatars/AvatarPickerPhoto.dc.html` (a photo is current), `avatars/AvatarCrop.dc.html`
(the crop step), the two library boards — and the way in, row G: `m10c/Me.dc.html`, `m10c/MeEdit.dc.html`. Rulings: `DEC-099` (copy, never hotlink), `DEC-180` (the
built import half). Numerals Western (`DEC-124`); UI copy is a word or a number, never a sentence.

## A. What a picture is
- **AVA-01** As a member, my picture is exactly one of three — my Google photo (copied), a photo I
  uploaded, or a library avatar — and one of them shows everywhere. *AC:* resolver order photo →
  library SVG by `avatar_key` → initials; at most **one stored photo object** per member, under the
  org prefix through the one path builder (`REQ-PRF-008`); the nightly prefix assertion covers it;
  `members.avatar_source` says which photo it is (`google` | `upload`, null when none).
- **AVA-02** As a new member, I get a library avatar at random the moment my account is created, so
  nobody is initials on day one. *AC:* assigned once in the member-creation path across both sets
  (`avatar_key` = `<set>/<key>`); stable until I change it; existing members without a photo are
  backfilled; initials (`REQ-PRF-009`) remain only where an SVG cannot render — CSV and email — or
  for an anonymised member.
- **AVA-03** As a new member, at first sign-in I am asked once «نستخدم صورتك من Google؟»; yes
  copies it (the import `DEC-180` built), no keeps my avatar. *AC:* unchanged from `REQ-PRF-008`
  except the "no" outcome: the library avatar, not initials.

## B. The sheet (ملفي → صورتك)
- **AVA-04** As a member, my picture on «ملفي» is the way in: tapping it opens the sheet «صورتك», and in
  edit mode («عدّل ملفك») it carries a camera badge that opens the same sheet. The sheet: my picture
  large in my team ring · «ارفع صورة» · «من Google» · the chips شخصيات · أشياء over the grid · «حفظ».
  *AC:* `m10c/Me.dc.html` (tappable, nothing drawn) and `m10c/MeEdit.dc.html` (the badge); the sheet
  is the only place the picture changes; «حفظ» commits; closing without saving changes nothing;
  desktop shows the same sheet centred.
- **AVA-05** As a member, the sheet offers only what applies: «من Google» only when Google gave me a
  picture; «أزل الصورة» only when a photo is current; the outline in the grid only when a library
  avatar is current. *AC:* no disabled controls, no explanations — absent when they cannot apply.

## C. Upload
- **AVA-06** As a member, «ارفع صورة» opens my camera or files, then the crop screen: the image, a
  circle, pinch and drag (a zoom slider too), «إلغاء» · «حفظ». *AC:* `accept` lists PNG and JPEG so
  iOS converts HEIC itself; the circle's content is saved square at 1024 px, ≤ 1 MB, JPEG; «حفظ»
  uploads, closes the whole flow and the ring shows the result; «إلغاء» returns to the sheet unchanged.
- **AVA-07** As a member, a wrong file is refused with a word, not a sentence: «PNG أو JPG فقط» ·
  «أكبر من 20 م.ب» (the chosen file) · «تعذّر الرفع» with «أعد المحاولة». *AC:* the server sniffs
  on content after the bytes land — an SVG renamed `.png` is refused there (`REQ-PRF-010`); EXIF is
  stripped from the stored original; the 96 px and 192 px WebP derivatives come from the existing
  content-pipeline job.
- **AVA-08** As a member, uploading replaces whatever I had. *AC:* the previous photo object —
  upload or Google copy — is deleted in the same transaction; `avatar_source` = `upload`;
  `avatar_version` bumps so every cached placement drops.

## D. Google
- **AVA-09** As a member, «من Google» copies my current Google picture through the same import job
  (Google's host only, byte cap, sniffed, EXIF-stripped) and «حفظ» makes it current. *AC:* shown
  whenever Google gave a picture URL at sign-in, whether or not I said yes then (amends
  `REQ-PRF-008`'s «offered once»: prompted once, available from the sheet after); never a hotlink
  (`DEC-099`); the job re-copies a changed source only while `avatar_source` = `google` — an
  upload is never overwritten by a refresh; the upload object, if any, is deleted.

## E. The library
- **AVA-10** As a member, tapping an avatar in either set outlines it and shows it in the ring;
  «حفظ» makes it mine. *AC:* `avatar_key` = the tapped key; the photo object is deleted and
  `avatar_source` cleared; both sets scroll in the one grid; the chips switch sets.
- **AVA-11** As anyone, an avatar carries no visible text. *AC:* the character's name is the
  `aria-label` only; the team ring the component draws stays outside the disc.

## F. Remove
- **AVA-12** As a member with a photo, «أزل الصورة» shows my library avatar in the ring and «حفظ»
  deletes the photo. *AC:* removal is immediate and complete — row cleared, object deleted
  (`REQ-PRF-008`), no confirm; the avatar shown is the key I hold, assigned at random if I never
  held one; the Google copy can be fetched again with «من Google»; the upload is gone for good.

## G. Where it shows
- **AVA-13** As a member, my picture appears everywhere `avatar` renders — the shell, ملفي,
  profiles, the directory, comments, attendance, the host view, attendee story frames, the
  console. *AC:* every reader goes through the one resolver (`avatarHref()`, contract 4); realtime
  payloads carry the version, never a URL on a third-party host.
- **AVA-14** As a member on the leaderboards, rows stay initials in a team ring. *AC:* `REQ-UIX-037`
  and `DEC-099` unchanged; a board draws no `avatar`.
- **AVA-15** As a reader of an export or an email, I see initials, never a picture. *AC:* CSV
  carries no image; mail renders initials; the library SVG is never inlined in mail.

## H. Platform
- **AVA-16** As a moderator, a reported or taken-down profile photo goes through the photos queues
  (`SCR-051` · `SCR-052`) and reverts the member to their library avatar. *AC:* takedown deletes the
  object and clears `avatar_source`; audited (`REQ-ADM-010`); a library avatar cannot be reported;
  amends `REQ-PRF-010`'s «reverts to initials».
- **AVA-17** As the platform, anonymisation clears the picture entirely and the data export
  includes it. *AC:* `JOB-anonymise_members` deletes the photo object and nulls `avatar_key` and
  `avatar_source` — a former member is initials over the tint (`REQ-PRF-011`); the export archive
  holds the photo when one exists.

## I. Out of scope
Animated or GIF avatars, filters and stickers on photos, more than one photo, an org-wide default
avatar, admins setting a member's picture, pictures on the leaderboards, adding to the library
without a file, a row in the README and a `DEC`.
