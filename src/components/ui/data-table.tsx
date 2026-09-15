// STUB — console's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// console REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { DataTableProps } from "@/components/ui";

export function DataTable<Row>({ label, columns, rows, rowKey, className = "" }: DataTableProps<Row>) {
  return (
    <table className={className} aria-label={label}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((c) => (
              <td key={c.key}>{c.cell(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
