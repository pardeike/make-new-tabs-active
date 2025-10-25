#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE_DIR_NAME="$(basename "$SCRIPT_DIR")"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST_PATH="$SCRIPT_DIR/manifest.json"

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "manifest.json not found at $MANIFEST_PATH" >&2
  exit 1
fi

VERSION=$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$MANIFEST_PATH" | head -n 1)
if [[ -z "$VERSION" ]]; then
  echo "Unable to determine version from manifest.json" >&2
  exit 1
fi

ARCHIVE_NAME="make-new-tabs-active-${VERSION}.zip"
ARCHIVE_PATH="$SCRIPT_DIR/$ARCHIVE_NAME"

cd "$PARENT_DIR"

js_files=()
while IFS= read -r -d '' file; do
  js_files+=("$file")
done < <(find "$ARCHIVE_DIR_NAME" -type f -name '*.js' -print0)

zip -q -FS "$ARCHIVE_PATH" "$ARCHIVE_DIR_NAME/manifest.json" "${js_files[@]}"
