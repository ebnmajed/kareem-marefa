import { StoryRings } from "@/components/stories/story-rings";

// The ring row — `Home.dc.html:27-33`, REQ-UIX-055, ★ REQ-STO-006, REQ-STO-007. Wave 18 drew it inert; wave 26 wires
// it: the sessions, their state and their order are `sessions'` story feed (`getStoryFeed()`, DEC-251 §4), and each
// ring opens the viewer. The 24-hour window `ring-state.ts` computed by hand is gone with it — expiry is the feed's
// and RLS's now, never the home's (contract 4). No rings, no row.

export async function RingRow() {
  return <StoryRings />;
}
