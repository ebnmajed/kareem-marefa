// The view tracker — REQ-VEW-001, REQ-VEW-006, DEC-297 (views.md §8.1). A mocked IntersectionObserver and fake timers:
// half on screen for a full second, while the page is visible, counts once per page life; the queue leaves every 4 s
// in batches of at most 50, through a beacon when the page is hidden; a failure is retried once, then dropped.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIEW_DWELL_MS, VIEW_FLUSH_MS, flushViews, markCompleted, markShown, observeSubject, resetViews } from "@/components/views/tracker";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observerCallback: Callback | null = null;
const observed = new Set<Element>();
class FakeObserver {
  constructor(cb: Callback) {
    observerCallback = cb;
  }
  observe(el: Element) {
    observed.add(el);
  }
  unobserve(el: Element) {
    observed.delete(el);
  }
  disconnect() {
    observed.clear();
  }
}

function show(el: Element, ratio: number) {
  observerCallback?.([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }]);
}

let visibility: DocumentVisibilityState = "visible";
const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
const beacon = vi.fn(() => true);

function sentBodies(): { kind: string; id: string; completed?: true }[][] {
  return fetchMock.mock.calls.map((c) => (JSON.parse((c as unknown as [string, { body: string }])[1].body) as { views: { kind: string; id: string; completed?: true }[] }).views);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  visibility = "visible";
});

afterEach(() => {
  resetViews();
  fetchMock.mockClear();
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
  beacon.mockClear();
  beacon.mockImplementation(() => true);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const el = () => document.createElement("div");

describe("a view is half the subject on screen for a full second (REQ-VEW-001)", () => {
  it("49 % never counts", async () => {
    const a = el();
    observeSubject(a, { kind: "post", id: "p1" });
    show(a, 0.49);
    await vi.advanceTimersByTimeAsync(VIEW_DWELL_MS + VIEW_FLUSH_MS + 100);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("50 % for 999 ms does not count; for a full second it does", async () => {
    const a = el();
    observeSubject(a, { kind: "post", id: "p1" });
    show(a, 0.5);
    await vi.advanceTimersByTimeAsync(VIEW_DWELL_MS - 1);
    show(a, 0);
    await vi.advanceTimersByTimeAsync(VIEW_FLUSH_MS + 100);
    expect(fetchMock).not.toHaveBeenCalled();
    show(a, 0.6);
    await vi.advanceTimersByTimeAsync(VIEW_DWELL_MS);
    await vi.advanceTimersByTimeAsync(VIEW_FLUSH_MS);
    expect(sentBodies()).toEqual([[{ kind: "post", id: "p1" }]]);
  });

  it("once per subject per page life — scrolling back does not count it again", async () => {
    const a = el();
    observeSubject(a, { kind: "recap", id: "r1" });
    for (let i = 0; i < 3; i++) {
      show(a, 1);
      await vi.advanceTimersByTimeAsync(VIEW_DWELL_MS + 10);
      show(a, 0);
    }
    await vi.advanceTimersByTimeAsync(VIEW_FLUSH_MS);
    expect(sentBodies().flat()).toEqual([{ kind: "recap", id: "r1" }]);
  });

  it("a hidden page counts nothing", async () => {
    const a = el();
    observeSubject(a, { kind: "announcement", id: "n1" });
    visibility = "hidden";
    show(a, 1);
    await vi.advanceTimersByTimeAsync(VIEW_DWELL_MS + VIEW_FLUSH_MS + 100);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("hiding the page mid-dwell cancels it", async () => {
    const a = el();
    observeSubject(a, { kind: "post", id: "p2" });
    show(a, 1);
    await vi.advanceTimersByTimeAsync(500);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(VIEW_DWELL_MS + VIEW_FLUSH_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an unobserved subject stops counting", async () => {
    const a = el();
    const stop = observeSubject(a, { kind: "post", id: "p3" });
    show(a, 1);
    stop();
    await vi.advanceTimersByTimeAsync(VIEW_DWELL_MS + VIEW_FLUSH_MS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(observed.has(a)).toBe(false);
  });
});

describe("batched, and never in the way (REQ-VEW-006)", () => {
  it("several subjects leave together in one keepalive POST to /api/views, every 4 s", async () => {
    for (const id of ["a", "b", "c"]) markShown({ kind: "frame", id });
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(VIEW_FLUSH_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/views");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(sentBodies()[0]).toEqual([
      { kind: "frame", id: "a" },
      { kind: "frame", id: "b" },
      { kind: "frame", id: "c" },
    ]);
  });

  it("at most 50 entries a request", async () => {
    for (let i = 0; i < 120; i++) markShown({ kind: "frame", id: `f${i}` });
    await vi.advanceTimersByTimeAsync(VIEW_FLUSH_MS);
    expect(sentBodies().map((b) => b.length)).toEqual([50, 50, 20]);
  });

  it("leaving the page sends at once by beacon; a refused beacon falls back to a keepalive fetch", async () => {
    markShown({ kind: "frame", id: "x" });
    window.dispatchEvent(new Event("pagehide"));
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/api/views");
    expect(blob.type).toBe("application/json");
    expect(fetchMock).not.toHaveBeenCalled();

    beacon.mockImplementation(() => false);
    markShown({ kind: "frame", id: "y" });
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sentBodies()).toEqual([[{ kind: "frame", id: "y" }]]);
  });

  it("a 5xx is retried once, then dropped", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 500 }));
    markShown({ kind: "post", id: "p" });
    await vi.advanceTimersByTimeAsync(VIEW_FLUSH_MS);
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(VIEW_FLUSH_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a 4xx is an answer — never retried", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 400 }));
    markShown({ kind: "post", id: "p" });
    await vi.advanceTimersByTimeAsync(VIEW_FLUSH_MS + 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a video watched to its end is sent once with completed", async () => {
    markShown({ kind: "frame", id: "v" });
    markCompleted({ kind: "frame", id: "v" });
    markCompleted({ kind: "frame", id: "v" });
    flushViews();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentBodies()[0]).toEqual([
      { kind: "frame", id: "v" },
      { kind: "frame", id: "v", completed: true },
    ]);
  });
});
