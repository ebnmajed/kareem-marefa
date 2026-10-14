// The reaction write queue — DEC-290 (REQ-EVT-004, REQ-STO-005).
//
// ★ THE TAP IS ANSWERED BY THE SCREEN, THE WRITE FOLLOWS. A caller shows the new state the moment it is tapped and hands
// the DESIRED state here. Quick taps on one target are coalesced: only the last state is sent, ~300 ms after the last
// tap, through `POST /api/reactions` — a Route Handler, so it never waits behind a Server Action. A state that changes
// while a write is in flight is sent once that write returns. The caller hears back only about the LAST state it asked
// for: `ok` with what the database now holds, or `failed` so it can show the server's state again.
// ★ Nothing is kept across a reload — no localStorage: a page that closes with a write still waiting sends it with
// `keepalive` on `pagehide`, and a member who reloads sees the server's truth.

export type ReactionBody =
  | { target: "comment"; id: string; kind: "like"; on: boolean }
  // DEC-291: the home feed's like on a session post (REQ-EVT-003), on the same queue as a comment's.
  | { target: "session"; id: string; kind: "like"; on: boolean }
  | { target: "story"; id: string; kind: string | null };

export type Settled = { ok: true; data: Record<string, unknown> } | { ok: false };

type Entry = {
  body: ReactionBody;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  dirty: boolean;
  onSettled: (result: Settled) => void;
};

export const COALESCE_MS = 300;
const entries = new Map<string, Entry>();
let listening = false;

const keyOf = (body: ReactionBody) => `${body.target}:${body.id}`;

async function send(body: ReactionBody, keepalive = false): Promise<Settled> {
  try {
    const response = await fetch("/api/reactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      keepalive,
    });
    if (!response.ok) return { ok: false };
    return { ok: true, data: (await response.json()) as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

async function fire(key: string): Promise<void> {
  const entry = entries.get(key);
  if (!entry) return;
  entry.timer = null;
  if (entry.inFlight) {
    entry.dirty = true;
    return;
  }
  entry.inFlight = true;
  entry.dirty = false;
  const body = entry.body;
  const result = await send(body);
  entry.inFlight = false;
  if (entry.dirty || entry.timer !== null) {
    // A newer state arrived meanwhile: it is the one the member wants, so it goes next and this answer is not theirs.
    if (entry.timer === null) void fire(key);
    return;
  }
  entries.delete(key);
  entry.onSettled(result);
}

function flushOnHide(): void {
  for (const [key, entry] of entries) {
    if (entry.timer === null && !entry.dirty) continue;
    if (entry.timer !== null) clearTimeout(entry.timer);
    entries.delete(key);
    void send(entry.body, true);
  }
}

/** Queues the desired state for one target. `onSettled` hears only about the last state queued for it. */
export function queueReaction(body: ReactionBody, onSettled: (result: Settled) => void, delayMs = COALESCE_MS): void {
  if (typeof window !== "undefined" && !listening) {
    window.addEventListener("pagehide", flushOnHide);
    listening = true;
  }
  const key = keyOf(body);
  const entry = entries.get(key) ?? { body, timer: null, inFlight: false, dirty: false, onSettled };
  entry.body = body;
  entry.onSettled = onSettled;
  if (entry.timer !== null) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => void fire(key), delayMs);
  entries.set(key, entry);
}

/** Whether a write for this target is still waiting or in flight — a live total for it is not yet the member's. */
export function isPending(target: ReactionBody["target"], id: string): boolean {
  return entries.has(`${target}:${id}`);
}

/** For tests. */
export function resetReactionQueue(): void {
  for (const entry of entries.values()) if (entry.timer !== null) clearTimeout(entry.timer);
  entries.clear();
}
