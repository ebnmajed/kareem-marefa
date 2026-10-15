// ★ The capture's controls are ON SCREEN on a short phone (the owner's report of 2026-10-14: «there weren't any
// [controls]»; REQ-STO-011, DEC-093). The gallery's `story-capture` demo — no session, no camera — opened at 390 × 844
// and at 390 × 664 (an iPhone with Safari's toolbar showing). For close and each of the three choices (DEC-295), and the
// review's two buttons: visible, inside the viewport, and the TOPMOST element at its centre, so nothing — the take, a
// toolbar, the frame — sits over it. Chromium here; WebKit in
// `story-media-capture-layout-webkit.spec.ts` (local runs, or CI with `E2E_WEBKIT=1`).
//
// Run: `npx playwright test tests/e2e/story-media-capture-layout.spec.ts` (the stub serves the gallery: KAREEM_GALLERY=1).
// Captures: `.qa-shots/rtl/story-capture-<engine>-<state>-<w>x<h>.png`, honouring `E2E_SHOTS_DIR`.
import { test } from "@playwright/test";
import { suite } from "./story-media-layout";

test.skip(({ browserName }) => browserName !== "chromium");
suite("chromium");
