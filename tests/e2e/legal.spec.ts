// SCR-005 · /legal/privacy and /legal/terms — REQ-NFR-015, 12 §6, OQ-026.
//
// ★ NO SESSION ANYWHERE IN THIS FILE, and that is the point: a privacy policy
// that requires signing in to read is not a privacy policy. These pages are
// two of the three public platform routes (DEC-051 decision 3), and the
// assertions below are about what the text SAYS, because with a legal page the
// wording is the requirement.
import { expect, test, type Page } from "@playwright/test";

// DEC-051: while the platform is unconfigured (production until Launch)
// /legal/* is a 404 like every other platform route; the unconfigured spec
// asserts that, and these cases wait for a configured build.
test.skip(process.env.E2E_PLATFORM_UNCONFIGURED === "1", "the legal pages are 404 by design on the unconfigured build (DEC-051)");

const PHONE = { width: 390, height: 844 };

async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });
  // The sideways check is phone-only: a desktop context at 390 px carries a
  // 12 px scrollbar a mobile one does not (TEAM.md §5).
  if (project !== "phone") return;
  const sideways = await p.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return null;
    let worst = "";
    let worstWidth = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const box = el.getBoundingClientRect();
      if (box.width <= window.innerWidth) continue;
      let contained = false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === "auto" || ox === "scroll") {
          contained = true;
          break;
        }
      }
      if (!contained && box.width > worstWidth) {
        worstWidth = box.width;
        worst = `${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px`;
      }
    }
    return `${document.documentElement.scrollWidth}px wide, viewport ${window.innerWidth}px; widest: ${worst || "(none outside a scroller)"}`;
  });
  expect(sideways, `${name} must not scroll sideways at 390 px`).toBeNull();
}

test("★ REQ-NFR-015: /legal/privacy is readable with no session at all", async ({ page }) => {
  const response = await page.goto("/ar/legal/privacy");
  expect(response!.status()).toBe(200);
  expect(page.url(), "a stranger is never sent to sign in").not.toContain("sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/سياسة الخصوصية/);
});

test("★ OQ-026: the region is recorded as a fact to revisit, not as a compliance conclusion", async ({ page }) => {
  await page.goto("/ar/legal/privacy");
  const text = await page.locator("body").innerText();
  // The fact.
  expect(text).toContain("ap-southeast-1");
  // ★ And the sentence that keeps it from being a claim. 12 §6.1 is explicit:
  // the plan does not conclude compliance in either direction, because that is
  // a legal determination and not an architectural one.
  expect(text).toContain("لم تخلص");
  expect(text, "no page may assert compliance on the platform's behalf").not.toMatch(/نلتزم بجميع|مطابق تمامًا/);
});

test("REQ-PRF-007: the policy says no to self-service deletion and says why", async ({ page }) => {
  await page.goto("/ar/legal/privacy");
  const text = await page.locator("body").innerText();
  expect(text).toContain("عضو سابق");
  expect(text, "the erasure section explains rather than only refusing").toContain("لا يوجد حذف ذاتي فوري");
});

test("REQ-NFR-012: every retained class on the page has a stated period", async ({ page }) => {
  await page.goto("/ar/legal/privacy");
  const text = await page.locator("body").innerText();
  for (const phrase of ["سبع سنوات", "تسعون يومًا", "مئة وثمانون يومًا", "عمر المؤسسة", "سبعة أيام"]) {
    expect(text, `the retention section states "${phrase}"`).toContain(phrase);
  }
});

test("/legal/terms is public too, and names the SVG refusal", async ({ page }) => {
  const response = await page.goto("/ar/legal/terms");
  expect(response!.status()).toBe(200);
  const text = await page.locator("body").innerText();
  expect(text).toContain("SVG");
});

test.describe("390 px RTL review", () => {
  test.use({ viewport: PHONE });

  test("both legal pages are captured and neither scrolls sideways", async ({ page }) => {
    await page.goto("/ar/legal/privacy");
    await review(page, "scr-005-legal-privacy");
    await page.goto("/ar/legal/terms");
    await review(page, "scr-005-legal-terms");
  });
});
