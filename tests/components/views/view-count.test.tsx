// «👁 N» — REQ-VEW-003, REQ-VEW-004, DEC-297 (views.md §8.3). Never at 0; Western digits in <bdi>; the accessible name
// in its plural form; the number alone for a member who may not list; a button that opens who viewed — name, avatar and
// the day, newest first — for the subject's owners and staff.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import views from "@/messages/ar/views.json";
import { ViewCount } from "@/components/views/view-count";
import { resetViews } from "@/components/views/tracker";
import { ViewSubject } from "@/components/views/view-subject";

function show(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar" messages={views}>
      {node}
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ViewCount", () => {
  it("draws nothing at 0, or with no count", () => {
    const { container, rerender } = show(<ViewCount kind="post" id="p" views={{ count: 0, canList: true }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <NextIntlClientProvider locale="ar" messages={views}>
        <ViewCount kind="post" id="p" views={null} />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [1, "شاهده عضو واحد"],
    [2, "شاهده عضوان"],
    [3, "شاهده 3 أعضاء"],
    [11, "شاهده 11 عضوًا"],
    [100, "شاهده 100 عضو"],
  ])("%i — the number in <bdi>, Western digits, and the plural name «%s»", (count, name) => {
    show(<ViewCount kind="post" id="p" views={{ count, canList: false }} />);
    const chip = screen.getByRole("img", { name });
    expect(chip.querySelector("bdi")).toHaveTextContent(String(count));
  });

  it("a member who may not list sees the number and nothing to press", () => {
    show(<ViewCount kind="recap" id="r" views={{ count: 4, canList: false }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("an owner or staff opens who viewed: avatar, name and the day — nothing finer — newest first, and how many more", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          viewers: [
            { memberId: "m2", name: "ريم الشهري", avatarHref: null, day: "2026-10-15" },
            { memberId: "m1", name: "فهد العنزي", avatarHref: "/api/avatars/m1?v=1", day: "2026-10-14" },
          ],
          total: 5,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    show(<ViewCount kind="announcement" id="a1" views={{ count: 5, canList: true }} />);
    await user.click(screen.getByRole("button", { name: "شاهده 5 أعضاء" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/views/announcement/a1", expect.objectContaining({ cache: "no-store" }));
    const sheet = await screen.findByRole("dialog", { name: "شاهدوه" });
    await waitFor(() => expect(sheet.querySelectorAll("[data-viewer-list] li")).toHaveLength(2));
    const rows = [...sheet.querySelectorAll("[data-viewer-list] li")].map((li) => li.textContent);
    expect(rows[0]).toContain("ريم الشهري");
    expect(rows[0]).toContain("15 أكتوبر");
    expect(rows[1]).toContain("فهد العنزي");
    expect(rows.join(" ")).not.toMatch(/\d{1,2}:\d{2}/);
    expect(sheet).toHaveTextContent("و3 أعضاء آخرين");
  });

  it("a list that fails says «تعذّر»", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const user = userEvent.setup();
    show(<ViewCount kind="frame" id="f" views={{ count: 2, canList: true }} />);
    await user.click(screen.getByRole("button", { name: "شاهده عضوان" }));
    expect(await screen.findByRole("status")).toHaveTextContent("تعذّر");
  });

  it("tells its caller when the list opens and closes (the story holds its clock)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ viewers: [], total: 0 }), { status: 200 })));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    show(<ViewCount kind="frame" id="f" views={{ count: 1, canList: true }} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "شاهده عضو واحد" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe("ViewSubject", () => {
  it("registers its block with the tracker while mounted, and lets go on unmount", () => {
    const observe = vi.fn();
    const unobserve = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        unobserve = unobserve;
        disconnect() {}
      },
    );
    const { unmount, container } = render(
      <ViewSubject kind="post" id="p9">
        <article>post</article>
      </ViewSubject>,
    );
    const block = container.querySelector("[data-view-subject='post']")!;
    expect(block.querySelector("article")).not.toBeNull();
    expect(observe).toHaveBeenCalledWith(block);
    unmount();
    expect(unobserve).toHaveBeenCalledWith(block);
    resetViews();
  });
});
