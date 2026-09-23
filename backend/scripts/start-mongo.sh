#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_DIR="$ROOT_DIR/.mongo-data"
MONGO_BIN="${MONGO_BIN:-/tmp/mongodb/bin/mongod}"

if [ ! -x "$MONGO_BIN" ]; then
  echo "MongoDB binary not found at $MONGO_BIN"
  echo "Download it with:"
  echo "  curl -fsSL https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-7.0.15.tgz -o /tmp/mongo.tgz"
  echo "  tar -xzf /tmp/mongo.tgz -C /tmp && mv /tmp/mongodb-macos-x86_64-7.0.15 /tmp/mongodb"
  exit 1
fi

mkdir -p "$DATA_DIR"
"$MONGO_BIN" \
  --dbpath "$DATA_DIR" \
  --port 27017 \
  --bind_ip 127.0.0.1 \
  --logpath "$DATA_DIR/mongod.log" \
  --fork

echo "MongoDB started on mongodb://127.0.0.1:27017/pyquiz"
