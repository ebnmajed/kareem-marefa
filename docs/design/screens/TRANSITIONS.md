# Transitions — spec

Navigation motion with the playground's physicality: things press, jump, drop in with weight, and the screen you
leave sinks away. This amends `16` §7.5's «Tier 3 stays quiet» — navigation now carries the game feel; the five
moments (`REQ-UIX-019`, `REQ-UIX-044`) remain the only celebrations and never play during a move.
Row **P** of the canvas: `TransitionsA.dc.html` (دفع · تبديل), `TransitionsB.dc.html` (قفزة: الملصق · القصة),
`TransitionsC.dc.html` (ضغطة · ورقة · القواعد) — five sampled frames per move on its real curve. Live:
`docs/design/prototypes/transitions.html` (the real artboards; toggles for reduced motion, ×4 slow, slow network).

## Two curves, four durations
`--ease-out: cubic-bezier(.2,.8,.2,1)` for quiet moves and every return · **`--ease-pop: cubic-bezier(.3,1.4,.5,1)`**
(≈ 5 % overshoot) for arrivals · `--dur-fast` 120 · `--dur-base` 200 · `--dur-slow` 360 · **`--dur-play` 480**.
`--ease-pop` and `--dur-play` are new tokens beside `16` §4.1's; all collapse to 0 under reduced motion.
Overshoot only on arrival — back and close settle on `--ease-out`.

## Press first — ضغطة
Everything that starts a move presses first: the tapped thing goes to 96 % (a pop button goes down 3 px and its
shadow collapses, as the button already does) for `--dur-fast` and springs back on `--ease-pop`. Then the move.

## The moves
| Move | When | What happens | In | Out |
|---|---|---|---|---|
| **قفزة · الملصق** jump | timeline or browse card → the event page | the poster **jumps** from the card to its hero slot and its window opens to reveal the whole poster (`view-transition-name: poster-<id>`); the page behind **sinks** — 94 %, half dark, 6 px blur; the event's blocks **drop in** from below one after another, 40 ms apart, each on `--ease-pop`, the action button last | `--dur-play` on `--ease-pop` · blocks `--dur-slow` | the poster shrinks back into its card while the page rises; `--ease-out` |
| **قفزة · القصة** | ring → story viewer (Instagram's zoom) | the page **leans into the ring** (108 % around it, darkens); the story is **a circle the size of the ring** that grows out of it until it fills the screen — border-radius 50 % → 0, scale from the ring's size, centre moving from the ring to the screen's centre — and settles with the overshoot | `--dur-play` · `--ease-pop` | shrinks back into its ring; `--dur-slow` · `--ease-out` |
| **دفع** push | a screen to its child: حسابي → الإعدادات, the event → العارض · تسجيل الحضور · التقييم, the directory → a profile | the child slides in from the **inline-end** edge (left in Arabic) and settles with the overshoot; the parent **sinks** (94 %, half dark, 6 px blur); the tab bar drops | `--dur-slow` · child `--ease-pop` | the mirror on `--ease-out`; the browser's back too |
| **تبديل** switch | the five tabs, the hub strip, the desktop rails | the tapped tab's icon **jumps** (130 % and back, `--dur-slow` `--ease-pop`); the content comes in **from the tapped tab's side** (tab order decides) while the old leaves the other way, both with the fade | `--dur-base` · `--ease-out` | none — a switch has no direction |
| **ورقة** sheet | bottom sheets, menus, pickers; desktop dialogs | rises with weight (5 % overshoot) while the scrim fades to 72 % and the page behind sinks to 97 %; a desktop dialog scales 0.96 → 1 | `--dur-slow` · `--ease-pop` | drops on `--dur-base` `--ease-out` |
| — | the console and the platform (`REQ-UIX-053`), every error state, reduced motion | a cut; the progress bar alone remains | 0 | 0 |

Desktop: nothing slides between screens. A push is a switch inside the frame (content from the side, no blur); the
poster jump and the story zoom stay; dialogs replace sheets.

## Rules
1. **Press, then move — on arrival, never on click.** The press is immediate; the move plays when the next screen,
   or its `loading.tsx` skeleton, commits. Past 150 ms the shell's progress bar shows (`REQ-UIX-006`); the link
   keeps its pending affordance. Content that streams in later replaces the skeleton with an opacity-only
   `--dur-fast` fade — never a second move.
2. **Depth, not fade.** A screen you leave sinks (scale, brightness, blur); what arrives jumps or drops. Nothing
   simply fades in alone.
3. **Direction follows `dir`.** Inline-end is the left in Arabic, the right in English; a switch comes from the
   tapped tab's side; back is the mirror of forward (`navigation.activation.navigationType` / the router's history
   index decides push vs back; the house `ui/link` marks the kind).
4. **`transform`, `opacity`, `filter` only** (`REQ-UIX-020`) — blur is the one `filter` use. Two documented escape
   hatches for the lint rule: the poster's view-transition group (a snapshot, never live DOM) and `border-radius`
   on the story portal (a composited layer).
5. **Reduced motion is a cut** (`REQ-UIX-014`): every duration is 0, the new screen is the static state; the press,
   the progress bar and the pending affordance stay.
6. **The moments wait.** A moment starts once the screen has landed, never inside a move.

## Mechanism (for the lead; verify against the tree — Next 16.3.5, React 19.3)
- The View Transitions API, no library: React's `<ViewTransition>` with `experimental.viewTransition`, else
  `document.startViewTransition` around the router transition. `ui/link` (and the back handler) sets
  `<html data-nav="jump|push|back|switch|sheet|none">` before navigating; `::view-transition-old(root)` /
  `::view-transition-new(root)` keyframes per kind — the old root gets the sink, the new root the slide or drop.
- Poster: `view-transition-name: poster-<sessionId>` on the card poster (timeline, browse) and the event hero, with
  the snapshots at natural size (`object-fit: none`, anchored top) so the group opens like a window instead of
  stretching. The event's blocks: `view-transition-name` per block or a `[data-nav="jump"]` keyframe with
  `animation-delay: calc(var(--i) * 40ms)`.
- Story: the viewer root is a full-screen element with `transform-origin` at its centre; the opening keyframes
  translate + scale from the ring's rect (measured on tap) with `border-radius` 50 % → 0; the home root scales 1.08
  around the ring and darkens. Close is the reverse on `--ease-out`.
- Press: one `[data-press]` keyframe pair in `ui/` applied by `ui/link`, `ui/button` and the ring/card.
- Console and platform layouts opt out (`data-nav="none"`; `view-transition-name: none` on their roots).
- Browsers without the API get the cut — the static state is the design, not a fallback.

## User stories
- **TRN-01** As a member, what I tap presses before anything happens. *AC:* buttons, cards, rings and tabs go to
  96 % (pop buttons down 3 px) for `--dur-fast` and spring back; under reduced motion the press still shows.
- **TRN-02** As a member, the poster I tapped jumps into place as the event's hero and the page builds under it
  block by block. *AC:* from the timeline and from الجلسات; the page behind sinks and blurs; blocks drop 40 ms
  apart on `--ease-pop`; back shrinks the poster into its card.
- **TRN-03** As a member, a story opens by zooming out of the ring I tapped — like Instagram — and closes back into
  it. *AC:* a circle the ring's size grows to the screen with the overshoot; the page leans into the ring; close
  reverses on `--ease-out`; swipe-down and «إغلاق» both close.
- **TRN-04** As a member, going deeper slides the child over a parent that sinks away, and back brings it up again.
  *AC:* the four pushes; `--dur-slow`; blur 6 px on the parent; the browser's back mirrors.
- **TRN-05** As a member, switching tabs feels directional and alive: the icon jumps and the content arrives from
  the tab's side. *AC:* tab order decides the side; `--dur-base`; the hub strip and the rails behave the same.
- **TRN-06** As a member, sheets land with weight and lift away cleanly. *AC:* 5 % overshoot on open; the page
  behind sinks to 97 %; close on `--ease-out`; desktop dialogs scale 0.96 → 1.
- **TRN-07** As a member on a slow network, I see my press and the shell's bar past 150 ms; the move plays only when
  the screen arrives. *AC:* no move onto a blank page; the skeleton rides in when that is what committed;
  streamed content fades in with no second move.
- **TRN-08** As a member with reduced motion, screens cut; press, bar and pending affordance still show. *AC:* a
  Playwright pass with `prefers-reduced-motion: reduce` over the five moves — end state reached, nothing
  mid-transition.
- **TRN-09** As an admin in the console, nothing moves. *AC:* `/app/admin/**` and `/app/platform/**` cut; the
  import-graph test extends to the `data-nav` kinds.
- **TRN-10** As the platform, every move holds 60 fps. *AC:* jump, story and push traced on a throttled CPU profile,
  no frame over 16 ms (`REQ-NFR-008`); blur limited to the sinking root; `ui-lint`'s keyframes rule passes with
  the two escape hatches documented.

## Out of scope
Gestures (edge-swipe back is the browser's), shared-element morphs beyond the poster and the ring, scroll-linked
motion, transitions on the five public routes (`REQ-NFR-019`), a motion library.

Wave prompt: `docs/design/LEAD-PROMPT-avatars-transitions.md` (PR C).
