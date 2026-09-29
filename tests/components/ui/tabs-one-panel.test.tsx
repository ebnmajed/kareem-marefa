// ★ wave 16 (scoring's finding, DEC-197): a tab switch must not mount the new content inside the OUTGOING
// panel. Radix keeps the outgoing `Tabs.Content` for a commit; with the same `children` in every panel, the
// new screen mounted first inside the inactive panel, claimed moment 5's occurrence and vanished — and the
// real board found it claimed. Children render in the active panel only.
import { render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/components/ui/tabs";

const ITEMS = [
  { value: "month", label: "هذا الشهر" },
  { value: "all", label: "كل الأوقات" },
];

function Probe({ log, name }: { log: string[]; name: string }) {
  useEffect(() => {
    const el = document.querySelector(`[data-probe="${name}"]`);
    const panel = el?.closest("[role='tabpanel']");
    log.push(`${name}@${panel?.getAttribute("data-state") ?? "none"}`);
  }, [log, name]);
  return <p data-probe={name}>{name}</p>;
}

describe("Tabs — the content mounts in the active panel only", () => {
  it("★ a controlled switch never mounts the new content inside the outgoing panel", () => {
    const log: string[] = [];
    const { rerender } = render(
      <Tabs label="اللوحات" items={ITEMS} value="month">
        <Probe key="month" log={log} name="month" />
      </Tabs>,
    );
    rerender(
      <Tabs label="اللوحات" items={ITEMS} value="all">
        <Probe key="all" log={log} name="all" />
      </Tabs>,
    );
    expect(log.filter((l) => l.startsWith("all@"))).toEqual(["all@active"]);
    expect(document.querySelectorAll("[data-probe]")).toHaveLength(1);
  });

  it("an uncontrolled strip still shows its content under the default tab", () => {
    const { getByText } = render(
      <Tabs label="اللوحات" items={ITEMS} defaultValue="month">
        <p>المحتوى</p>
      </Tabs>,
    );
    expect(getByText("المحتوى").closest("[role='tabpanel']")?.getAttribute("data-state")).toBe("active");
  });
});
