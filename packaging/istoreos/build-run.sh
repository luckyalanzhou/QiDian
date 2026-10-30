#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd "$SCRIPT_DIR/../.." && pwd)
OUTPUT_DIR=${1:-"$ROOT_DIR/artifacts/istoreos"}
MAKESELF=${MAKESELF:-makeself}
VERSION=$(node -e 'const fs = require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).version)' "$ROOT_DIR/package.json")

if ! node -e 'const version = process.argv[1]; if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)) process.exit(1)' "$VERSION"; then
  printf 'Invalid package version: %s\n' "$VERSION" >&2
  exit 1
fi
command -v "$MAKESELF" >/dev/null 2>&1 || { printf 'Install makeself before packaging.\n' >&2; exit 1; }

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' 0
PAYLOAD="$TEMP_DIR/qidian"
mkdir -p "$PAYLOAD/root" "$OUTPUT_DIR"
cp "$ROOT_DIR/packaging/istoreos/compose.yaml" "$PAYLOAD/compose.yaml"
cp "$ROOT_DIR/packaging/istoreos/.env.example" "$PAYLOAD/.env.example"
cp -a "$ROOT_DIR/packaging/istoreos/luci-app-qidian/root/." "$PAYLOAD/root/"
cp "$ROOT_DIR/packaging/istoreos/install.sh" "$PAYLOAD/install.sh"
printf '%s\n' "$VERSION" > "$PAYLOAD/version"
chmod 755 "$PAYLOAD/install.sh"

OUTPUT_NAME=qidian-${VERSION}.run
OUTPUT="$OUTPUT_DIR/$OUTPUT_NAME"
"$MAKESELF" --gzip --sha256 --nox11 --needroot \
  "$PAYLOAD" "$OUTPUT" "栖点 ${VERSION} · iStoreOS Docker 安装包" ./install.sh
(cd "$OUTPUT_DIR" && sha256sum "$OUTPUT_NAME" > "$OUTPUT_NAME.sha256")
printf 'Created %s\n' "$OUTPUT"
