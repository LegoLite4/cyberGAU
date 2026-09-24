#!/bin/sh
set -e
i=0
until npx prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "prisma migrate deploy failed"
    exit 1
  fi
  sleep 2
done
node dist/index.js
