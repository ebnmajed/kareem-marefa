#!/usr/bin/env bash
# TaskCompleted gate: a team task may only be marked complete when `npm run qa` passes.
# Runs are serialized across concurrent teammates (QA boots a server); each run has its own log.
# The mutex is /tmp/task-gate.lock — the SAME directory scripts/lib/gate-lock.mjs uses for
# npm run qa, npm run visual, Playwright's web server and the unconfigured build, so this hook
# queues behind a manual run instead of racing it (DEC-040). `npm run qa` takes the lock itself;
# KAREEM_GATE_HELD tells it this hook already holds it.
set -uo pipefail
cat >/dev/null                                   # task JSON on stdin; unused
LOG=$(mktemp /tmp/task-gate.XXXXXX)
LOCK=/tmp/task-gate.lock
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
exit 0
