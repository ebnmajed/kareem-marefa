// ★ NAMED DIFFERENCE 1 — `{{url}}`, which nothing has ever supplied.
//
// Twenty-one of the twenty-five default templates end with `{{url}}` on its
// own line. No caller has ever put a `url` in a payload, and `interpolate()`
// renders an absent binding as the empty string — so every one of those mails
// has shipped since M3 ending in a blank line where its link belonged. The
// pinned files under `tests/unit/mail-pinned/` are the evidence: the defect is
// visible in them, which is exactly what pinning before changing was for.
//
// ★ THE FIX IS A MAP, NOT A PAYLOAD FIELD. Putting `url` in the payload would
// mean twenty-one senders — triggers, jobs and RPCs across four tracks — each
// building a link correctly, and a mail's link would be as reliable as the
// least careful of them. The ids are already in the payloads; the route is a
// property of the message key. So the key picks the route and the payload
// fills the id, in one place, here.
//
// ★ AND IT IS OFF UNTIL `APP_URL` IS SET. `linkFor()` returns null without an
// origin, `renderEmail()` then supplies no `url`, and a button bound to it is
// dropped. A relative link in a mail is a broken link, so half an origin is
// worse than none.

/** The id in the payload, and the path it belongs to. `id: null` is a route
 *  with no id — a member's own page, which every recipient can reach. */
interface Route {
  id: string | null;
  path: (id: string) => string;
}

const session: Route = { id: "session_id", path: (id) => `/app/sessions/${id}` };
const proposal: Route = { id: "proposal_id", path: (id) => `/app/propose/${id}` };
const own = (path: string): Route => ({ id: null, path: () => path });

/**
 * Every key whose template interpolates `{{url}}`. A key absent from this map
 * has no `{{url}}` in its template — `MSG-certificate_revoked`,
 * `MSG-role_changed` and `MSG-account_deactivated` each end with a sentence
 * and no link, deliberately, because there is nothing for the member to do.
 */
export const ROUTE_FOR: Readonly<Record<string, Route>> = {
  // §1.1 proposals — the proposer's own page, where the decision and any
  // requested change already live.
  "MSG-proposal_submitted": proposal,
  "MSG-proposal_approved": proposal,
  "MSG-proposal_rejected": proposal,
  "MSG-proposal_changes": proposal,
  "MSG-copresenter_invited": proposal,

  // §1.2–1.4 the session itself. A reminder, a change, a promotion off the
  // waitlist and a new-materials notice all want the event page: it carries
  // the day, the venue, the check-in and the materials in one place.
  "MSG-session_published": session,
  "MSG-presenter_assigned": session,
  "MSG-session_changed": session,
  // ★ `MSG-session_cancelled` is deliberately absent. Its template carries no
  // `{{url}}` at all: the session is cancelled, so there is nothing at the end
  // of a link, and the mail ends on the reason. A route here would be a
  // binding no template reads — the mirror of the defect this file fixes.
  "MSG-rsvp_promoted": session,
  "MSG-reminder_7d": session,
  "MSG-reminder_1d": session,
  "MSG-reminder_2h": session,
  "MSG-reminder_generic": session,
  // ★ The two discussion messages land on the event page and not on an anchor.
  // The payload carries `comment_id`, but a comment's anchor is `content`'s to
  // define and a fragment that does not resolve scrolls nowhere and looks
  // broken. The page is correct today; an anchor is a request to its owner.
  "MSG-comment_reply": session,
  "MSG-mentioned": session,

  // The two that want a sub-page, because the mail asks for one action.
  "MSG-rating_prompt": { id: "session_id", path: (id) => `/app/sessions/${id}/rate` },
  "MSG-materials_added": { id: "session_id", path: (id) => `/app/sessions/${id}/materials` },

  // §1.5 recognition — the payload carries a badge name or a level, never an
  // id, so the link is the member's own points page where both are shown.
  "MSG-badge_earned": own("/app/me/points"),
  "MSG-level_reached": own("/app/me/points"),
  // The certificate is reached from the member's list; `certificate_id` names
  // a row, not a route (`/verify/{code}` is the PUBLIC page and carries a
  // code, which this payload does not have).
  "MSG-certificate_issued": own("/app/me/certificates"),

  // §1.6 the export. `0073` writes no url into the payload, and the download
  // is behind the member's own privacy page rather than a link in a mail —
  // which is also what keeps a forwarded mail from carrying someone's data.
  "MSG-export_ready": own("/app/me/privacy"),
};

/**
 * ★ THE ORG'S LOGO, RESOLVED THE SAME WAY BY BOTH CALL SITES.
 *
 * `0126` / contract 9: `/api/brand/{orgId}/logo` is the one object a mail
 * client may fetch with no session, and only while it is PNG or JPEG for an
 * active org. Whether such a row exists is a question each caller asks the
 * database — the worker in SQL, the preview through the DAL — but the URL's
 * SHAPE and the «no row means null» rule are written once, here.
 *
 * They were not, and that was a real defect: the worker resolved a logo and
 * the preview never did, so every design previewed with the org's NAME where
 * the sent mail carried the logo band. An admin approved a message they would
 * never receive. Two copies of a rule is how that happens; one is how it
 * stops.
 */
export function logoUrlFor(origin: string | null | undefined, orgId: string, hasPublicLogo: boolean): string | null {
  if (!origin || !orgId || !hasPublicLogo) return null;
  return `${origin.replace(/\/+$/, "")}/api/brand/${orgId}/logo`;
}

/**
 * The absolute link for one message, or null.
 *
 * Null when there is no origin, when the key has no route, or when the route
 * needs an id the payload does not carry — and null means `renderEmail()`
 * leaves `url` unset, which renders as today.
 */
export function linkFor(key: string, payload: Record<string, unknown>, appUrl: string | null | undefined, locale = "ar"): string | null {
  if (!appUrl) return null;
  const route = ROUTE_FOR[key];
  if (!route) return null;
  let path: string;
  if (route.id === null) {
    path = route.path("");
  } else {
    const id = payload[route.id];
    // A uuid or nothing. `String(undefined)` in a link is the class of bug
    // that ships a message to `/app/sessions/undefined`.
    if (typeof id !== "string" || id === "") return null;
    path = route.path(encodeURIComponent(id));
  }
  return `${appUrl.replace(/\/+$/, "")}/${locale}${path}`;
}
