// DEC-286 — each area sends the browser its own messages, never the whole catalogue.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeScopes, render } from "../../scripts/client-scopes.mjs";
import { pickMessages } from "@/i18n/scoped-messages";

describe("the client message scopes", () => {
  it("★ src/messages/client-scopes.ts is what the import graph says — run `node scripts/client-scopes.mjs` when it is not", () => {
    expect(readFileSync("src/messages/client-scopes.ts", "utf8")).toBe(render(computeScopes()));
  });

  it("every namespace a scope names exists in the Arabic catalogue", async () => {
    const { loadMessages } = await import("@/messages");
    const all = await loadMessages("ar");
    const scopes = computeScopes() as Record<string, string[]>;
    for (const [scope, paths] of Object.entries(scopes)) {
      for (const path of paths) expect(Object.keys(pickMessages(all, [path])), `${scope}: ${path}`).not.toEqual([]);
    }
  });

  it("★ the public site carries a fraction of the catalogue, and the register form's text is in it", async () => {
    const { loadMessages } = await import("@/messages");
    const all = await loadMessages("ar");
    const scopes = computeScopes() as Record<string, string[]>;
    const size = (o: unknown) => JSON.stringify(o).length;
    expect(scopes.public).toContain("register");
    expect(size(pickMessages(all, scopes.public))).toBeLessThan(size(all) / 10);
    expect(size(pickMessages(all, scopes.member))).toBeLessThan(size(all) / 3);
  });
});

describe("pickMessages", () => {
  const all = { a: { b: { c: "1" }, d: "2" }, e: "3" };
  it("keeps the subtrees named, and only them", () => {
    expect(pickMessages(all, ["a.b"])).toEqual({ a: { b: { c: "1" } } });
    expect(pickMessages(all, ["a.b", "e"])).toEqual({ a: { b: { c: "1" } }, e: "3" });
    expect(pickMessages(all, ["missing.x"])).toEqual({});
  });
  it("«*» is everything", () => {
    expect(pickMessages(all, ["*"])).toBe(all);
  });
});
