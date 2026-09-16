#!/usr/bin/env node
// Who on the wave has actually committed, and how long ago — DEC-047's lesson
// made mechanical. A Sonnet teammate goes idle without saying "ready for sync"
// (waves 2 and 3, both recorded in STATUS), and the lead finds out at the next
// sync rather than at the next hour. This is the cheap check in between.
//
//   node scripts/wave-activity.mjs            # since main
//   node scripts/wave-activity.mjs wave-5/x   # since another base
import { execSync } from "node:child_process";

const base = process.argv[2] ?? "main";
const sh = (c) => execSync(c, { encoding: "utf8" }).trim();

let log;
try {
  log = sh(`git log ${base}..HEAD --format=%an%x09%at%x09%h%x09%s`);
} catch {
  console.error(`cannot read ${base}..HEAD — is ${base} a real ref?`);
  process.exit(1);
}
if (!log) {
  console.log(`no commits on ${sh("git branch --show-current")} since ${base}.`);
  process.exit(0);
}

const now = Date.now() / 1000;
const byAuthor = new Map();
for (const line of log.split("\n")) {
  const [author, at, hash, subject] = line.split("\t");
  const e = byAuthor.get(author) ?? { n: 0, last: 0, hash: "", subject: "" };
  e.n += 1;
  if (+at > e.last) { e.last = +at; e.hash = hash; e.subject = subject; }
  byAuthor.set(author, e);
}

const age = (s) => {
  const m = Math.round((now - s) / 60);
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

console.log(`\n${sh("git branch --show-current")} — ${log.split("\n").length} commits since ${base}\n`);
const rows = [...byAuthor.entries()].sort((a, b) => b[1].last - a[1].last);
for (const [author, e] of rows) {
  const quiet = now - e.last > 90 * 60; // 90 minutes with nothing committed
  console.log(`  ${quiet ? "⚠ " : "  "}${author.padEnd(22)} ${String(e.n).padStart(3)} commits   last ${age(e.last).padStart(4)} ago   ${e.hash}  ${e.subject.slice(0, 54)}`);
}
if (rows.some(([, e]) => now - e.last > 90 * 60))
  console.log(`\n  ⚠ = nothing committed in 90+ minutes. Re-drive, do not wait — a quiet\n      teammate is the failure mode this repo has hit twice (STATUS, waves 2 and 3).`);
console.log();
