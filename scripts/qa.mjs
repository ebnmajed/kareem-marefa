// The public routes' suite (REQ-NFR-019, DEC-167). Run it with `npm run qa`, which starts the stub.
//
//   node scripts/qa.mjs                    # both halves
//   node scripts/qa.mjs --part=contract    # behaviour — blocking at every commit (npm run qa:contract)
//   node scripts/qa.mjs --part=appearance  # the design (npm run qa:appearance)
//
// The split is 16 §14's: invariant 1 is RE-CUT, not deleted. The routes' URLs, registration behaviour
// and accessibility floor are the contract; their appearance moves only with a decision and a
// re-baselined capture, in the same commit.

import { browser, counts } from "./qa/lib.mjs";

const arg = process.argv.find((a) => a.startsWith("--part="));
const part = arg ? arg.slice("--part=".length) : "all";
if (!["all", "contract", "appearance"].includes(part)) {
  console.error(`unknown --part=${part} (all | contract | appearance)`);
  process.exit(2);
}

if (part !== "appearance") {
  console.log("── contract ──");
  await (await import("./qa/contract.mjs")).default();
}
if (part !== "contract") {
  console.log("── appearance ──");
  await (await import("./qa/appearance.mjs")).default();
}

await browser.close();
const { pass, fail } = counts();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
