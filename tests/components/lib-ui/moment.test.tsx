import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimMoment, isMomentClaimed, momentKey, resetMomentsForTests, useMoment, type MomentKind } from "@/lib/ui/moment";
import { setReducedMotion } from "./motion-env";

// ★★ REQ-UIX-044, DEC-195 §2.7: mount, play, unmount, mount again — silence.

function Probe({ kind = "reservation", id }: { kind?: MomentKind; id: string | null }) {
  const { phase } = useMoment(kind, id);
  return <p data-testid="phase">{phase}</p>;
}

const phase = () => screen.getByTestId("phase").textContent;

beforeEach(() => {
  resetMomentsForTests();
  setReducedMotion(false);
});
afterEach(() => vi.unstubAllGlobals());

describe("useMoment — once per occurrence", () => {
  it("plays the first time an occurrence is seen", () => {
    render(<Probe id="r1" />);
    expect(phase()).toBe("playing");
  });

  it("★ does not play again after an unmount and a mount with the same occurrence", () => {
    const first = render(<Probe id="r1" />);
    expect(phase()).toBe("playing");
    first.unmount();
    render(<Probe id="r1" />);
    expect(phase()).toBe("static");
  });

  it("does not play again on a re-render with the same occurrence", () => {
    const { rerender } = render(<Probe id="r1" />);
    rerender(<Probe id="r1" />);
    expect(phase()).toBe("playing");
    rerender(<Probe id={null} />);
    rerender(<Probe id="r1" />);
    expect(phase()).toBe("static");
  });

  it("★ plays under StrictMode, which runs every effect twice on one instance — and a real remount after it is silent", () => {
    const strict = render(
      <StrictMode>
        <Probe id="r1" />
      </StrictMode>,
    );
    expect(phase()).toBe("playing");
    strict.unmount();
    render(<Probe id="r1" />);
    expect(phase()).toBe("static");
  });

  it("a finished moment returns to the static state and does not restart on a re-render", () => {
    function Done({ id }: { id: string }) {
      const m = useMoment("level", id);
      return (
        <button data-testid="phase" onClick={m.done}>
          {m.phase}
        </button>
      );
    }
    const { rerender } = render(<Done id="l1" />);
    expect(phase()).toBe("playing");
    act(() => screen.getByTestId("phase").click());
    expect(phase()).toBe("static");
    rerender(<Done id="l1" />);
    expect(phase()).toBe("static");
  });

  it("a new occurrence plays even after another has", () => {
    const a = render(<Probe id="r1" />);
    a.unmount();
    render(<Probe id="r2" />);
    expect(phase()).toBe("playing");
  });

  it("the same id under another kind is another occurrence", () => {
    const a = render(<Probe kind="reservation" id="x" />);
    a.unmount();
    render(<Probe kind="check-in" id="x" />);
    expect(phase()).toBe("playing");
  });

  it("no occurrence — a later visit, a reload, another phone — is the static state", () => {
    render(<Probe id={null} />);
    expect(phase()).toBe("static");
  });

  it("★ under reduced motion it renders the static state, and the occurrence is still claimed", () => {
    setReducedMotion(true);
    render(<Probe id="r1" />);
    expect(phase()).toBe("static");
    expect(isMomentClaimed(momentKey("reservation", "r1"))).toBe(true);
  });

  it("★ a reload in the same tab does not replay: the claim survives in sessionStorage", async () => {
    expect(claimMoment("reservation:r9")).toBe(true);
    vi.resetModules();
    const fresh = await import("@/lib/ui/moment");
    expect(fresh.claimMoment("reservation:r9")).toBe(false);
  });

  it("still holds for the page's life when storage is refused", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(claimMoment("check-in:c1")).toBe(true);
    expect(claimMoment("check-in:c1")).toBe(false);
  });
});

// ★ scoring's finding (DEC-197): a hard load paints the truth before React
// runs. A moment born from that HTML must not snap back and play — it stays
// static and leaves the occurrence unseen, so a later client arrival plays it.
describe("useMoment — a page the server painted", () => {
  it("★ a hydrated mount stays static and does not claim; the next client mount plays", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const html = renderToString(<Probe kind="completion" id="e1" />);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const { act } = await import("react");
    let root!: import("react-dom/client").Root;
    await act(async () => {
      root = hydrateRoot(host, <Probe kind="completion" id="e1" />);
    });
    expect(host.textContent).toBe("static");
    expect(isMomentClaimed(momentKey("completion", "e1"))).toBe(false);
    await act(async () => root.unmount());
    host.remove();

    render(<Probe kind="completion" id="e1" />);
    expect(phase()).toBe("playing");
  });
});
