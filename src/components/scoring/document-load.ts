import "server-only";
import { headers } from "next/headers";

// ★ Was this render for the DOCUMENT — a hard load, a reload, a link from outside —
// or for the app's own navigation? (wave 16, REQ-UIX-044, DEC-197 §5; the lead's
// cold-phone gates at 751618c5 and 1d0688e3.)
//
// A moment of 3 to 5 never plays on the page load the server painted: the truth is
// already on screen. Asking the DOM at mount time which occurrences the server drew
// is a race on a slow phone — React may discard a streamed boundary and render it
// afresh before, or without, ever looking at the server's HTML. So the SERVER says
// it, once, in the props it renders.
//
// ★ The signal is the BROWSER's, not Next's: Fetch Metadata's `Sec-Fetch-Dest`
// (https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-dest-header). A
// top-level navigation — a hard load, a reload, a link from outside — is sent with
// `document`; the router's own `fetch()` for a link, a tab, back/forward or
// `refresh()` is sent with `empty`. (Next's own `rsc` request header was the first
// attempt, 1d0688e3: Next strips its flight headers before a page sees `headers()`,
// so it read as a document on every request and nothing ever played.)
//
// ★ Conservative: `document` OR ABSENT counts as the document. A browser that does
// not send Fetch Metadata, or a proxy that drops it, gets the static state — never a
// replay over a truth already on screen. A moment rendered for the document stays
// static and unclaimed, and the server is told nothing, so it plays at the next
// in-app arrival.

/** The rule, pure — exported for its unit test. */
export function isDocumentRequest(secFetchDest: string | null): boolean {
  return secFetchDest === null || secFetchDest.trim().toLowerCase() === "document";
}

export async function isDocumentLoad(): Promise<boolean> {
  return isDocumentRequest((await headers()).get("sec-fetch-dest"));
}
