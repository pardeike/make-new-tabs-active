#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE_DIR_NAME="$(basename "$SCRIPT_DIR")"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST_PATH="$SCRIPT_DIR/manifest.json"
CHROME_BINARY="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_KEY="/Users/ap/Documents/ChromeDeveloperstorePrivateKey.pem"

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "manifest.json not found at $MANIFEST_PATH" >&2
  exit 1
fi

if [[ ! -x "$CHROME_BINARY" ]]; then
  echo "Google Chrome binary not found at $CHROME_BINARY" >&2
  exit 1
fi

if [[ ! -f "$CHROME_KEY" ]]; then
  echo "Chrome extension key not found at $CHROME_KEY" >&2
  exit 1
fi

VERSION=$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$MANIFEST_PATH" | head -n 1)
if [[ -z "$VERSION" ]]; then
  echo "Unable to determine version from manifest.json" >&2
  exit 1
fi

CRX_NAME="make-new-tabs-active-${VERSION}.crx"
CRX_PATH="$SCRIPT_DIR/$CRX_NAME"

TEMP_DIR=$(mktemp -d "$SCRIPT_DIR/.crx-build.XXXXXX")
cleanup() {
  rm -rf "$TEMP_DIR" "${TEMP_DIR}.crx" "${TEMP_DIR}.pem"
}
trap cleanup EXIT

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

for file_path in "${files[@]}"; do
  rel_path="${file_path#${ARCHIVE_DIR_NAME}/}"
  dest="$TEMP_DIR/$rel_path"
  mkdir -p "$(dirname "$dest")"
  cp "$file_path" "$dest"
done

(
  cd "$SCRIPT_DIR"
  "$CHROME_BINARY" --pack-extension="$TEMP_DIR" --pack-extension-key="$CHROME_KEY"
)

OUTPUT_CRX="${TEMP_DIR}.crx"
if [[ ! -f "$OUTPUT_CRX" ]]; then
  echo "Expected CRX not found at $OUTPUT_CRX" >&2
  exit 1
fi

mv -f "$OUTPUT_CRX" "$CRX_PATH"

if [[ -f "${TEMP_DIR}.pem" ]]; then
  rm -f "${TEMP_DIR}.pem"
fi

echo "Created $CRX_PATH"
