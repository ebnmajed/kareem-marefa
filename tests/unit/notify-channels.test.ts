// STORY-NTF-001 / REQ-NTF-001 — "two channels, and only two".
//
// The requirement's acceptance criterion is a NEGATIVE one: "No code path,
// dependency or configuration field exists for a third channel." Nothing else
// in the suite can fail when someone adds one, because adding an SMS provider
// breaks no existing test — it only adds. So this file is the test that
// notices.
//
// Two halves: the channel enum has exactly two values wherever it is written
// down, and no third-channel vocabulary appears in the source tree or in the
// dependency list.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

// The contract lives under supabase/proposed/notify/ until the lead promotes
// it, and under supabase/migrations/ afterwards. Read whichever is there, so
// the test does not go quietly vacuous on the day it is promoted.
const PROMOTED = join(ROOT, "supabase", "migrations", "0026_notification_contract.sql");
const PROPOSED = join(ROOT, "supabase", "proposed", "notify", "0001_notification_contract.sql");
const CONTRACT = existsSync(PROMOTED) ? PROMOTED : PROPOSED;

/** Comments are prose, not a code path. The requirement's own wording — "no
 *  SMS, no WhatsApp, no push" — is quoted in this repository's comments
 *  several times, and a scan that flagged those would be testing whether the
 *  reason was written down rather than whether the channel exists. */
function code(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|\s)(\/\/|--)\s.*$/, ""))
    .join("\n");
}

function walk(dir: string, keep: (path: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, keep, out);
    else if (keep(path)) out.push(path);
  }
  return out;
}

describe("REQ-NTF-001 — the channel enum", () => {
  it("has exactly in_app and email, in the schema", () => {
    const sql = readFileSync(CONTRACT, "utf8");
    const match = sql.match(/create type public\.notify_channel\s+as enum \(([^)]*)\)/);
    expect(match).not.toBeNull();
    const values = match![1].split(",").map((v) => v.trim().replace(/'/g, ""));
    expect(values).toEqual(["in_app", "email"]);
  });

  it("has exactly in_app and email, in the DAL", () => {
    const dal = readFileSync(join(ROOT, "src", "lib", "dal", "notifications.ts"), "utf8");
    const match = dal.match(/export type NotifyChannel = ([^;]+);/);
    expect(match).not.toBeNull();
    const values = match![1].split("|").map((v) => v.trim().replace(/"/g, ""));
    expect(values).toEqual(["in_app", "email"]);
  });

  it("has exactly two channel labels on the preferences screen", () => {
    const ar = JSON.parse(readFileSync(join(ROOT, "src", "messages", "ar", "notifications.json"), "utf8"));
    expect(Object.keys(ar.notifications.preferences.channel)).toEqual(["inApp", "email"]);
  });
});

describe("REQ-NTF-001 — no third channel anywhere", () => {
  // Deliberately specific. A bare "push" is `Array.prototype.push` and a bare
  // "notify" is this track's own contract, so neither can be the signal; what
  // a third channel actually looks like in a repository is a provider name, a
  // transport name, or a column called something like `phone_number`.
  const FORBIDDEN = [
    /\bsms\b/i,
    /whats-?app/i,
    /\btwilio\b/i,
    /\bonesignal\b/i,
    /\bapns\b/i,
    /web-?push/i,
    /push[_ -]?notification/i,
    /firebase[-_ ]?messaging/i,
    /\bfcm\b/i,
    /phone_number|phoneNumber/i,
  ];

  // One documented exemption. `robots.ts` lists link-preview CRAWLER
  // user-agents (REQ-NFR-019's rich link previews for the frozen marketing
  // routes); "WhatsApp" there is the name of a bot that fetches an OG image,
  // not a channel this product sends anything on. Every other hit in the tree
  // was a comment, which `code()` above removes.
  const EXEMPT = new Set([join("src", "app", "robots.ts")]);

  const sources = [
    ...walk(join(ROOT, "src"), (p) => [".ts", ".tsx", ".json", ".css"].includes(extname(p))),
    ...walk(join(ROOT, "worker", "src"), (p) => extname(p) === ".ts"),
    ...walk(join(ROOT, "supabase", "migrations"), (p) => extname(p) === ".sql"),
    ...walk(join(ROOT, "supabase", "proposed"), (p) => extname(p) === ".sql"),
  ];

  it("scans a non-trivial number of files, so a passing run means something", () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it("finds no third-channel code path or configuration field", () => {
    const hits: string[] = [];
    for (const file of sources) {
      if (EXEMPT.has(file.slice(ROOT.length + 1))) continue;
      const body = code(readFileSync(file, "utf8"));
      for (const pattern of FORBIDDEN) {
        if (pattern.test(body)) hits.push(`${file.slice(ROOT.length + 1)} matches ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("declares no third-channel dependency", () => {
    for (const manifest of ["package.json", join("worker", "package.json")]) {
      const pkg = JSON.parse(readFileSync(join(ROOT, manifest), "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
      for (const name of names) {
        for (const pattern of FORBIDDEN) expect(`${manifest}: ${name}`).not.toMatch(pattern);
      }
    }
  });
});
