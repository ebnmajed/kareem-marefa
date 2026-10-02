import { Card } from "@/components/ui/card";

// SCR-040's six month figures (`DEC-228` §3.3): the number above its label, as
// the artboard draws it, each tile one link to the list behind it
// (`REQ-ADM-004`). Not `ui/stat`: `stat` sets its value in the display face
// and its label above it, and in the console the display face is the `h1`'s
// alone (`DEC-228` §6) — the tile is `ui/card` with the figure in the body
// face, bold. Every value arrives formatted (Western digits, `DEC-124`).
export interface Figure {
  key: string;
  label: string;
  value: string;
  href: string;
}

export function FigureTiles({ figures }: { figures: Figure[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {figures.map((f) => (
        <li key={f.key}>
          <Card density="row" href={f.href} className="h-full">
            <span className="flex w-full flex-col gap-1 p-4">
              <span className="text-h2 font-bold text-fg-heading">
                <bdi>{f.value}</bdi>
              </span>
              <span className="text-caption text-fg-muted">{f.label}</span>
            </span>
          </Card>
        </li>
      ))}
    </ul>
  );
}
