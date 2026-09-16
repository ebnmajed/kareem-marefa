#!/usr/bin/env bash
# TaskCompleted gate — PATH-AWARE since DEC-088.
#
# Before wave 5 this script ran the full `npm run qa` — stub, `next build`, `next start`,
# Puppeteer — on EVERY teammate's EVERY task, holding /tmp/task-gate.lock with a 2400 s
# timeout. `16` §16.1's "qa is lead-only" was a convention; this hook is the harness, and the
# harness wins: four teammates x ~six stories is ~24 forced qa runs a wave that the rule
# believed were not happening. Worse, scripts/lib/gate-lock.mjs lets a waiter give up after
# 20 minutes and proceed anyway — two `next start` processes on port 3000.
#
# What `npm run qa` actually guards is the frozen marketing contract (invariant 1). A task that
# touched only app/admin/** or components/scoring/** cannot have broken it. So:
#
#   cheap gate  — tsc + lint + vitest. No server, no build, no lock. Always runs.
#   full gate   — `npm run qa` under the lock. Runs only when the changed paths intersect
#                 MARKETING_PATHS below.
#
# "Changed paths" is measured against the last commit at which the FULL gate passed, recorded
# in .git/kareem-qa-verified (untracked, per-checkout). That marker is what stops the whole
# team paying for one `globals.css` commit: the lead pays once, qa passes, the marker advances,
# and the teammates are cheap again until someone next touches marketing. With no marker the
# scope falls back to the merge-base with main, which is the conservative answer.
#
# Escape hatches: KAREEM_GATE_FULL=1 forces the full gate; KAREEM_GATE_CHEAP=1 forces cheap
# (for a run where the lead has just verified marketing by hand and says so).
set -uo pipefail
cat >/dev/null                                   # task JSON on stdin; unused
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0

LOCK=/tmp/task-gate.lock
GIT_DIR_PATH=$(git rev-parse --git-dir 2>/dev/null || echo .git)
MARKER="$GIT_DIR_PATH/kareem-qa-verified"

# Every input `scripts/qa.mjs` can observe. Deliberately wider than the marketing route files:
# the locale layout, the tokens, the proxy and the shared public assets all reach those pages.
MARKETING_PATHS=(
  'src/app/[locale]/(marketing)/'
  'src/app/[locale]/layout.tsx'
  'src/app/[locale]/not-found.tsx'
  'src/app/globals.css'
  'src/proxy.ts'
  'src/components/marketing/'
  'src/messages/ar/marketing.json'
  'src/messages/en/marketing.json'
  'src/i18n/'
  'public/'
  'next.config.ts'
  'package.json'
  'package-lock.json'
  'scripts/qa.mjs'
  'scripts/qa-run.mjs'
  'scripts/lib/stubbed-server.mjs'
)

changed_paths() {
  # working tree first — staged, unstaged and untracked
  git diff --name-only 2>/dev/null
  git diff --cached --name-only 2>/dev/null
  git ls-files --others --exclude-standard 2>/dev/null
  # then everything since the last verified commit, or since the branch point if there is none
  local base=""
  if [ -f "$MARKER" ]; then
    local sha; sha=$(tr -d '[:space:]' <"$MARKER")
    git cat-file -e "${sha}^{commit}" 2>/dev/null && base="$sha"
  fi
  if [ -z "$base" ]; then
    base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || echo "")
  fi
  [ -n "$base" ] && git diff --name-only "$base"...HEAD 2>/dev/null
}

touches_marketing() {
  local paths; paths=$(changed_paths | sort -u)
  [ -z "$paths" ] && return 1
  local p
  for p in "${MARKETING_PATHS[@]}"; do
    # match a directory prefix or an exact file
    if printf '%s\n' "$paths" | grep -qF -- "$p"; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

# ── cheap gate: always ────────────────────────────────────────────────────────
# No server and no lock, so four teammates can finish tasks at the same time.
CHEAP_LOG=$(mktemp /tmp/task-gate-cheap.XXXXXX)
if ! { npx --no-install tsc --noEmit && npm run -s lint && npx --no-install vitest run; } >"$CHEAP_LOG" 2>&1; then
  echo "Task cannot be marked complete: typecheck, lint or unit tests failed. Full log: $CHEAP_LOG" >&2
  tail -n 40 "$CHEAP_LOG" >&2
  exit 2
fi
rm -f "$CHEAP_LOG"

# ── full gate: only when the change can reach the frozen routes ───────────────
if [ "${KAREEM_GATE_CHEAP:-0}" = "1" ]; then
  echo "task-gate: full qa skipped by KAREEM_GATE_CHEAP=1." >&2
  exit 0
fi
REASON=""
if [ "${KAREEM_GATE_FULL:-0}" = "1" ]; then
  REASON="KAREEM_GATE_FULL=1"
else
  REASON=$(touches_marketing) || {
    echo "task-gate: no change reaches the frozen marketing routes — full qa not run (DEC-088)." >&2
    exit 0
  }
fi
echo "task-gate: running full qa — the change reaches ${REASON}." >&2

LOG=$(mktemp /tmp/task-gate.XXXXXX)
HAVE_LOCK=0
# clear a lock whose holder is gone (its PID is in $LOCK/pid) or that is older than 30 minutes —
# the same rule as scripts/lib/gate-lock.mjs, so the two agree on what "stale" means
sweep() {
  [ -d "$LOCK" ] || return
  local pid; pid=$(cat "$LOCK/pid" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ] && rm -rf "$LOCK"
  else
    rm -rf "$LOCK"
  fi
}
sweep
# wait up to 20 minutes for our turn
for _ in $(seq 1 240); do mkdir "$LOCK" 2>/dev/null && { HAVE_LOCK=1; echo $$ > "$LOCK/pid"; break; }; sleep 5; sweep; done
trap '[ "$HAVE_LOCK" = 1 ] && rm -rf "$LOCK" 2>/dev/null' EXIT
if ! KAREEM_GATE_HELD=$HAVE_LOCK npm run -s qa >"$LOG" 2>&1; then
  echo "Task cannot be marked complete: 'npm run qa' failed. Full log: $LOG" >&2
  tail -n 40 "$LOG" >&2
  exit 2
fi
rm -f "$LOG"
# Record where marketing was last proven green, so the next task is measured from here.
git rev-parse HEAD >"$MARKER" 2>/dev/null
exit 0
