#!/usr/bin/env node
// Points git at .githooks/ (DEC-270) — run by `npm install`'s prepare step. It never fails the install: outside a git
// checkout (Vercel's build, a tarball) or without git there is nothing to point, and the hook is a convenience that CI
// backs up, never a gate of its own.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

try {
  if (existsSync(".git") || existsSync("../.git")) {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  }
} catch {
  // No git, or not a repository: nothing to do.
}
