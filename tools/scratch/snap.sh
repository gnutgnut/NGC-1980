#!/bin/sh
# serialised headless-Chrome runs (one browser at a time between the agents in this worktree)
cd "$(dirname "$0")/.." || exit 1
export CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh
exec flock scratch/browser.lock node snap.mjs "$@"
