# Avatars — spec

Row **O** of the canvas: `AvatarLibraryChars.dc.html` (the twenty-five characters), `AvatarLibrary.dc.html`
(the twenty-five objects) and the sheet in three states — `AvatarPicker.dc.html` (a library avatar is current),
`AvatarPickerPhoto.dc.html` (a photo is current: «أزل الصورة» shown, nothing outlined), `AvatarCrop.dc.html`
(the crop step). Assets: `docs/design/assets/avatars/`. Stories: `AVATARS-USER-STORIES.md` (AVA-01 … AVA-17).

## The way in (ملفي)
`m10c/Me.dc.html`: the picture in the hero is tappable, nothing drawn. `m10c/MeEdit.dc.html` («عدّل ملفك»): the
same picture with a camera badge (26 px, lime, pop shadow, bottom inline-end). Both open the sheet. The hero shows
the held avatar, never initials.

## The sheet (ملفي → صورتك)
Drawn over the dimmed edit screen. From the top: the current picture at 80 px in the team ring (the avatar
centred, 4 px gap) · «صورتك», with «أزل الصورة» under it only when a photo is current · «ارفع صورة» (primary) ·
«من Google» (only when Google gave a picture) · two chips شخصيات · أشياء above a 5-column grid that scrolls,
the current avatar outlined accent when a library avatar is current · «حفظ». No labels, no captions, no
disabled controls — what cannot apply is absent. Desktop: the same sheet centred.

**Upload** → the crop screen: «إلغاء» · «صورتك» · the image behind a 300 px circle · a zoom slider · «حفظ».
Saves the circle square at 1024 px, JPEG ≤ 1 MB; EXIF stripped and sniffed server-side (`REQ-PRF-010`).
Refusals are a word: «PNG أو JPG فقط» · «أكبر من 20 م.ب» · «تعذّر الرفع» + «أعد المحاولة».

**Rules:** one stored photo at a time. Uploading or «من Google» replaces it; picking a library avatar or
«أزل الصورة» deletes it. Removal is immediate; no confirm.

## Where it shows
Everywhere `avatar` renders. Leaderboards stay initials (`DEC-099`); CSV and email stay initials.

## Data
`members.avatar_key text null` (`<set>/<key>`) — assigned at random across both sets at creation, backfilled for
members without a photo; `members.avatar_source text null` (`google` | `upload`) — which photo the one stored
object is; `avatar_version` as built (`DEC-180`). Migration at the next free number; `REQ-PRF-008` … `011`
amended by one `DEC` (the library as the default, the sheet's «من Google», takedown reverting to the avatar).

Wave prompt: `docs/design/LEAD-PROMPT-avatars-transitions.md` (PRs A and B).
