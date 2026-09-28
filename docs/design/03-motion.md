# 03 — Motion

**Serves:** `REQ-UIX-014` (reduced motion by token), `REQ-UIX-020` (transform/opacity/filter only,
60 fps), and — once accepted — the amended `REQ-UIX-018` / `REQ-UIX-019` (five moments, house
vocabulary allows confetti and stickers; see `06`).
**Reference:** `prototypes/motion-story.html` plays all of this in sequence.

## The rule

Five orchestrated moments play once per occurrence, never on a re-render, each with a named static
state that is a complete experience under reduced motion. Everything else is an acknowledgement:
a 260ms pop, a 220ms fade, a state change in place. Failure never animates. Tables, lists, admin
screens, the audit log, exports and every error state do not animate.

## The five moments

### 1. الحجز — a reservation confirmed (`SCR-012`)

| | |
|---|---|
| Trigger | the reserve action resolves with `confirmed` (never optimistic — `REQ-UIX-007`) |
| Sequence | ticket card rises from behind the CTA (`translateY(60px)→0`, opacity, 420ms ease-out) → stamp «محجوز» lands (`scale(2.4)→1` at `rotate(-8deg)`, 420ms ease-out, no overshoot) → the card thuds (`translateY 0→3→0`, 160ms) → capacity chip updates in place → after 520ms the ticket fades and the CTA becomes «محجوز» with «ألغِ حجزي» beneath → calendar toast whispers for 1.4s |
| Static state | CTA in the booked state, capacity updated, toast shown without motion |
| Waitlisted | same ticket, stamp reads «قائمة الانتظار · 3», colour cyan |

### 2. تسجيل الحضور — a check-in accepted (`SCR-014`)

| | |
|---|---|
| Trigger | the check-in RPC returns success |
| Sequence | confetti burst (44 particles, team colour + lime + bone, WAAPI, 700–1200ms) → coin drops (`translateY(-240px) scale(.6)` → `0 / 1.06` at 60% → squash `scale(1.02,.92)` at 78% → rest, 900ms) → copy fades in at 520ms: «أنت هنا!», «+50 تصل عند انتهاء الجلسة», the time chip → holds 1.4s → returns to the event page whose CTA now reads «حضرت» |
| Copy rule | the amount shown is computed from `scoring_rules` and the attendance, never a stored figure; it always says the points arrive at completion (`REQ-CHK-018`, `REQ-PTS-015`) |
| Static state | the overlay with coin at rest and the three lines; no particles |

### 3. انتهت الجلسة — the session completed and paid (`SCR-012`, `SCR-022`, home)

| | |
|---|---|
| Trigger | the member first sees the ledger rows the completion pass wrote |
| Sequence | points count up from the old balance to the new (700ms, cubic ease-out, `requestAnimationFrame` writing text) with the «+50» delta fading in beside → streak flame grows (`scale(1)→1.28`, 420ms) and keeps its 2s flicker loop → level bar fills (`scaleX`, 900ms) |
| Static state | new balance, delta shown, flame at the larger size without flicker, bar full |

### 4. ترقية المستوى — a level reached (same surface, after 3 when a threshold is crossed)

| | |
|---|---|
| Trigger | `points_balances.current_level_id` changes |
| Sequence | the level card flips (`rotateY(180deg)`, 900ms ease-out, `preserve-3d`, both faces `backface-visibility: hidden`) → one shine sweep across the back face (a rotated bone bar, `translateX`, 700ms, starting at 60% of the flip) → rests. The back face names the level and the privilege it unlocks (`REQ-REC-004`) |
| Static state | the back face shown, no shine |

### 5. تغيّر الترتيب — a rank change (`SCR-027`, `SCR-028`)

| | |
|---|---|
| Trigger | the member opens a board where their rank changed since last view (or a live update lands) |
| Sequence | the two rows swap by FLIP: `translateY(∓64px)` on both (420ms ease-out), then DOM reorder with transitions disabled for one frame, then transforms cleared → the arrow on the rising row pulses once (600ms). The falling row gets no colour and no shake. Race bars move by `scaleX` (900ms), transform-origin at the inline start (`right` in RTL) |
| Static state | the new order, arrow shown |

## Whispers (acknowledgements)

| Where | What | Duration |
|---|---|---|
| reaction pill | `scale 1→1.22→1`, count changes in place | 260ms |
| code box | `scale 1→1.14→1` as each character lands; border turns lime when full | 200ms |
| toast | fade + `translateY(8px)→0` | 220ms |
| state badge | background and colour transition in place | 220ms |
| sheet | `translateY(100%)→0` | 420ms |
| screen change | opacity + `translateX(-28px)→0` | 220ms |
| story progress | `scaleX` on the current segment, linear over the frame's duration | per frame |
| live ring | a pulsing outer ring, `scale .9→1.25` with opacity to 0, 1.6s loop | loop |

## Implementation patterns (React + CSS, no library)

- **Durations and easing come only from tokens** (`--duration-*`, `--ease-out`). A component that
  declares its own duration fails review (`REQ-UIX-014`).
- **Keyframes touch transform, opacity and filter only.** The lint rule already exists; the flame
  flicker (scale/skew), the shine (translate/opacity), the pop (scale) and the coin drop
  (translate/scale/opacity) all pass. Bar growth is `scaleX`, never `width`; row moves are
  `translateY`, never `top`; height changes animate `grid-template-rows`.
- **Confetti** is a small utility (`src/lib/ui/confetti.ts`): creates N absolutely positioned
  particles in an `aria-hidden`, `pointer-events: none` layer, animates each with `element.animate`
  (three keyframes: rise, arc, fall; transform + opacity), removes the node on `finish`, and returns
  immediately when reduced motion is on. Colours come from the member's `--team` plus lime and bone.
- **Count-up** is a hook (`useCountUp(from, to, 700)`) that writes formatted text with the repo's
  numeral formatter; under reduced motion it sets the final value at once.
- **Loops** (flicker, live pulse) are declared with `animation:` on a class and switched off with
  `animation: none` under `prefers-reduced-motion`; they are never driven by JS.
- **Once per occurrence**: each moment is keyed on the event id (reservation id, check-in id, ledger
  row id, level id, snapshot id) and recorded in component state (or `sessionStorage` for the
  completion moment) so a re-render or a back navigation does not replay it.
- **Reduced motion is a real state**, not a shortened animation: every moment has a named static
  render that is reviewed at 390px alongside the animated one (`REQ-UIX-019`).
- `will-change` is set only for the duration of a moment and removed on finish.

## Tests

- jsdom: each moment's component renders its static state when `prefers-reduced-motion` matches, and
  does not replay when re-rendered with the same event id.
- Playwright (throttled CPU): the check-in moment and the reservation moment trace with no frame over
  16ms (`REQ-UIX-020`).
- Lint: no `@keyframes` block touching anything but transform, opacity or filter; no per-component
  duration; no animation dependency in `package.json`.
