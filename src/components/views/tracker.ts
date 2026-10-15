// The view tracker — REQ-VEW-001, REQ-VEW-002, REQ-VEW-006, DEC-297; docs/plan/notes/views.md §1 (the route) and §8
// (this file). ONE module for the page: one IntersectionObserver, one queue, one timer. A subject is SEEN when at least
// half of it has been on screen for a full second while the page is visible — or, in the story viewer, when its frame
// is shown — and it is queued once per page life. The queue leaves every few seconds through a keepalive fetch, and at
// once through a beacon when the page is hidden or left. A failed send is retried once, then dropped: nothing is ever
// shown to the member, and nothing here is React state, so a view never re-renders the feed. No Server Action.

export type ViewKind = "frame" | "post" | "recap" | "announcement";
export interface ViewSubject {
  kind: ViewKind;
  id: string;
}
interface Entry {
  kind: ViewKind;
  id: string;
  completed?: true;
}

export const VIEW_THRESHOLD = 0.5;
export const VIEW_DWELL_MS = 1000;
export const VIEW_FLUSH_MS = 4000;
export const VIEW_BATCH_MAX = 50;
const ENDPOINT = "/api/views";

const keyOf = (s: ViewSubject) => `${s.kind}:${s.id}`;

class Tracker {
  private observer: IntersectionObserver | null = null;
  private subjects = new Map<Element, ViewSubject>();
  private visibleSince = new Map<Element, number>();
  private timers = new Map<Element, ReturnType<typeof setTimeout>>();
  private seen = new Set<string>();
  private completed = new Set<string>();
  private queue: Entry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;

  observe(el: Element, subject: ViewSubject): () => void {
    if (typeof window === "undefined") return () => {};
    this.listen();
    if (!this.observer && typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), { threshold: [0, VIEW_THRESHOLD] });
    }
    this.subjects.set(el, subject);
    this.observer?.observe(el);
    return () => {
      this.cancel(el);
      this.subjects.delete(el);
      this.observer?.unobserve(el);
    };
  }

  /** The story viewer: a frame shown is a frame seen — no geometry. */
  markShown(subject: ViewSubject) {
    if (typeof window === "undefined") return;
    this.listen();
    this.see(subject);
  }

  /** A video frame reached its end — sent once, with «watched to its end». */
  markCompleted(subject: ViewSubject) {
    if (typeof window === "undefined") return;
    this.listen();
    const key = keyOf(subject);
    if (this.completed.has(key)) return;
    this.completed.add(key);
    this.seen.add(key);
    this.enqueue({ kind: subject.kind, id: subject.id, completed: true });
  }

  /** Sends what is queued now — the tests', and the page's on hide. */
  flushNow(viaBeacon = false) {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, VIEW_BATCH_MAX);
      if (viaBeacon) this.beacon(batch);
      else void this.send(batch, false);
    }
  }

  /** Forgets everything — tests only. */
  reset() {
    for (const t of this.timers.values()) clearTimeout(t);
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.observer?.disconnect();
    this.observer = null;
    this.subjects.clear();
    this.visibleSince.clear();
    this.timers.clear();
    this.seen.clear();
    this.completed.clear();
    this.queue = [];
    this.flushTimer = null;
    if (this.listening) {
      window.removeEventListener("pagehide", this.onHide);
      document.removeEventListener("visibilitychange", this.onVisibility);
    }
    this.listening = false;
  }

  private listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener("pagehide", this.onHide);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private onHide = () => this.flushNow(true);

  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      // A phone in a pocket views nothing: every dwell stops, and what was seen leaves now.
      for (const el of [...this.timers.keys()]) this.cancel(el);
      this.flushNow(true);
    } else {
      for (const el of this.visibleSince.keys()) this.arm(el);
    }
  };

  private onIntersect(entries: IntersectionObserverEntry[]) {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio >= VIEW_THRESHOLD) {
        this.visibleSince.set(e.target, Date.now());
        this.arm(e.target);
      } else {
        this.visibleSince.delete(e.target);
        this.cancel(e.target);
      }
    }
  }

  private arm(el: Element) {
    const subject = this.subjects.get(el);
    if (!subject || this.seen.has(keyOf(subject)) || this.timers.has(el)) return;
    if (document.visibilityState !== "visible") return;
    this.timers.set(
      el,
      setTimeout(() => {
        this.timers.delete(el);
        if (this.visibleSince.has(el) && document.visibilityState === "visible") this.see(subject);
      }, VIEW_DWELL_MS),
    );
  }

  private cancel(el: Element) {
    const t = this.timers.get(el);
    if (t !== undefined) clearTimeout(t);
    this.timers.delete(el);
  }

  private see(subject: ViewSubject) {
    const key = keyOf(subject);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.enqueue({ kind: subject.kind, id: subject.id });
  }

  private enqueue(entry: Entry) {
    this.queue.push(entry);
    if (this.flushTimer === null) this.flushTimer = setTimeout(() => this.flushNow(false), VIEW_FLUSH_MS);
  }

  private async send(batch: Entry[], retried: boolean) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        keepalive: true,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ views: batch }),
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) return; // done, or an answer: never retried
      throw new Error(`views ${res.status}`);
    } catch {
      if (!retried) void this.send(batch, true);
      // A second failure drops the batch (REQ-VEW-006).
    }
  }

  private beacon(batch: Entry[]) {
    const body = JSON.stringify({ views: batch });
    const sent = typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    if (!sent) void this.send(batch, false);
  }
}

const tracker = new Tracker();

export const observeSubject = (el: Element, subject: ViewSubject) => tracker.observe(el, subject);
export const markShown = (subject: ViewSubject) => tracker.markShown(subject);
export const markCompleted = (subject: ViewSubject) => tracker.markCompleted(subject);
export const flushViews = (viaBeacon = false) => tracker.flushNow(viaBeacon);
export const resetViews = () => tracker.reset();
