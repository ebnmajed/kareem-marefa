import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { CLIENT_SCOPES, type ClientScope } from "@/messages/client-scopes";

// DEC-286 — the browser receives the messages of the area it is in, not the whole catalogue.
//
// A `NextIntlClientProvider` given no `messages` passes every namespace, and the root layout's did: ~300 KB of text in
// the HTML of every page, the sign-in page included, parsed on the phone and serialised by the server on every full
// load. Each area's layout renders this instead, with the namespaces `scripts/client-scopes.mjs` found in its routes'
// import graph. ★ A nested provider REPLACES the one above it — it does not merge — which is exactly why each area's
// list is computed for everything under it, and why the list is generated rather than written.

type Messages = Record<string, unknown>;

export async function ScopedMessages({ scope, children }: { scope: ClientScope; children: React.ReactNode }) {
  return <NextIntlClientProvider messages={pickMessages((await getMessages()) as Messages, CLIENT_SCOPES[scope])}>{children}</NextIntlClientProvider>;
}

/** The subtrees at `paths` ("a.b" keeps `{ a: { b } }`); "*" keeps everything. */
export function pickMessages(all: Messages, paths: readonly string[]): Messages {
  if (paths.includes("*")) return all;
  const out: Messages = {};
  for (const path of paths) {
    const keys = path.split(".");
    let from: unknown = all;
    let to = out;
    for (let i = 0; i < keys.length; i++) {
      from = from && typeof from === "object" ? (from as Messages)[keys[i]] : undefined;
      if (from === undefined) break;
      if (i === keys.length - 1) to[keys[i]] = from;
      else to = (to[keys[i]] ??= {}) as Messages;
    }
  }
  return out;
}
