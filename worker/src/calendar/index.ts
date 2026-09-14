// The calendar factory. One place decides whether this process talks to
// Google, and the default is the stub.
//
// Same shape and same reason as the mail factory (DEC-046): the OAuth client
// is a Launch input, and a missing variable falling through to the real API
// would mean a test run writing into somebody's actual calendar. There is no
// undo for that either.

import { GoogleCalendarApi, type CalendarApi } from "./api.js";
import { StubCalendarApi } from "./stub.js";

export { CalendarNotFound, CalendarAuthExpired, CALENDAR_SCOPE } from "./api.js";
export type { CalendarApi, CalendarEventBody } from "./api.js";
export { StubCalendarApi } from "./stub.js";

export interface CalendarEnv {
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  CALENDAR_API?: string;
}

// The cast is TypeScript's weak-type check, not a looseness: `CalendarEnv`
// has no property in common with Next's `ProcessEnv`, which the root tsconfig
// applies to `process.env`, so the assignment is rejected even though every
// property is optional and string-valued. The mail factory compiles without
// one only because it happens to declare `NODE_ENV`.
export function createCalendarApi(env: CalendarEnv = process.env as CalendarEnv): CalendarApi {
  if (env.CALENDAR_API === "stub") return new StubCalendarApi();
  const id = env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  // Both, or neither. A half-configured client fails at the first refresh
  // with an opaque 400 rather than here with a sentence.
  if (id && secret) return new GoogleCalendarApi(id, secret);
  return new StubCalendarApi();
}
