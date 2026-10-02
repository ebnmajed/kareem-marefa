// A word-level diff for SCR-041's «تعديلات على المحتوى منذ الإرسال» — REQ-UIX-088. Pure; no dependency.
//
// Words are runs of non-space, so Arabic and Latin split alike and nothing is cut inside a word (a cut inside a
// word would break its shaping). The longest common subsequence over words: an abstract is at most 2000 characters,
// some 400 words, so the table is bounded (≈ 160 000 cells) and never worth a library. Spaces are kept with the word
// before them, so joining the parts gives back each side exactly.

export type DiffPart = { kind: "same" | "del" | "ins"; text: string };

function words(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

export function diffWords(before: string, after: string): DiffPart[] {
  const a = words(before);
  const b = words(after);
  const n = a.length;
  const m = b.length;
  const key = (w: string) => w.trimEnd();
  // lcs[i][j] = the LCS length of a[i..] and b[j..].
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = key(a[i]) === key(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = parts.at(-1);
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) {
      push("same", b[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("del", a[i++]);
    } else {
      push("ins", b[j++]);
    }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("ins", b[j++]);
  return parts;
}
