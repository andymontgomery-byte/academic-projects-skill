#!/bin/zsh
# Hourly BrainLift change watch — launchd entry point.
# Installed as ~/Library/LaunchAgents/com.alphainsights.academic-projects-brainlift-watch.plist
# Scan (node) always runs; a headless claude re-assess runs only when the
# scanner found changes. Lock covers the whole run incl. the claude child.
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOCK=/tmp/academic-projects-brainlift-watch.lock
LOG="$HOME/Library/Logs/academic-projects-brainlift-watch.log"
PROMPT=/tmp/academic-projects-brainlift-reassess-prompt.md

if ! mkdir "$LOCK" 2>/dev/null; then
  oldpid=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
    echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') skipped: previous run still going (pid $oldpid)" >> "$LOG"
    exit 0
  fi
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') broke stale lock (pid ${oldpid:-unknown})" >> "$LOG"
  rm -rf "$LOCK"
  mkdir "$LOCK" 2>/dev/null || exit 0
fi
echo $$ > "$LOCK/pid"

CHILD_PID=""
cleanup() {
  [ -n "$CHILD_PID" ] && kill "$CHILD_PID" 2>/dev/null
  rm -rf "$LOCK"
}
trap cleanup EXIT TERM INT

cd "$HOME/projects/academic-projects-skill"
{
  echo ""
  echo "=== watch start $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="
  rm -f "$PROMPT"
  node loop/brainlift-watch.mjs
  if [ -s "$PROMPT" ]; then
    echo "--- re-assess start $(date -u '+%Y-%m-%dT%H:%M:%SZ') ---"
    claude -p "$(cat "$PROMPT")" --dangerously-skip-permissions < /dev/null &
    CHILD_PID=$!
    wait "$CHILD_PID"
    rc=$?
    CHILD_PID=""
    echo "--- re-assess end $(date -u '+%Y-%m-%dT%H:%M:%SZ') exit=$rc ---"
  fi
  echo "=== watch end $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="
} >> "$LOG" 2>&1
