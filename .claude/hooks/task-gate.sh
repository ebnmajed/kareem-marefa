#!/usr/bin/env bash
# TaskCompleted gate: a team task may only be marked complete when `npm run qa` passes.
# Runs are serialized across concurrent teammates (QA boots a server); each run has its own log.
set -uo pipefail
cat >/dev/null                                   # task JSON on stdin; unused
LOG=$(mktemp /tmp/task-gate.XXXXXX)
LOCK=/tmp/task-gate.lock
HAVE_LOCK=0
# clear a lock left by a killed run (older than 30 minutes)
if [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; fi
# wait up to 20 minutes for our turn
for _ in $(seq 1 240); do mkdir "$LOCK" 2>/dev/null && { HAVE_LOCK=1; break; }; sleep 5; done
trap '[ "$HAVE_LOCK" = 1 ] && rmdir "$LOCK" 2>/dev/null' EXIT
if ! npm run -s qa >"$LOG" 2>&1; then
  echo "Task cannot be marked complete: 'npm run qa' failed. Full log: $LOG" >&2
  tail -n 40 "$LOG" >&2
  exit 2
fi
rm -f "$LOG"
exit 0
