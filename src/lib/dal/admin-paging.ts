import "server-only";

// ★ PostgREST answers at most `max_rows` rows (`supabase/config.toml:18`: 1000) to ANY read without a range — and says
// nothing when it cuts one short. Every unbounded console read paged through here instead (`DEC-232` §4.3): an export
// that drops rows, or a count that stops at 1000, is a figure that silently lies (`REQ-ADM-017`).
//
// The caller orders by a unique key so the pages do not overlap. Paging stops on an EMPTY page, not a short one: a
// production `max_rows` below the requested size would make a short page look like the last.

export const READ_PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Every row — or, with `max`, the first `max` rows, for a read that deliberately looks at the newest only. */
export async function readAll<T>(label: string, page: (from: number, to: number) => Page<T>, max = Infinity): Promise<T[]> {
  const out: T[] = [];
  while (out.length < max) {
    const from = out.length;
    const { data, error } = await page(from, Math.min(from + READ_PAGE, max) - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) return out;
    out.push(...rows);
  }
  return out.slice(0, max);
}
