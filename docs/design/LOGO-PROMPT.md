Brand update for كريم معرفة — the mark replaces the written wordmark everywhere, with its motion.
Read-first: `docs/design/assets/brand/logo/README.md`, `docs/design/prototypes/logo-motion.html`,
`DEC-203` (fonts), `DEC-201` (the brand kit feeds output, not the app), `REQ-UIX-053`, `DEC-195`
(the five moments), `REQ-NFR-019` (the public contract) and the tests that guard it.

Do, as one wave (two PRs — A app + console, B public + assets), each story with its `REQ-*`:
1. Add `assets/brand/logo/logo.svg` to `public/brand/` and a `<Logo size>` component that inlines
   it (attribute strokes, `pathLength="1"`, `aria-label="كريم معرفة"`); no `<img>` — the motion
   needs the paths in the DOM.
2. Replace the wordmark text with `<Logo>` in: the app top bar (36 px), sign-in / choose-org /
   no-access (66 px), the console bar and the platform bar (30 px), the public card, verify,
   register and the landing header (33 px). Delete the wordmark SVG/PNG assets and `wordmark-*`
   references; keep the name as text only inside sentences.
3. Brand kit defaults: the mark is the default logo for posters, certificates and the email header
   (`DEC-201`); an org that uploads its own logo overrides it as before.
4. Regenerate `icons/icon-{32,180,192,512}.png` and `/og.png` from the mark (the pack has them);
   the favicon too. `/og.png` is a frozen public URL — same URL, new image, re-baselined visual
   diff in the same commit as the `DEC`.
5. Motion, from the prototype's CSS, as `logo-motion.css` under `PlayScope` only: **reveal** on
   sign-in and cold start (once per session, never on navigation), **loading** as the app's single
   wait indicator replacing spinners and bare skeletons over 400 ms, **tap** on the home control.
   `prefers-reduced-motion` → static. The console and the public pages get the static mark
   (`REQ-UIX-053`); the public landing may use the reveal once, since it is not under the test.
6. Tests: the mark renders in every surface listed in 2; reduced-motion disables all three; the
   public-graph test and the accessibility floor pass; the OG re-baseline is in the commit.
7. Log it: one `DEC` — the mark replaces the wordmark; the motion vocabulary (reveal · loading ·
   tap) and where each may run; the OG re-baseline.
