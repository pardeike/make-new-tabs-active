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

files=("$ARCHIVE_DIR_NAME/manifest.json")
while IFS= read -r -d '' file; do
  files+=("$file")
done < <(find "$ARCHIVE_DIR_NAME" -type f \
  \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -iname 'icon*.png' -o -path "${ARCHIVE_DIR_NAME}/_locales/*" \) \
  -print0)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files found to package" >&2
  exit 1
fi

zip -q -FS "$ARCHIVE_PATH" "${files[@]}"
