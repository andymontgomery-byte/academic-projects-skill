#!/bin/zsh
# Send a reply email from the alpha.school account via Mail.app.
# Usage: reply-mail.sh <to-address> <subject> <body-file>
# Used by the 30-minute triage agent for the "ACADEMIC PROJECTS" email flow.
set -euo pipefail
TO="$1"; SUBJECT="$2"; BODYFILE="$3"
BODY=$(cat "$BODYFILE")
osascript - "$TO" "$SUBJECT" "$BODY" <<'EOF'
on run argv
  set toAddr to item 1 of argv
  set subj to item 2 of argv
  set body to item 3 of argv
  tell application "Mail"
    set msg to make new outgoing message with properties {subject:subj, content:body, sender:"andy.montgomery@alpha.school", visible:false}
    tell msg
      make new to recipient at end of to recipients with properties {address:toAddr}
    end tell
    send msg
  end tell
end run
EOF
echo "sent to $TO"
