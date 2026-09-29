import "server-only";
import { headers } from "next/headers";

// ★ Was this render for the DOCUMENT — a hard load, a reload, a link from outside —
// or for the app's own navigation? (wave 16, REQ-UIX-044, DEC-197 §5; the lead's
// cold-phone gate at 751618c5.)
//
// A moment of 3 to 5 never plays on the page load the server painted: the truth is
// already on screen. Asking the DOM at mount time which occurrences the server drew
// is a race on a slow phone — React may discard a streamed boundary and render it
// afresh before, or without, ever looking at the server's HTML. So the SERVER says
// it, once, in the props it renders: a document request carries no `rsc` header;
// the router's own fetches — a link, a tab, `refresh()` — always send `rsc: 1`
// (`next/dist/client/components/app-router-headers.js:95`,
// `router-reducer/fetch-server-response.js:89`). A moment rendered for the document
// stays static and unclaimed, and the server is told nothing, so it plays at the
// next in-app arrival.
export async function isDocumentLoad(): Promise<boolean> {
  return !(await headers()).has("rsc");
}
