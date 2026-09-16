// A tiny in-memory stand-in for the RLS-bound Supabase client, for DAL unit
// tests that must prove WHICH ROWS a reader lets through — not just that it
// builds a query. Tables are arrays of rows; `eq`, `neq`, `in`, `is` and
// `not` actually filter them, so a reader that forgets a filter reads a row
// it must not, and the test fails the way production would.
//
// Only what the DAL modules under test call is here. Selects ignore their
// column list: a fixture row carries whatever the select expects, embedded
// relations included (`{ categories: { name } }`). `maybeSingle()` refuses more
// than one row, as PostgREST does.

type Row = Record<string, unknown>;

export function memorySupabase(tables: Record<string, Row[]>, rpcs: Record<string, unknown> = {}) {
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const value = (row: Row, column: string) => (row[column] === undefined ? null : row[column]);
    const query = {
      select: () => query,
      eq: (column: string, expected: unknown) => ((rows = rows.filter((r) => value(r, column) === expected)), query),
      neq: (column: string, expected: unknown) => ((rows = rows.filter((r) => value(r, column) !== expected)), query),
      in: (column: string, expected: unknown[]) => ((rows = rows.filter((r) => expected.includes(value(r, column)))), query),
      is: (column: string, expected: unknown) => ((rows = rows.filter((r) => value(r, column) === expected)), query),
      // ★ Only the `is`/`eq` negation `admin-dashboard.ts`'s own
      // `.not("category_id", "is", null)` needs — PostgREST's `not()` takes
      // an arbitrary operator, this stub only the two already in use. Any other
      // operator THROWS: a stub that quietly treated `not(col, "in", …)` as
      // «not equal» would let a missing filter pass the very test meant to catch it.
      not: (column: string, operator: string, expected: unknown) => {
        if (operator !== "is" && operator !== "eq") throw new Error(`memorySupabase: not(${column}, "${operator}") is not supported`);
        rows = rows.filter((r) => value(r, column) !== expected);
        return query;
      },
      order: () => query,
      limit: (n: number) => ((rows = rows.slice(0, n)), query),
      textSearch: () => query,
      ilike: () => query,
      maybeSingle: async () =>
        rows.length > 1 ? { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } } : { data: rows[0] ?? null, error: null },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    };
    return query;
  }
  return {
    from,
    rpc: (name: string) => {
      const result = { data: rpcs[name] ?? null, error: null };
      return Object.assign(Promise.resolve(result), { single: async () => result });
    },
  };
}
