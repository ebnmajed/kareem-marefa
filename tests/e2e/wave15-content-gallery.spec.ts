import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// wave 15 · content's captures (DEC-186 §9, contract 4): the fourteen primitives in
// the gallery, on both of the scope's grounds, at 390 px and at desktop width; the
// file drop's own states, which live in the control and not in props; and each new
// primitive's counterpart in the prototypes, for the lead to open beside it. The
// lead runs this against a build made with `KAREEM_GALLERY=1` — the gallery 404s
// otherwise (`proxy.ts`).
//
// A demo carries no scope of its own: `playground.tsx` renders it once under the
// dark scope and once under the light one. Each demo's root is
// `data-demo="<primitive>"`, so a capture is the demo's own box on one ground —
// never the whole gallery, whose length moves every time a demo is wired. A demo
// not yet wired is skipped, not failed.
//
// Captures land at `.qa-shots/rtl/wave15-content-<primitive>-<ground>-<width>.png`,
// honouring `E2E_SHOTS_DIR`.

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

const PRIMITIVES = [
  "tag-chip",
  "badge",
  "avatar",
  "card",
  "progress",
  "empty-state",
  "stat",
  "panel",
  "file-drop",
  "sticker",
  "poster",
  "reaction-bar",
  "progress-bar",
  "story-ring",
] as const;

// The scope's class is written in `ui/scope.tsx` alone; a test may select by it.
const GROUNDS = [
  { name: "dark", scope: ".theme-play:not(.theme-play-light)" },
  { name: "light", scope: ".theme-play.theme-play-light" },
] as const;

const WIDTHS = [
  { name: "390", size: { width: 390, height: 844 } },
  { name: "desktop", size: { width: 1280, height: 900 } },
] as const;

const demoOn = (primitive: string, scope: string) => `${scope} [data-demo="${primitive}"]`;

// The widths are set here, so one project is enough.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "one project takes both widths");
});

async function openGallery(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  const res = await page.goto("/ar/ui");
  expect(res?.status(), "the gallery needs KAREEM_GALLERY=1").toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

for (const primitive of PRIMITIVES) {
  for (const width of WIDTHS) {
    test(`${primitive} at ${width.name}`, async ({ page }) => {
      await openGallery(page, width.size);
      test.skip((await page.locator(`[data-demo="${primitive}"]`).count()) === 0, `${primitive}'s demo is not wired into the gallery yet`);

      // No sideways scroll at any width (one column, logical properties).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      for (const ground of GROUNDS) {
        const box = page.locator(demoOn(primitive, ground.scope));
        await expect(box).toHaveCount(1);
        await expect(box).toBeVisible();
        await box.scrollIntoViewIfNeeded();
        await box.screenshot({ path: join(SHOTS, `wave15-content-${primitive}-${ground.name}-${width.name}.png`), animations: "disabled" });
      }
    });
  }
}

// The file drop's picked, refused and drag-over states live in the control, not in props: the
// demo cannot set them, so a real file is dropped on the first zone here.
for (const width of WIDTHS) {
  test(`file-drop's picked and refused files at ${width.name}`, async ({ page }) => {
    await openGallery(page, width.size);
    test.skip((await page.locator('[data-demo="file-drop"]').count()) === 0, "file-drop's demo is not wired into the gallery yet");
    for (const ground of GROUNDS) {
      const demo = page.locator(demoOn("file-drop", ground.scope));
      // Hidden by design (`file-drop.tsx`); Playwright can still hand it files.
      await demo.locator('input[name="demo-material"]').setInputFiles([
        { name: "الدرس-الأول.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") },
        { name: "عرض.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: Buffer.from("x") },
      ]);
      await expect(demo.getByText("الدرس-الأول.pdf")).toBeVisible();
      await expect(demo.getByText("عرض.pptx")).toBeVisible();
      await demo.scrollIntoViewIfNeeded();
      await demo.screenshot({ path: join(SHOTS, `wave15-content-file-drop-picked-${ground.name}-${width.name}.png`), animations: "disabled" });
    }
  });
}

test("file-drop's drag-over state, on both grounds", async ({ page }) => {
  await openGallery(page, WIDTHS[0].size);
  test.skip((await page.locator('[data-demo="file-drop"]').count()) === 0, "file-drop's demo is not wired into the gallery yet");
  for (const ground of GROUNDS) {
    const demo = page.locator(demoOn("file-drop", ground.scope));
    const zone = demo.locator("div.border-dashed").first();
    await zone.scrollIntoViewIfNeeded();
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await zone.dispatchEvent("dragover", { dataTransfer });
    await zone.screenshot({ path: join(SHOTS, `wave15-content-file-drop-dragover-${ground.name}-390.png`), animations: "disabled" });
    await zone.dispatchEvent("dragleave", { dataTransfer });
  }
});

// ★ The lead's gallery review at 390 px: a poster's title was clipped mid-glyph when the poster was
// small. The fix hides no line at all (poster.tsx says why a clamp cannot be safe for Arabic), so
// «no partial line» is measured as: NOTHING between the title and the page clips, and every row
// is inside the box. On every placeholder, both grounds, both widths:
//   · the title, the meta line, the placeholder and its box clip nothing (`overflow: visible`);
//   · the title's height is a whole number of its line heights, and it has at least one;
//   · its line height is 1.4 × its size (never the display scale's 1.15);
//   · the rows are in order — top row, title, meta line — and the meta line ends inside the box;
//   · the box is 4:5 at least: it may grow for a long title, never shrink.
// `scrollHeight` is not used: Arabic ink overflows its line box by design and Chrome counts that
// as scrollable height even where nothing clips.
for (const width of WIDTHS) {
  test(`poster: every title line is whole, and the meta line too, at ${width.name}`, async ({ page }) => {
    await openGallery(page, width.size);
    test.skip((await page.locator('[data-demo="poster"]').count()) === 0, "poster's demo is not wired into the gallery yet");
    for (const ground of GROUNDS) {
      const results = await page.locator(demoOn("poster", ground.scope)).evaluate((demo) =>
        [...demo.querySelectorAll<HTMLElement>('[data-slot="poster-placeholder"]')].map((ph) => {
          const title = ph.querySelector<HTMLElement>('[data-slot="poster-title"]')!;
          const meta = ph.querySelector<HTMLElement>('[data-slot="poster-meta"]')!;
          const top = ph.firstElementChild as HTMLElement;
          const media = ph.closest('[data-slot="media"]') as HTMLElement;
          const box = media.getBoundingClientRect();
          const cs = getComputedStyle(title);
          const lh = parseFloat(cs.lineHeight);
          const r = (el: HTMLElement) => el.getBoundingClientRect();
          const clips = [title, meta, ph, media].filter((el) => !/^visible$/.test(getComputedStyle(el).overflowY)).map((el) => el.dataset.slot);
          return {
            text: title.textContent?.slice(0, 24),
            width: Math.round(box.width),
            lines: r(title).height / lh,
            ratio: lh / parseFloat(cs.fontSize),
            clips,
            topAboveTitle: r(top).bottom <= r(title).top + 0.5,
            titleAboveMeta: r(title).bottom <= r(meta).top + 0.5,
            metaInside: r(meta).bottom <= box.bottom + 0.5,
            atLeast45: box.height >= 1.25 * box.width - 1,
          };
        }),
      );
      expect(results.length, `${ground.name}: the demo draws its placeholders`).toBeGreaterThan(0);
      for (const p of results) {
        const where = `${ground.name} · ${p.width}px · «${p.text}»`;
        expect(p.clips, `${where}: something between the title and the page clips`).toEqual([]);
        expect(Math.abs(p.lines - Math.round(p.lines)), `${where}: ${p.lines.toFixed(3)} lines — a partial line`).toBeLessThan(0.02);
        expect(Math.round(p.lines), `${where}: no line at all`).toBeGreaterThanOrEqual(1);
        expect(p.ratio, `${where}: line height is not 1.4 × the size`).toBeCloseTo(1.4, 2);
        expect(p.topAboveTitle, `${where}: the top row overlaps the title`).toBe(true);
        expect(p.titleAboveMeta, `${where}: the title overlaps the meta line`).toBe(true);
        expect(p.metaInside, `${where}: the meta line falls outside the poster`).toBe(true);
        expect(p.atLeast45, `${where}: the box is shorter than 4:5`).toBe(true);
      }
    }
  });
}

// ★ The card's focus ring, inside the scope (the lead's two reviews). The article is `overflow:
// hidden` and its link fills it: an outline outside the link is clipped whole, and one pulled
// inside it is COVERED by `CardMedia`, a positioned child — geometry passed while the top and both
// sides of the media showed no ring. So the ring is the link's `::after`, above the media, and
// this measures what can be SEEN: the link is reached by Tab and matches `:focus-visible`, then the
// card's own box is captured and pixels are sampled just inside each edge — the top, the bottom,
// both sides at the media's height and at the body's — each must be the colour the scope computes
// for `--ring` (no hex is named here). Exactly one ring: the article draws none, and the link's own
// outline lies outside the article's clip.
for (const width of WIDTHS) {
  test(`card: a linked card's focus ring can be seen on all four sides, reached by Tab, at ${width.name}`, async ({ page }) => {
    await openGallery(page, width.size);
    test.skip((await page.locator('[data-demo="card"]').count()) === 0, "card's demo is not wired into the gallery yet");
    for (const ground of GROUNDS) {
      const demo = page.locator(demoOn("card", ground.scope));
      // The first linked card with media — the case the covered ring hid.
      const article = demo.locator("article:has(> a [data-slot=media])").first();
      const link = article.locator(":scope > a");
      await article.scrollIntoViewIfNeeded();
      // Start just before the card: focus the demo's root for the moment, then Tab once.
      await demo.evaluate((el) => {
        el.setAttribute("tabindex", "-1");
        (el as HTMLElement).focus();
      });
      await page.keyboard.press("Tab");
      await demo.evaluate((el) => el.removeAttribute("tabindex"));
      await expect(link).toBeFocused();

      const facts = await link.evaluate((a) => {
        const art = a.closest("article")!;
        const ar = art.getBoundingClientRect();
        const cs = getComputedStyle(a);
        const after = getComputedStyle(a, "::after");
        const lr = a.getBoundingClientRect();
        const reach = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
        const media = a.querySelector<HTMLElement>("[data-slot=media]")!.getBoundingClientRect();
        const body = a.querySelector<HTMLElement>("[data-slot=body]")!.getBoundingClientRect();
        return {
          focusVisible: a.matches(":focus-visible"),
          ring: getComputedStyle(a.closest(".theme-play")!).getPropertyValue("--ring").trim(),
          afterWidth: after.borderTopWidth,
          articleOutline: getComputedStyle(art).outlineStyle,
          linkOwnOutsideClip: reach > 0 && lr.top - reach < ar.top,
          // Sample rows, relative to the captured article box.
          mediaY: (media.top + media.bottom) / 2 - ar.top,
          bodyY: (body.top + body.bottom) / 2 - ar.top,
        };
      });
      const where = `${ground.name} · ${width.name}`;
      expect(facts.focusVisible, `${where}: the link is not :focus-visible after Tab`).toBe(true);
      expect(facts.afterWidth, `${where}: no ring is drawn above the media`).not.toBe("0px");
      expect(facts.articleOutline, `${where}: a second ring, on the article`).toBe("none");
      expect(facts.linkOwnOutsideClip, `${where}: the link's own outline is inside the clip — a second ring`).toBe(true);
      expect(facts.ring, `${where}: the scope computes no --ring`).toMatch(/^#[0-9a-f]{6}$/i);

      const shot = await article.screenshot({ path: join(SHOTS, `wave15-content-card-focus-${ground.name}-${width.name}.png`) });
      const seen = await page.evaluate(
        async ({ b64, ring, mediaY, bodyY }) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const canvas = new OffscreenCanvas(img.width, img.height);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, img.width, img.height).data;
          // The capture is at the device's pixel ratio; the rows arrive in CSS pixels.
          const k = window.devicePixelRatio || 1;
          const [R, G, B] = [1, 3, 5].map((i) => parseInt(ring.slice(i, i + 2), 16));
          const hit = (x: number, y: number) => {
            const i = (Math.round(y) * img.width + Math.round(x)) * 4;
            return Math.abs(data[i]! - R) < 40 && Math.abs(data[i + 1]! - G) < 40 && Math.abs(data[i + 2]! - B) < 40;
          };
          const W = img.width, H = img.height, N = Math.ceil(7 * k);
          const any = (pts: [number, number][]) => pts.some(([x, y]) => hit(x, y));
          const inFromTop = (x: number) => Array.from({ length: N }, (_, n) => [x, n] as [number, number]);
          const inFromBottom = (x: number) => Array.from({ length: N }, (_, n) => [x, H - 1 - n] as [number, number]);
          const inFromLeft = (y: number) => Array.from({ length: N }, (_, n) => [n, y] as [number, number]);
          const inFromRight = (y: number) => Array.from({ length: N }, (_, n) => [W - 1 - n, y] as [number, number]);
          return {
            top: any(inFromTop(W / 2)),
            bottom: any(inFromBottom(W / 2)),
            leftAtMedia: any(inFromLeft(mediaY * k)),
            rightAtMedia: any(inFromRight(mediaY * k)),
            leftAtBody: any(inFromLeft(bodyY * k)),
            rightAtBody: any(inFromRight(bodyY * k)),
          };
        },
        { b64: shot.toString("base64"), ring: facts.ring, mediaY: facts.mediaY, bodyY: facts.bodyY },
      );
      expect(seen, `${where}: the ring cannot be seen on every side`).toEqual({
        top: true,
        bottom: true,
        leftAtMedia: true,
        rightAtMedia: true,
        leftAtBody: true,
        rightAtBody: true,
      });
      await page.keyboard.press("Shift+Tab");
    }
  });
}

// The story ring's demo shows all four states — REQ-UIX-040 is about telling them apart, so a
// capture that scrolls two of them out of the box proves nothing (the lead's review at 390 px).
// Every ring lies inside the demo's box, and all four states are there, on both grounds.
for (const width of WIDTHS) {
  test(`story-ring: every ring of the demo is inside its box, all four states, at ${width.name}`, async ({ page }) => {
    await openGallery(page, width.size);
    test.skip((await page.locator('[data-demo="story-ring"]').count()) === 0, "story-ring's demo is not wired into the gallery yet");
    for (const ground of GROUNDS) {
      const found = await page.locator(demoOn("story-ring", ground.scope)).evaluate((demo) => {
        const box = demo.getBoundingClientRect();
        return [...demo.querySelectorAll<HTMLElement>("button[data-state]")].map((ring) => {
          const r = ring.getBoundingClientRect();
          return {
            state: ring.dataset.state!,
            inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5,
          };
        });
      });
      const where = `${ground.name} · ${width.name}`;
      expect(found.length, `${where}: the demo draws its rings`).toBeGreaterThan(0);
      for (const ring of found) expect(ring.inside, `${where}: a «${ring.state}» ring is outside the demo's box`).toBe(true);
      expect(new Set(found.map((r) => r.state)), `${where}: a state is missing`).toEqual(new Set(["live", "upcoming", "recap", "seen"]));
    }
  });
}

test("every primitive's demo is in both grounds, once each", async ({ page }) => {
  await openGallery(page, WIDTHS[1].size);
  for (const primitive of PRIMITIVES) {
    const count = await page.locator(`[data-demo="${primitive}"]`).count();
    // 0 while the lead has not wired it; once wired, exactly one per ground.
    expect([0, GROUNDS.length], primitive).toContain(count);
  }
});

// ── The prototypes, for the side-by-side (DEC-183 rule 4: behaviour references, never code). ──
// Opened from disk; their Google Fonts `<link>` is the prototype's own and may not load here,
// which changes the face and nothing about hierarchy, spacing or shape — the bar the README sets.

const PROTOTYPES = resolve(process.cwd(), "docs/design/prototypes");

const COUNTERPARTS = [
  { file: "motion-story.html", selector: "#stories", name: "story-ring" },
  { file: "motion-story.html", selector: "#card", name: "poster-sticker-reaction-bar" },
  { file: "motion-story.html", selector: "#race", name: "progress-bar" },
  { file: "stories.html", selector: "#rings", name: "story-ring" },
  { file: "stories.html", selector: ".feed .card", name: "poster" },
] as const;

for (const c of COUNTERPARTS) {
  test(`prototype counterpart — ${c.file} ${c.name}`, async ({ page }) => {
    // Wide enough that the prototype's phone is drawn at 1:1 (its stage scales it to fit).
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(pathToFileURL(join(PROTOTYPES, c.file)).href);
    // motion-story plays itself; stop it on its first scene, the one these elements are drawn on.
    const auto = page.locator("#btnAuto");
    if ((await auto.count()) && (await auto.getAttribute("aria-pressed")) === "true") await auto.click();
    const el = page.locator(c.selector).first();
    await expect(el).toBeVisible();
    const stem = c.file.replace(/\.html$/, "");
    await el.screenshot({ path: join(SHOTS, `wave15-content-prototype-${stem}-${c.name}.png`), animations: "disabled" });
  });
}
