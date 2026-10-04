// The platform console's nav set — `components/platform/platform-nav.tsx`, SCR-080 … 085, REQ-UIX-118, DEC-249.
//
// ★ Rewritten in wave 26 with the file (`DEC-251` §2.9). The component this file used to test — a rail of its own and
// a phone section switcher — was deleted for `ui/admin-rail` on the console frame; the PATH was kept, and now holds
// the rail's second nav set. What is held here is what the old five cases held and still matters (the kept-behaviour
// table, `notes/platform.md` W26.2.0): the five sections in order, the current one read from the PATH, the home
// matched exactly, and nothing org-scoped in the list. The switcher's cases went with the switcher (ledger C2 – C4).
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/platform.json";

let pathname = "/ar/app/platform/orgs/new";
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => pathname,
}));

const { PLATFORM_NAV, platformRailGroups, platformSection } = await import("@/components/platform/platform-nav");
const { AdminRail } = await import("@/components/ui/admin-rail");

const label = (key: keyof typeof ar.platform.shell.nav) => ar.platform.shell.nav[key];

function renderRail(path: string) {
  pathname = path;
  // `ui/link` reads the locale; the rail itself takes every word as a prop.
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <AdminRail groups={platformRailGroups(label)} label={ar.platform.shell.brand} />
    </NextIntlClientProvider>,
  );
}

describe("platformSection", () => {
  it("matches the home exactly and every other section by prefix", () => {
    expect(platformSection("/ar/app/platform")).toBe("home");
    expect(platformSection("/ar/app/platform/")).toBe("home");
    expect(platformSection("/ar/app/platform/orgs")).toBe("orgs");
    expect(platformSection("/ar/app/platform/orgs/new")).toBe("orgs");
    expect(platformSection("/ar/app/platform/orgs/0b1c/domains")).toBe("orgs");
    expect(platformSection("/en/app/platform/impersonate")).toBe("impersonate");
    // A prefix that only LOOKS like a section is not one.
    expect(platformSection("/ar/app/platform/orgsx")).toBeNull();
    expect(platformSection("/ar/app/admin")).toBeNull();
  });
});

describe("the platform nav set, drawn by ui/admin-rail", () => {
  it("is one ruled group of plain data: strings and booleans, nothing a server component cannot pass", () => {
    const groups = platformRailGroups(label);
    expect(groups).toHaveLength(1);
    for (const link of groups[0]) for (const value of Object.values(link)) expect(["string", "boolean"]).toContain(typeof value);
  });

  it("lists the five sections in order and marks only the one the path is in", () => {
    renderRail("/ar/app/platform/orgs/new");
    const rail = screen.getByRole("navigation", { name: "لوحة المنصة" });
    const links = within(rail).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["لوحة المنصة", "المؤسسات", "مكتبة القوالب", "المؤشرات", "الدخول الاستثنائي"]);
    expect(within(rail).getByRole("link", { name: "المؤسسات" })).toHaveAttribute("aria-current", "page");
    expect(links.filter((l) => l.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("the home is current on its own path alone — it prefixes every other section", () => {
    renderRail("/ar/app/platform");
    const rail = screen.getByRole("navigation", { name: "لوحة المنصة" });
    expect(within(rail).getByRole("link", { name: "لوحة المنصة" })).toHaveAttribute("aria-current", "page");
    expect(within(rail).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("carries no org-scoped destination: a super admin has no org (DEC-014)", () => {
    for (const leaf of PLATFORM_NAV) expect(leaf.href.startsWith("/app/platform")).toBe(true);
  });

  it("has no accessibility violation axe can see", async () => {
    const { container } = renderRail("/ar/app/platform/metrics");
    const results = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
