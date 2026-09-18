// Every action a migration writes into `audit_log` has an Arabic label on
// SCR-062, and an English one — REQ-ADM-018, `10` §1.
//
// The screen used to print the machine key (`member.role_changed`) as the
// action. It now reads `admin.audit.actions.<domain>.<verb>`, and falls back to
// the key for one it does not know — which is how a new `write_audit()` call
// would quietly reach an admin untranslated. This reads every dotted action
// literal in `supabase/migrations/` and fails for the one without a label.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import adminAr from "@/messages/ar/admin.json";
import adminEn from "@/messages/en/admin.json";

const dir = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n");

// The `audit_log.action` check is `^[a-z_]+\.[a-z_]+$`, and so every literal of
// that shape is read as an action — broad on purpose, so a new call site is
// caught however it spells the call. What is NOT an action is named here, each
// with where it comes from: `public.<table>` is a qualified name,
// `background.color` is a document path `0094`'s template guard walks, and
// `kareem.days_writer` is the transaction-local setting a day-aware writer
// sets so `0100`'s single-day shim stands down (DEC-150) — a custom Postgres
// setting must contain a dot, so it cannot be spelt any other way.
// `kareem.check_in_shadow` is its sibling in `0104`: the mark the day→session
// switch recompute puts on its own update (DEC-151).
// `kareem.days_notified` is `0111`'s: what `session_days_changed()` has already
// announced in this transaction (DEC-154).
// `member.name` and `member.email` are BINDING names — two of the placeholders
// `notification_bindings()` (`0133`, REQ-NTF-012) declares for every message
// key, which a template writes as `{{member.name}}`. A dotted path, never an
// audit action (wave 10).
const NOT_ACTIONS = new Set(["background.color", "kareem.days_writer", "kareem.check_in_shadow", "kareem.days_notified", "member.name", "member.email"]);
const actions = Array.from(
  new Set(Array.from(sql.matchAll(/'([a-z_]+\.[a-z_]+)'/g), (m) => m[1]).filter((a) => !a.startsWith("public.") && !NOT_ACTIONS.has(a))),
).sort();

function label(messages: { admin: { audit: { actions: Record<string, Record<string, string>> } } }, action: string): string | undefined {
  const [domain, verb] = action.split(".");
  return messages.admin.audit.actions[domain]?.[verb];
}

describe("REQ-ADM-018 — every audited action reads in Arabic", () => {
  it("found the actions the migrations write", () => {
    expect(actions.length).toBeGreaterThan(40);
    expect(actions).toContain("member.role_changed");
  });

  it("each has an Arabic label", () => {
    expect(actions.filter((a) => !label(adminAr, a))).toEqual([]);
  });

  it("each has an English label", () => {
    expect(actions.filter((a) => !label(adminEn, a))).toEqual([]);
  });
});
