#!/bin/sh
set -e
if [ "$(id -u)" = "0" ]; then
  for dir in /backups /run/reader /home/node/.claude; do
    if [ -d "$dir" ]; then chown node:node "$dir" 2>/dev/null || true; fi
  done
  # A sign-in written as root (docker compose exec) is repaired by a restart: everything in it becomes the app's.
  if [ -d /home/node/.claude ]; then chown -R node:node /home/node/.claude 2>/dev/null || true; fi
  # The app runs as node, so its home is node's: the same one a sign-in through "docker compose exec" uses.
  export HOME=/home/node
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
