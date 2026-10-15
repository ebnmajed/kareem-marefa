// PostgREST refuses a token whose `iat` is ahead of ITS clock (PGRST303, «JWT issued at future», 401) — at the
// authentication stage, before any SQL runs, so repeating the identical request is safe even for an RPC that writes.
// A token Auth has just minted (proxy.ts refreshes on the way in) can reach a PostgREST whose clock trails Auth's; a
// second later the same token is accepted. So: wait, then try again, at most twice. notes/story-media.md §7.
const SKEW_CODE = "PGRST303";
const WAITS_MS = [1000, 2000];

export function withClockSkewRetry(
  base: typeof fetch = fetch,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): typeof fetch {
  return async (input, init) => {
    let res = await base(input, init);
    for (const wait of WAITS_MS) {
      if (res.status !== 401 || !(await isSkew(res))) return res;
      await sleep(wait);
      res = await base(input, init);
    }
    return res;
  };
}

async function isSkew(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as { code?: unknown } | null;
    return body?.code === SKEW_CODE;
  } catch {
    return false;
  }
}
