import { describe, expect, it, vi } from "vitest";
import { withClockSkewRetry } from "@/lib/supabase/skew-retry";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const skew = () => json(401, { code: "PGRST303", message: "JWT issued at future" });

describe("withClockSkewRetry — PGRST303 is retried, nothing else is", () => {
  it("a 401 PGRST303 then 200 → 200 after one 1 s wait", async () => {
    const base = vi.fn().mockResolvedValueOnce(skew()).mockResolvedValueOnce(json(200, []));
    const waits: number[] = [];
    const res = await withClockSkewRetry(base, async (ms) => void waits.push(ms))("https://x/rest/v1/t");
    expect(res.status).toBe(200);
    expect(waits).toEqual([1000]);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("three PGRST303 → the third 401 is returned after waits [1000, 2000], its body still readable", async () => {
    const base = vi.fn().mockResolvedValueOnce(skew()).mockResolvedValueOnce(skew()).mockResolvedValueOnce(skew());
    const waits: number[] = [];
    const res = await withClockSkewRetry(base, async (ms) => void waits.push(ms))("https://x/rest/v1/t");
    expect(res.status).toBe(401);
    expect(waits).toEqual([1000, 2000]);
    expect(base).toHaveBeenCalledTimes(3);
    expect((await res.json()).code).toBe("PGRST303");
  });

  it("a 401 PGRST301 is returned at once", async () => {
    const base = vi.fn().mockResolvedValueOnce(json(401, { code: "PGRST301" }));
    const sleep = vi.fn();
    const res = await withClockSkewRetry(base, sleep)("https://x/rest/v1/t");
    expect(res.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("a 401 with a non-JSON body is returned at once", async () => {
    const base = vi.fn().mockResolvedValueOnce(new Response("nope", { status: 401 }));
    const res = await withClockSkewRetry(base, vi.fn())("https://x/rest/v1/t");
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("nope");
    expect(base).toHaveBeenCalledTimes(1);
  });
});
