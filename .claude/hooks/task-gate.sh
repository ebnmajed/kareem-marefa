#!/usr/bin/env bash
set -uo pipefail
cat >/dev/null
if ! npm run -s qa >/tmp/task-gate.log 2>&1; then
  echo "Task cannot be marked complete: 'npm run qa' failed." >&2
  tail -n 40 /tmp/task-gate.log >&2
  exit 2
fi
exit 0
