#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
OUTPUT_DIR=${1:-"$ROOT_DIR/artifacts/istoreos"}
MAKESELF=${MAKESELF:-makeself}
VERSION=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$ROOT_DIR/package.json','utf8')).version)")

if [[ ! "$VERSION" =~ ^[0-9]\.[0-9]\.(0|[1-9][0-9]?)$ ]]; then
  echo "Invalid package version: $VERSION" >&2
  exit 1
fi
command -v "$MAKESELF" >/dev/null 2>&1 || { echo 'Install makeself before packaging.' >&2; exit 1; }

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
PAYLOAD="$TEMP_DIR/qidian"
mkdir -p "$PAYLOAD/root" "$OUTPUT_DIR"
cp "$ROOT_DIR/packaging/istoreos/compose.yaml" "$PAYLOAD/compose.yaml"
cp "$ROOT_DIR/packaging/istoreos/.env.example" "$PAYLOAD/.env.example"
cp -a "$ROOT_DIR/packaging/istoreos/luci-app-qidian/root/." "$PAYLOAD/root/"
cp "$ROOT_DIR/packaging/istoreos/install.sh" "$PAYLOAD/install.sh"
printf '%s\n' "$VERSION" > "$PAYLOAD/version"
chmod 755 "$PAYLOAD/install.sh"

OUTPUT="$OUTPUT_DIR/qidian-${VERSION}.run"
"$MAKESELF" --gzip --sha256 --nox11 --needroot \
  "$PAYLOAD" "$OUTPUT" "栖点 ${VERSION} · iStoreOS Docker 安装包" ./install.sh
(cd "$OUTPUT_DIR" && sha256sum "$(basename -- "$OUTPUT")" > "$(basename -- "$OUTPUT").sha256")
printf 'Created %s\n' "$OUTPUT"
