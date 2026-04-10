#!/bin/sh
set -e

# Start a tmux session with split panes:
#   Left  — Go backend
#   Right — Vite dev server (frontend)

tmux new-session -d -s main -n logs

# Left pane: backend
tmux send-keys -t main:logs './backend' Enter

# Right pane: frontend (Vite dev server)
tmux split-window -h -t main:logs
tmux send-keys -t main:logs 'cd /app/frontend && npx vite --host' Enter

# Attach so `docker run -it` shows the split view
exec tmux attach -t main
