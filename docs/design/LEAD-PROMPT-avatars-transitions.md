# The lead prompt — avatars, the profile picture, transitions

The owner's prompt for wave 29, kept so `AVATARS.md` and `TRANSITIONS.md` resolve their citation. It was given to the
lead on 2026-10-10. The rulings it carried, and the two the owner added at sync 1 (a picture is not reportable; the
current members get their avatars), are `DEC-280`; the brief is `docs/plan/notes/wave-29-lead.md`. Where this file and
`DECISIONS.md` disagree, `DECISIONS.md` wins — and two of its premises were measured wrong at sync 1: `0194` is not
missing, and Next 16.3.5 needs no `experimental.viewTransition` flag.

**This wave claims three things, and nothing else:**
1. **The avatar library** — fifty SVG avatars in two sets (`characters/`, `objects/`), one assigned at random to
   every member at creation, the fallback chain photo → library SVG → initials.
2. **The profile picture** — its three sources (a Google copy, an upload, a library avatar) and the sheet that
   changes it: upload through a crop step, «من Google» on demand, picking from the library, «أزل الصورة»; the way
   in on ملفي; moderation and anonymisation of a photo.
3. **The transitions** — press-then-move navigation motion: the poster jump, the story zoom from its ring, push,
   switch, sheet; two new tokens; a cut in the console.

## The owner's rulings
1. **The library is the default picture.** A member with no photo holds a library avatar from creation, assigned at
   random across both sets; initials remain only where an SVG cannot render (CSV, email) and for an anonymised
   member. Amends `REQ-PRF-009`'s «default».
2. **One stored photo object at a time.** Uploading or «من Google» replaces it; picking a library avatar or
   «أزل الصورة» deletes it, in the same transaction. Removal is immediate, no confirm (`REQ-PRF-008`).
3. **«من Google» is prompted once, available after.** The sign-in prompt stays as built; the sheet offers the copy
   whenever Google gave a picture, through the existing import job; a refresh never overwrites an upload. Amends
   `REQ-PRF-008`'s «offered once».
4. **A taken-down photo reverts to the library avatar**, never to initials. Amends `REQ-PRF-010`.
5. **Navigation carries the game.** Press-then-move; the five moves of `TRANSITIONS.md`; `--ease-pop` and
   `--dur-play` join the tokens; overshoot on arrival only; the screen you leave sinks. Amends `16` §7.5's «Tier 3
   stays quiet». The five moments stay the only celebrations and never play inside a move.
6. **The console cuts** (`REQ-UIX-053` unchanged): `/app/admin/**` and `/app/platform/**` get no move.
7. **Leaderboards stay initials** (`DEC-099`, `REQ-UIX-037` unchanged).

## PR split
**A — the library** (AVA-01 … 03, 10, 11, 13 … 15) · **B — the picture** (AVA-04 … 09, 12, 16, 17) · **C — the
transitions** (TRN-01 … 10). B depends on A; C is independent.

## Strings
Every new string in `messages/ar/` first, a word or a number — «ارفع صورة» · «من Google» · «أزل الصورة» · «حفظ» ·
«إلغاء» · «شخصيات» · «أشياء» · «PNG أو JPG فقط» · «أكبر من 20 م.ب» · «تعذّر الرفع» · «أعد المحاولة»; the fifty avatar
names from the README as `aria-label`s only.

## Definition of done
A new member has a random avatar; a member uploads, crops and sees the photo everywhere within a second; «من Google»
copies; «أزل الصورة» deletes the object and shows the avatar; a takedown reverts to the avatar; tapping a session card
jumps the poster into the event page and back; a ring zooms into its story; tabs switch from the tapped side; the
console cuts; everything cuts under reduced motion; no frame over 16 ms on jump, story and push.

## Gates
`ui-lint --strict` (keyframes rule with the two documented escape hatches: the view-transition group's size and
`border-radius` on the story portal); the reduced-motion Playwright pass over the five moves; the throttled-CPU trace;
the console import-graph test extended to `data-nav`; the storage-prefix assertion covering avatar objects; tests for
assignment on creation, the three sources and both deletions, the fallback chain, the refusal strings, the
refresh-never-overwrites-an-upload case, takedown and anonymisation; the five public routes unmoved (`qa:contract`,
`visual`'s public pairs); `npm run qa` green.

## Do not
Re-litigate a `DEC`. Touch the five public routes. Hotlink Google (`DEC-099`). Write «restyle». Let a `.dc.html`
class into `src/`. Put a ★ string into `en/` first. Leave a `<bdi>` off a code, a slug or a number. Add explainer
copy anywhere. Put a move on the console. Put a picture on a leaderboard.
