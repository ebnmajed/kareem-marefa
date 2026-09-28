# 00 — Direction: ساحة اللعب (Playground Arena)

**Serves:** the owner's brief of 2026-09-28 (fun, game-like, competitive, engaging; dark-first;
Arabic-first; full-party tone; 3D objects; big celebrations; companies as teams).

## The thesis, in one line

منصّة معرفة داخلية تُشبه لعبة: كل جلسة منشور، كل حضور نقاط، وكل شركة فريق.

An internal knowledge platform that feels like a game: every session is a post, every attendance is
points, and every company is a team. Dark ground, two loud accents, seven team colours, a chunky
rounded Kufi display face, toy-gloss 3D objects for the game layer, die-cut stickers for joy, and
sober status badges for truth.

## Eight principles

1. **A session post is an Instagram post.** Poster as the hero image (never cropped, `REQ-UIX-026`),
   one-thumb RSVP, reactions, comments, share, save. After the event the same post becomes the recap:
   photos, materials, certificates.
2. **Points instant, badges weekly, cups seasonal.** Points animate on the moment they are earned
   (`REQ-CHK-018` says what and when honestly); badges are milestones; the companies race is a
   quarterly cup with a reset so every company restarts with a real shot, plus an all-time hall of fame.
3. **Companies are houses.** Each company has a team colour (proposal in `01-tokens.md`) that rings
   every avatar and colours every poster and race bar. The company is never the avatar fill
   (`REQ-PRF-009`); it is the ring.
4. **Leaderboards never shame.** Top 10, your own row, and the person just above you. A row that drops
   gets no red and no shake. Leagues are a separate decision (see `06`).
5. **Stickers for joy, badges for status.** Die-cut stickers (rotated, thick bone rim) carry
   celebration: «+50 عند الحضور», «محجوز», «مستوى جديد». The lifecycle badge (`REQ-UIX-003`) keeps its
   fixed colour, icon and word on every surface and is never a sticker.
6. **Five orchestrated moments; everything else whispers.** Reservation, check-in, session completion,
   level-up, rank change. Reactions earn nothing and pop once (`REQ-EVT-004`, `REQ-UIX-024`). Failure
   never animates.
7. **App-like on the phone, no PWA.** Contextual bottom tab bar with the primary action built in
   (`REQ-UIX-002`), full-screen sheets, skeletons shaped like content, one fixed bottom bar per screen.
8. **Designers feel like Canva.** Templates first; layers, alignment and free placement available when
   wanted (`REQ-DSG-022`, `REQ-DSG-028`). Nothing in this direction changes the designer's model.

## Inherited non-negotiables (unchanged by this direction)

- RTL is the default rendering; logical properties only; directional icons mirror (`REQ-INT-001`,
  `REQ-INT-004`).
- Western numerals everywhere, no setting (`REQ-INT-006`, `DEC-124`).
- Mixed-script strings are bidi-isolated (`REQ-INT-007`).
- No icon library, ever: the hand-authored house set in `src/components/ui/icons.tsx` grows by hand
  (`04-components.md` lists the new glyphs).
- Radix primitives directly, no shadcn (`DEC-019`); Tailwind v4 with no config file, tokens as
  `@theme` blocks; the `@theme inline` block stays load-bearing for dark mode.
- Every control comes from `src/components/ui/`; every primitive has a jsdom test, an RTL check and a
  gallery entry (`REQ-UIX-001`).
- WCAG 2.2 AA; text 4.5:1, large text 3:1; colour never the only channel (`REQ-NFR-007`).
- Animation touches transform, opacity and filter only, 60 fps, no `will-change` left on
  (`REQ-UIX-020`); durations are tokens and collapse under reduced motion (`REQ-UIX-014`); no motion
  library is added.
- Skeletons, not spinners, at every route boundary (`REQ-UIX-005`); every action control keeps its
  label while pending (`REQ-UIX-007`).
- The frozen public routes do not move before M13 (`REQ-NFR-019`).

## What changes

- The visual language of the app: ground, accents, team colours, the display face, radii, the object
  and sticker vocabulary, the motion vocabulary. `16-ui-redesign.md` keeps its structural decisions
  (shell, tab bar, loading and error models, the form model, the affordance rule); its visual notes are
  superseded by this folder where the two disagree, **once the DEC entries in `06` are accepted**.
- The number of orchestrated moments (two → five) and the confetti ban (`REQ-UIX-018/019`).
- Template imagery rules for posters (`REQ-DSG-026`): the house 3D object set becomes an allowed
  optional layer; the rest of that rule stands.

## What does not change

- The data model. Stories, the race, the level card and the check-in celebration are all computed from
  tables that exist. The one schema addition this folder proposes is `story_views` (`05-stories.md`),
  and it is optional.
- The certificate look. Certificates keep their formal Naskh families (`REQ-DSG-026`); the playground
  stops at the certificate's edge.
- The marketing site, until M13 and a DEC entry decide what it becomes.

## The one thing to remember

If a screen reads as a spreadsheet with a lime button on it, the direction has been lost. Big numbers
in the display face, a team ring on every face, and one physical-feeling moment per screen are what
make it the playground.
