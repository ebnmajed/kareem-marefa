// `<Stepper>` inside the playground's scope — REQ-UIX-064. Born inside it: semantic names only, logical
// properties only, no motion and no hover, and the reading order follows the document's direction.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Stepper } from "@/components/ui/stepper";

// The code, not its comments — the header explains what it does not do, in the words this test looks for.
const SOURCE = readFileSync(join(process.cwd(), "src/components/ui/stepper.tsx"), "utf8").replace(/\/\/.*$/gm, "");

function scoped(dir: "rtl" | "ltr" = "rtl") {
  return render(
    <div className="theme-play" dir={dir}>
      <Stepper
        label="مراحل المقترح"
        doneLabel="مكتملة"
        steps={[
          { id: "a", label: "أُرسل", status: "done" },
          { id: "b", label: "قيد المراجعة", status: "current" },
          { id: "c", label: "معتمد", status: "upcoming" },
        ]}
        currentTone="accent"
      />
    </div>,
  );
}

describe("Stepper inside the scope", () => {
  it("reads semantic names only — no hex, no raw palette, no literal duration", () => {
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/(?:bg|text|border)-(?:navy|silver|lime|white|black|red|green|blue|gray|slate)-?\d*/);
    expect(SOURCE).not.toMatch(/\d+ms\b|duration-\d/);
  });

  it("no motion, no hover, no clipping, no physical direction", () => {
    expect(SOURCE).not.toMatch(/animate-|transition|hover:|overflow-hidden|\b(?:ml|mr|pl|pr|left|right)-\d/);
  });

  it("RTL and LTR: the first step is first in the DOM, so it stands at the start of the line in both", () => {
    for (const dir of ["rtl", "ltr"] as const) {
      const { container, unmount } = scoped(dir);
      const list = container.querySelector("ol") as HTMLElement;
      expect(list.firstElementChild).toHaveTextContent("أُرسل");
      expect(list.className).not.toMatch(/flex-row-reverse/);
      unmount();
    }
  });

  it("is accessible inside the scope", async () => {
    const { container } = scoped();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
